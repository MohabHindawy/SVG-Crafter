// generateSvg.js  —  SVG Crafter
// ---------------------------------------------------------------------------
// Pure function: config in -> self-contained SVG string out.
//   1. NO DOM access (textWidth is measured by the caller) -> easy to unit-test.
//   2. CSS + SMIL only, never <script> -> survives GitHub's image proxy.
//
// Every colourable feature (text / border / background) is a "paint":
//   solid:    { type:"solid",    color, opacity, brightness }
//   gradient: { type:"gradient", angle, stops:[{ color, opacity, brightness }] }
// Gradients can hold any number of ordered stops; the order IS the colour
// sequence. Brightness scales the RGB channels; opacity maps to *-opacity.
// ---------------------------------------------------------------------------

const FONT_STACK = "'Segoe UI', system-ui, -apple-system, Arial, sans-serif";

const op = (v) => Math.max(0, Math.min(100, Number(v))) / 100;
const round = (n, d = 3) => Number(n.toFixed(d));
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

// --- colour helpers --------------------------------------------------------
function hexToRgb(hex) {
  let h = String(hex).replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h, 16) || 0;
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
function rgbToHex(r, g, b) {
  return "#" + [r, g, b].map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, "0")).join("");
}
export function adjustBrightness(hex, brightness = 100) {
  if (brightness === 100) return hex;
  const f = brightness / 100;
  const { r, g, b } = hexToRgb(hex);
  return rgbToHex(r * f, g * f, b * f);
}

// --- gradient geometry: angle (deg, 0 = left->right, clockwise) -> endpoints
function angleToCoords(angle) {
  const a = (Number(angle) * Math.PI) / 180;
  const dx = Math.cos(a);
  const dy = Math.sin(a);
  return {
    x1: round(0.5 - dx / 2), y1: round(0.5 - dy / 2),
    x2: round(0.5 + dx / 2), y2: round(0.5 + dy / 2),
  };
}

// Resolve a paint into { fill, opacity }, pushing a <linearGradient> if needed.
function resolvePaint(paint, id, defs) {
  if (!paint) return { fill: "#000000", opacity: 1 };
  if (paint.type !== "gradient") {
    return { fill: adjustBrightness(paint.color, paint.brightness), opacity: op(paint.opacity) };
  }
  const stops = paint.stops || [];
  const c = angleToCoords(paint.angle || 0);
  const stopEls = stops
    .map((s, i) => {
      const offset = stops.length <= 1 ? 0 : round((i / (stops.length - 1)) * 100, 2);
      return `<stop offset="${offset}%" stop-color="${adjustBrightness(s.color, s.brightness)}" stop-opacity="${op(s.opacity)}"/>`;
    })
    .join("\n      ");
  defs.push(
    `<linearGradient id="${id}" x1="${c.x1}" y1="${c.y1}" x2="${c.x2}" y2="${c.y2}">
      ${stopEls}
    </linearGradient>`
  );
  return { fill: `url(#${id})`, opacity: 1 };
}

// A single representative colour/opacity (for the glow flood + typing cursor).
function paintMain(paint) {
  if (!paint) return { color: "#000000", opacity: 1 };
  if (paint.type !== "gradient") {
    return { color: adjustBrightness(paint.color, paint.brightness), opacity: op(paint.opacity) };
  }
  const s = paint.stops?.[0];
  return s ? { color: adjustBrightness(s.color, s.brightness), opacity: op(s.opacity) } : { color: "#000000", opacity: 1 };
}

export function generateSvg(config) {
  const {
    text = "Your Name",
    fontSize = 40,
    fontWeight = 700,
    animate = true,
    textPaint,
    border = false,
    borderWidth = 2,
    borderRadius = 14,
    borderPaint,
    bgPaint,
    glow = false,
    duration = 2,
    textWidth = 220,
  } = config;

  const padding = 28;
  const height = Math.round(fontSize * 2.2);
  const width = Math.round(textWidth + padding * 2);
  const baseline = Math.round(height / 2 + fontSize * 0.35);
  const cursorY = Math.round((height - fontSize) / 2);
  const safeText = escapeXml(text);

  const defs = [];
  const bg = resolvePaint(bgPaint, "bgPaint", defs);
  const txt = resolvePaint(textPaint, "textPaint", defs);
  const brd = border ? resolvePaint(borderPaint, "borderPaint", defs) : null;
  const main = paintMain(textPaint);

  if (glow) {
    const blur = Math.max(2, Math.round(fontSize / 12));
    defs.push(
      `<filter id="glow" x="-40%" y="-40%" width="180%" height="180%">
      <feDropShadow dx="0" dy="0" stdDeviation="${blur}" flood-color="${main.color}" flood-opacity="0.85"/>
    </filter>`
    );
  }

  const sw = border ? borderWidth : 0;
  const i = sw / 2;
  const bgRect =
    `<rect x="${i}" y="${i}" width="${width - sw}" height="${height - sw}" rx="${borderRadius}" ` +
    `fill="${bg.fill}" fill-opacity="${bg.opacity}"` +
    (brd ? ` stroke="${brd.fill}" stroke-opacity="${brd.opacity}" stroke-width="${borderWidth}"` : "") +
    `/>`;

  const textAttrs =
    `fill="${txt.fill}" fill-opacity="${txt.opacity}" ` +
    `font-family="${FONT_STACK}" font-size="${fontSize}" font-weight="${fontWeight}"` +
    (glow ? ` filter="url(#glow)"` : "");

  if (!animate) {
    const inner = [
      defs.length ? `<defs>\n    ${defs.join("\n    ")}\n  </defs>` : "",
      bgRect,
      `<text x="${padding}" y="${baseline}" ${textAttrs}>${safeText}</text>`,
    ]
      .filter(Boolean)
      .join("\n  ");
    return wrap(width, height, safeText, inner);
  }

  defs.push(
    `<clipPath id="reveal">
      <rect x="${padding}" y="0" width="0" height="${height}">
        <animate attributeName="width" from="0" to="${textWidth}" dur="${duration}s" fill="freeze" calcMode="linear"/>
      </rect>
    </clipPath>`
  );

  const inner = [
    `<style>
    .cursor { animation: blink 1s steps(1) infinite; }
    @keyframes blink { 50% { opacity: 0; } }
  </style>`,
    `<defs>\n    ${defs.join("\n    ")}\n  </defs>`,
    bgRect,
    `<text x="${padding}" y="${baseline}" ${textAttrs} clip-path="url(#reveal)">${safeText}</text>`,
    `<rect class="cursor" x="${padding}" y="${cursorY}" width="3" height="${fontSize}" fill="${main.color}" fill-opacity="${main.opacity}">
    <animate attributeName="x" from="${padding}" to="${padding + textWidth}" dur="${duration}s" fill="freeze" calcMode="linear"/>
  </rect>`,
  ].join("\n  ");

  return wrap(width, height, safeText, inner);
}

function wrap(width, height, label, inner) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${label}">
  ${inner}
</svg>`;
}

function escapeXml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}