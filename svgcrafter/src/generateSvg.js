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
const PADDING = 28;       // horizontal text inset used by auto-sizing

const op = (v) => Math.max(0, Math.min(100, Number(v))) / 100;
const round = (n, d = 3) => Number(Number(n).toFixed(d));
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

// The dimensions the banner takes when sized to fit the text. Exported so the
// UI can seed its width/height sliders with the live auto value (one formula,
// no drift between the app and the generator).
export function autoSize(sentences = [], fontSize = 40) {
  const widths = sentences.map((s) => s.width || 0);
  const maxWidth = Math.max(...widths, 40);
  return { width: Math.round(maxWidth + PADDING * 2), height: Math.round(fontSize * 2.2) };
}

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
  // Points are absolute x (sentence start offset + revealed width) so the
  // cursor lands correctly for centred / right / justified sentences.
  const cursorPts = [];
  for (const s of slots) for (const [t, w] of slotPoints(s)) cursorPts.push([s.S + t, (s.startX || 0) + w]);

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

// --- crossfade-style transitions (CSS @keyframes) --------------------------
// Sentences cycle on one shared loop. Each is shown for `hold`, then over
// `trans` the current sentence animates "out" while the next animates "in"
// (their windows overlap = crossfade). Built as per-sentence CSS @keyframes so
// it runs inside GitHub's proxied <img> (declarative, no JS) like the cursor.
function transitionStates(kind, width, fontSize) {
  const dx = round(width * 0.32, 1);
  const dy = round(fontSize * 0.9, 1);
  switch (kind) {
    case "zoom":
      return { enter: "opacity:0;transform:scale(0.82)", vis: "opacity:1;transform:scale(1)", exit: "opacity:0;transform:scale(0.82)" };
    case "slide":
      return { enter: `opacity:0;transform:translateX(${dx}px)`, vis: "opacity:1;transform:translateX(0)", exit: `opacity:0;transform:translateX(${-dx}px)` };
    case "rise":
      return { enter: `opacity:0;transform:translateY(${dy}px)`, vis: "opacity:1;transform:translateY(0)", exit: `opacity:0;transform:translateY(${-dy}px)` };
    case "blur":
      return { enter: "opacity:0;filter:blur(6px)", vis: "opacity:1;filter:blur(0)", exit: "opacity:0;filter:blur(6px)" };
    case "fade":
    default:
      return { enter: "opacity:0", vis: "opacity:1", exit: "opacity:0" };
  }
}

function buildTransitionCss(count, kind, hold, trans, width, fontSize) {
  const st = transitionStates(kind, width, fontSize);
  const S = hold + trans;
  const T = S * count;
  const pct = (t) => clamp(round((t / T) * 100, 3), 0, 100);
  const rules = [];
  for (let i = 0; i < count; i++) {
    const start = i * S;
    const tEnterEnd = start + trans;
    const tHoldEnd = start + S;
    const tExitEnd = tHoldEnd + trans;
    let frames;
    if (tExitEnd <= T + 1e-6) {
      frames = [
        [0, st.enter], [pct(start), st.enter], [pct(tEnterEnd), st.vis],
        [pct(tHoldEnd), st.vis], [pct(tExitEnd), st.exit], [100, st.enter],
      ];
    } else {
      // last sentence: its "out" wraps into the start of the loop
      frames = [
        [0, st.vis], [pct(tExitEnd - T), st.exit],
        [pct(start), st.enter], [pct(tEnterEnd), st.vis], [100, st.vis],
      ];
    }
    frames.sort((a, b) => a[0] - b[0]);
    const seen = new Map();             // dedupe coincident percents (last wins)
    for (const [p, decl] of frames) seen.set(p, decl);
    const stops = [...seen.entries()].map(([p, decl]) => `${p}% { ${decl} }`).join(" ");
    rules.push(`@keyframes tkf${i} { ${stops} }`);
  }
  const anims = Array.from({ length: count }, (_, i) => `.tt${i} { animation: tkf${i} ${round(T, 2)}s ease-in-out infinite; }`).join(" ");
  const css = `.tt { transform-box: fill-box; transform-origin: center; }\n    ${rules.join("\n    ")}\n    ${anims}`;
  return { css, dur: T };
}

export function generateSvg(config) {
  const {
    sentences = [{ text: "Your Name", width: 220, prefixes: [] }],
    fontSize = 40,
    fontWeight = 700,
    fontFamily = FONT_STACK,
    embedFont = null,        // { family, dataUrl, format } -> embedded @font-face
    transition = "typing",   // none | typing | fade | zoom | slide | rise | blur
    transitionDuration = 0.6, // seconds, for the crossfade-style transitions
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
    autoWidth = true,        // false -> use bannerWidth
    bannerWidth = 600,
    autoHeight = true,       // false -> use bannerHeight
    bannerHeight = 120,
    linkUrl = "",            // wraps the SVG in a clickable <a>
  } = config;

  const live = sentences.filter((s) => s.text && s.text.length);
  const list = live.length ? live : [{ text: " ", width: 40, prefixes: [0, 40] }];
  const padding = PADDING;
  const auto = autoSize(list, fontSize);
  const width = autoWidth ? auto.width : Math.round(clamp(Number(bannerWidth) || auto.width, 80, 4000));
  const height = autoHeight ? auto.height : Math.round(clamp(Number(bannerHeight) || auto.height, 40, 2000));
  const baseline = Math.round(height / 2 + fontSize * 0.35);
  const cursorY = Math.round((height - fontSize) / 2);

  // Per-sentence alignment geometry. The banner width hugs the longest
  // sentence, so shorter sentences have room to sit left / centre / right
  // within the content band. "justify" stretches a multi-word sentence to
  // fill the band via textLength + lengthAdjust="spacing"; the per-character
  // prefixes are widened by the same uniform spacing so the letter-by-letter
  // reveal still lands ~on character boundaries. Anchor stays fixed: each
  // sentence renders at its final aligned x and reveals left-to-right.
  const contentWidth = width - padding * 2;
  const geo = list.map((s) => {
    const align = s.align || "left";
    const canJustify = align === "justify" && /\s/.test(s.text) && s.width < contentWidth;
    const renderWidth = canJustify ? contentWidth : s.width;
    const extra = renderWidth - s.width;
    const N = Math.max(1, (s.text || "").length);
    const slack = Math.max(0, contentWidth - renderWidth);
    let startX = padding;
    if (align === "center") startX = padding + slack / 2;
    else if (align === "right") startX = padding + slack;
    return {
      text: s.text,
      width: renderWidth,
      prefixes: (s.prefixes || []).map((p, k) => p + extra * (k / N)),
      align,
      justified: canJustify,
      startX: round(startX, 2),
    };
  });
  const justifyAttr = (g) => (g.justified ? ` textLength="${round(g.width, 2)}" lengthAdjust="spacing"` : "");

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
    `font-family="${fontFamily}" font-size="${fontSize}" font-weight="${fontWeight}"` +
    (glow ? ` filter="url(#glow)"` : "");

  // A fetched font is embedded (base64) so the SVG renders identically
  // everywhere (GitHub's proxy won't fetch external fonts). embedFont.css is the
  // ready-to-inline @font-face rule built by the app.
  const fontFaceCss = embedFont && embedFont.css ? embedFont.css : "";
  const styleBlock = (parts) => {
    const body = parts.filter(Boolean).join("\n    ");
    return body ? `<style>\n    ${body}\n  </style>` : "";
  };

  const liveCount = list.length;

  // ---- typing transition (SMIL clip engine) --------------------------------
  if (transition === "typing") {
    const mode = typingMode === "char" ? "char" : "smooth";
    const calcMode = mode === "char" ? "discrete" : "linear";
    const { T, perSentence, cursorPts } = buildTimeline(geo, mode, holdDuration, Math.max(0.1, Number(typingSpeed) || 1));

    const texts = [];
    geo.forEach((s, i) => {
      const a = toAnim(perSentence[i], T);
      defs.push(`<clipPath id="clip${i}">
      <rect x="${s.startX}" y="0" width="0" height="${height}">
        <animate attributeName="width" values="${a.values}" keyTimes="${a.keyTimes}" dur="${round(T, 2)}s" calcMode="${calcMode}" repeatCount="indefinite"/>
      </rect>
    </clipPath>`);
      texts.push(`<text x="${s.startX}" y="${baseline}" ${textAttrs}${justifyAttr(s)} clip-path="url(#clip${i})">${escapeXml(s.text)}</text>`);
    });

    let cursorEl = "";
    let cursorCss = "";
    if (cursor) {
      const ca = toAnim(cursorPts, T); // points are already absolute x
      cursorCss = `.cursor { animation: blink 1s steps(1) infinite; }
    @keyframes blink { 50% { opacity: 0; } }`;
      cursorEl = `<rect class="cursor" x="${geo[0].startX}" y="${cursorY}" width="3" height="${fontSize}" fill="${main.color}" fill-opacity="${main.opacity}">
    <animate attributeName="x" values="${ca.values}" keyTimes="${ca.keyTimes}" dur="${round(T, 2)}s" calcMode="${calcMode}" repeatCount="indefinite"/>
  </rect>`;
    }

    const inner = [
      styleBlock([fontFaceCss, cursorCss]),
      `<defs>\n    ${defs.join("\n    ")}\n  </defs>`,
      bgRect,
      ...texts,
      cursorEl,
    ].filter(Boolean).join("\n  ");
    return wrap(width, height, geo[0].text, inner, linkUrl);
  }

  // ---- single sentence, non-typing: nothing to cycle, render it static -----
  if (liveCount <= 1) {
    const g0 = geo[0];
    const inner = [
      styleBlock([fontFaceCss]),
      defs.length ? `<defs>\n    ${defs.join("\n    ")}\n  </defs>` : "",
      bgRect,
      `<text x="${g0.startX}" y="${baseline}" ${textAttrs}${justifyAttr(g0)}>${escapeXml(g0.text)}</text>`,
    ].filter(Boolean).join("\n  ");
    return wrap(width, height, g0.text, inner, linkUrl);
  }

  // ---- crossfade-style transitions (CSS keyframes) -------------------------
  // "none" is a near-instant cut (a tiny, non-zero duration keeps the keyframe
  // stops distinct so the held state doesn't interpolate into a slow fade).
  const trans = transition === "none" ? 0.05 : clamp(Number(transitionDuration) || 0.6, 0.05, 3);
  const { css: transCss } = buildTransitionCss(liveCount, transition, Math.max(0.1, Number(holdDuration) || 1.5), trans, width, fontSize);
  const transTexts = geo.map(
    (s, i) => `<text class="tt tt${i}" x="${s.startX}" y="${baseline}" ${textAttrs}${justifyAttr(s)}>${escapeXml(s.text)}</text>`
  );
  const inner = [
    styleBlock([fontFaceCss, transCss]),
    defs.length ? `<defs>\n    ${defs.join("\n    ")}\n  </defs>` : "",
    bgRect,
    ...transTexts,
  ].filter(Boolean).join("\n  ");
  return wrap(width, height, geo[0].text, inner, linkUrl);
}

function wrap(width, height, label, inner, linkUrl = "") {
  const link = normalizeUrl(linkUrl);
  const body = link
    ? `<a href="${escapeXml(link)}" xlink:href="${escapeXml(link)}" target="_blank" rel="noopener">
    ${inner}
  </a>`
    : inner;
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(label)}">
  ${body}
</svg>`;
}

// Accept bare domains by defaulting to https; pass through http/https/mailto.
export function normalizeUrl(url) {
  const u = String(url || "").trim();
  if (!u) return "";
  if (/^(https?:|mailto:)/i.test(u)) return u;
  return "https://" + u.replace(/^\/+/, "");
}

function escapeXml(s) {
  return String(s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}