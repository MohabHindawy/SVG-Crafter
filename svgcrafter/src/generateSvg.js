// generateSvg.js  —  SVG Crafter
// ---------------------------------------------------------------------------
// Pure function: config in -> self-contained SVG string out.
//   1. NO DOM access (text widths are measured by the caller) -> unit-testable.
//   2. CSS + SMIL only, never <script> -> survives GitHub's image proxy.
//
// Animation engine supports:
//   - multiple sentences that type in, hold, delete, then cycle (looping)
//   - two typing modes: "smooth" (clip reveal) and "char" (one letter at a time)
//   - an optional blinking cursor that follows the typing edge
// Every colour is a "paint" (solid or multi-stop gradient with direction).
// ---------------------------------------------------------------------------

const FONT_STACK = "'Segoe UI', system-ui, -apple-system, Arial, sans-serif";
const CHAR_TYPE = 0.13;   // seconds per character while typing
const CHAR_DELETE = 0.07; // seconds per character while deleting

const op = (v) => Math.max(0, Math.min(100, Number(v))) / 100;
const round = (n, d = 3) => Number(Number(n).toFixed(d));
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
function angleToCoords(angle) {
  const a = (Number(angle) * Math.PI) / 180;
  const dx = Math.cos(a), dy = Math.sin(a);
  return { x1: round(0.5 - dx / 2), y1: round(0.5 - dy / 2), x2: round(0.5 + dx / 2), y2: round(0.5 + dy / 2) };
}
// Optional gradient animation: rotate around centre, or slide along its axis.
function gradientAnim(paint, c) {
  const mode = paint.anim || "none";
  if (mode === "none") return { spread: "", el: "" };
  const speed = clamp(Number(paint.animSpeed) || 3, 1, 10);
  const reverse = !!paint.animReverse;
  if (mode === "rotate") {
    const dur = round(24 / speed, 2);
    const from = reverse ? "360 0.5 0.5" : "0 0.5 0.5";
    const to = reverse ? "0 0.5 0.5" : "360 0.5 0.5";
    return {
      spread: "",
      el: `\n      <animateTransform attributeName="gradientTransform" type="rotate" from="${from}" to="${to}" dur="${dur}s" repeatCount="indefinite"/>`,
    };
  }
  // move: translate by one full period along the gradient vector (seamless w/ repeat)
  const dur = round(18 / speed, 2);
  let dx = round(c.x2 - c.x1, 4), dy = round(c.y2 - c.y1, 4);
  if (reverse) { dx = -dx; dy = -dy; }
  return {
    spread: ` spreadMethod="repeat"`,
    el: `\n      <animateTransform attributeName="gradientTransform" type="translate" from="0 0" to="${dx} ${dy}" dur="${dur}s" repeatCount="indefinite"/>`,
  };
}

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
  const a = gradientAnim(paint, c);
  defs.push(`<linearGradient id="${id}" x1="${c.x1}" y1="${c.y1}" x2="${c.x2}" y2="${c.y2}"${a.spread}>
      ${stopEls}${a.el}
    </linearGradient>`);
  return { fill: `url(#${id})`, opacity: 1 };
}
function paintMain(paint) {
  if (!paint) return { color: "#000000", opacity: 1 };
  if (paint.type !== "gradient") return { color: adjustBrightness(paint.color, paint.brightness), opacity: op(paint.opacity) };
  const s = paint.stops?.[0];
  return s ? { color: adjustBrightness(s.color, s.brightness), opacity: op(s.opacity) } : { color: "#000000", opacity: 1 };
}

// --- typing timeline -------------------------------------------------------
// Builds, for each sentence, the (time,width) control points of its clip rect
// across one full loop, plus a single cursor path that follows the active edge.
function buildTimeline(sentences, mode, holdDuration, speed = 1) {
  const isChar = mode === "char";
  const ct = CHAR_TYPE / speed;
  const cd = CHAR_DELETE / speed;
  const slots = sentences.map((s) => {
    const N = Math.max(1, s.text.length);
    const typeDur = N * ct;
    const delDur = N * cd;
    return { ...s, N, typeDur, delDur, D: typeDur + holdDuration + delDur };
  });
  const T = slots.reduce((a, s) => a + s.D, 0) || 1;
  let acc = 0;
  slots.forEach((s) => { s.S = acc; acc += s.D; });

  const prefix = (s, k) => {
    const P = s.prefixes || [];
    return P[clamp(k, 0, P.length - 1)] ?? (s.width * (k / s.N));
  };

  const slotPoints = (s) => {
    const pts = [];
    if (isChar) {
      for (let k = 0; k <= s.N; k++) pts.push([k * ct, prefix(s, k)]);
    } else {
      pts.push([0, 0], [s.typeDur, s.width]);
    }
    const holdEnd = s.typeDur + holdDuration;
    pts.push([holdEnd, s.width]);
    if (isChar) {
      for (let k = s.N - 1; k >= 0; k--) pts.push([holdEnd + (s.N - k) * cd, prefix(s, k)]);
    } else {
      pts.push([holdEnd + s.delDur, 0]);
    }
    return pts;
  };

  const toFull = (s) => {
    const full = [];
    if (s.S > 1e-6) full.push([0, 0]);
    for (const [t, w] of slotPoints(s)) full.push([s.S + t, w]);
    if (s.S + s.D < T - 1e-6) full.push([T, 0]);
    return full;
  };

  // Cursor follows whichever sentence is active (slots are contiguous).
  const cursorPts = [];
  for (const s of slots) for (const [t, w] of slotPoints(s)) cursorPts.push([s.S + t, w]);

  return { T, slots, perSentence: slots.map(toFull), cursorPts };
}

// Turn (time,value) points into SMIL keyTimes/values arrays over [0,T].
function toAnim(points, T, valueFn = (w) => w) {
  const cleaned = [];
  for (const [t, w] of points) {
    const tt = clamp(t, 0, T);
    if (cleaned.length && Math.abs(cleaned[cleaned.length - 1][0] - tt) < 1e-6) {
      cleaned[cleaned.length - 1][1] = w;
    } else cleaned.push([tt, w]);
  }
  if (cleaned[0][0] > 1e-6) cleaned.unshift([0, cleaned[0][1]]);
  if (Math.abs(cleaned[cleaned.length - 1][0] - T) > 1e-6) cleaned.push([T, cleaned[cleaned.length - 1][1]]);
  const keyTimes = cleaned.map(([t]) => round(t / T, 6));
  const values = cleaned.map(([, w]) => round(valueFn(w), 1));
  for (let i = 1; i < keyTimes.length; i++) if (keyTimes[i] <= keyTimes[i - 1]) keyTimes[i] = Math.min(1, keyTimes[i - 1] + 1e-6);
  keyTimes[0] = 0;
  keyTimes[keyTimes.length - 1] = 1;
  return { keyTimes: keyTimes.join(";"), values: values.join(";") };
}

export function generateSvg(config) {
  const {
    sentences = [{ text: "Your Name", width: 220, prefixes: [] }],
    fontSize = 40,
    fontWeight = 700,
    animate = true,
    typingMode = "smooth",
    typingSpeed = 1,
    cursor = true,
    holdDuration = 1.5,
    textPaint,
    border = false,
    borderWidth = 2,
    borderRadius = 14,
    borderPaint,
    bgPaint,
    glow = false,
  } = config;

  const live = sentences.filter((s) => s.text && s.text.length);
  const list = live.length ? live : [{ text: " ", width: 40, prefixes: [0, 40] }];
  const padding = 28;
  const maxWidth = Math.max(...list.map((s) => s.width), 40);
  const width = Math.round(maxWidth + padding * 2);
  const height = Math.round(fontSize * 2.2);
  const baseline = Math.round(height / 2 + fontSize * 0.35);
  const cursorY = Math.round((height - fontSize) / 2);

  const defs = [];
  const bg = resolvePaint(bgPaint, "bgPaint", defs);
  const txt = resolvePaint(textPaint, "textPaint", defs);
  const brd = border ? resolvePaint(borderPaint, "borderPaint", defs) : null;
  const main = paintMain(textPaint);

  if (glow) {
    const blur = Math.max(2, Math.round(fontSize / 12));
    defs.push(`<filter id="glow" x="-40%" y="-40%" width="180%" height="180%">
      <feDropShadow dx="0" dy="0" stdDeviation="${blur}" flood-color="${main.color}" flood-opacity="0.85"/>
    </filter>`);
  }

  const sw = border ? borderWidth : 0;
  const inset = sw / 2;
  const bgRect =
    `<rect x="${inset}" y="${inset}" width="${width - sw}" height="${height - sw}" rx="${borderRadius}" ` +
    `fill="${bg.fill}" fill-opacity="${bg.opacity}"` +
    (brd ? ` stroke="${brd.fill}" stroke-opacity="${brd.opacity}" stroke-width="${borderWidth}"` : "") +
    `/>`;

  const textAttrs =
    `fill="${txt.fill}" fill-opacity="${txt.opacity}" ` +
    `font-family="${FONT_STACK}" font-size="${fontSize}" font-weight="${fontWeight}"` +
    (glow ? ` filter="url(#glow)"` : "");

  // --- static ----------------------------------------------------------------
  if (!animate) {
    const inner = [
      defs.length ? `<defs>\n    ${defs.join("\n    ")}\n  </defs>` : "",
      bgRect,
      `<text x="${padding}" y="${baseline}" ${textAttrs}>${escapeXml(list[0].text)}</text>`,
    ].filter(Boolean).join("\n  ");
    return wrap(width, height, list[0].text, inner);
  }

  // --- animated --------------------------------------------------------------
  const mode = typingMode === "char" ? "char" : "smooth";
  const calcMode = mode === "char" ? "discrete" : "linear";
  const { T, perSentence, cursorPts } = buildTimeline(list, mode, holdDuration, Math.max(0.1, Number(typingSpeed) || 1));

  const texts = [];
  list.forEach((s, i) => {
    const a = toAnim(perSentence[i], T);
    defs.push(`<clipPath id="clip${i}">
      <rect x="${padding}" y="0" width="0" height="${height}">
        <animate attributeName="width" values="${a.values}" keyTimes="${a.keyTimes}" dur="${round(T, 2)}s" calcMode="${calcMode}" repeatCount="indefinite"/>
      </rect>
    </clipPath>`);
    texts.push(`<text x="${padding}" y="${baseline}" ${textAttrs} clip-path="url(#clip${i})">${escapeXml(s.text)}</text>`);
  });

  let cursorEl = "";
  let styleEl = "";
  if (cursor) {
    const ca = toAnim(cursorPts, T, (w) => padding + w);
    styleEl = `<style>
    .cursor { animation: blink 1s steps(1) infinite; }
    @keyframes blink { 50% { opacity: 0; } }
  </style>`;
    cursorEl = `<rect class="cursor" x="${padding}" y="${cursorY}" width="3" height="${fontSize}" fill="${main.color}" fill-opacity="${main.opacity}">
    <animate attributeName="x" values="${ca.values}" keyTimes="${ca.keyTimes}" dur="${round(T, 2)}s" calcMode="${calcMode}" repeatCount="indefinite"/>
  </rect>`;
  }

  const inner = [
    styleEl,
    `<defs>\n    ${defs.join("\n    ")}\n  </defs>`,
    bgRect,
    ...texts,
    cursorEl,
  ].filter(Boolean).join("\n  ");

  return wrap(width, height, list[0].text, inner);
}

function wrap(width, height, label, inner) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(label)}">
  ${inner}
</svg>`;
}

function escapeXml(s) {
  return String(s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}