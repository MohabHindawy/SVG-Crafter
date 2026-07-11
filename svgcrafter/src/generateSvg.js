// generateSvg.js  —  SVG Crafter
// ---------------------------------------------------------------------------
// Pure function: config in -> self-contained SVG string out.
//   1. NO DOM access (text widths are measured by the caller) -> unit-testable.
//   2. CSS + SMIL only, never <script> -> survives GitHub's image proxy.
// ---------------------------------------------------------------------------

const FONT_STACK = "'Segoe UI', system-ui, -apple-system, Arial, sans-serif";
const CHAR_TYPE = 0.13;
const CHAR_DELETE = 0.07;
const PADDING = 28;

const op = (v) => Math.max(0, Math.min(100, Number(v))) / 100;
const round = (n, d = 3) => Number(Number(n).toFixed(d));
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

export function autoSize(sentences = [], fontSize = 40) {
  const widths = sentences.map((s) => s.width || 0);
  const maxWidth = Math.max(...widths, 40);
  return { width: Math.round(maxWidth + PADDING * 2), height: Math.round(fontSize * 2.2) };
}

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
  // reflect tiling: seamless loop, no hard stop-boundary seam
  const dur = round(36 / speed, 2);
  let dx = round(2 * (c.x2 - c.x1), 4), dy = round(2 * (c.y2 - c.y1), 4);
  if (reverse) { dx = -dx; dy = -dy; }
  return {
    spread: ` spreadMethod="reflect"`,
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

// ---- typing timeline -------------------------------------------------------
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

  const cursorPts = [];
  for (const s of slots) for (const [t, w] of slotPoints(s)) cursorPts.push([s.S + t, (s.startX || 0) + w]);
  return { T, slots, perSentence: slots.map(toFull), cursorPts };
}

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
      frames = [
        [0, st.vis], [pct(tExitEnd - T), st.exit],
        [pct(start), st.enter], [pct(tEnterEnd), st.vis], [100, st.vis],
      ];
    }
    frames.sort((a, b) => a[0] - b[0]);
    const seen = new Map();
    for (const [p, decl] of frames) seen.set(p, decl);
    const stops = [...seen.entries()].map(([p, decl]) => `${p}% { ${decl} }`).join(" ");
    rules.push(`@keyframes tkf${i} { ${stops} }`);
  }
  const anims = Array.from({ length: count }, (_, i) => `.tt${i} { animation: tkf${i} ${round(T, 2)}s ease-in-out infinite; }`).join(" ");
  const css = `.tt { transform-box: fill-box; transform-origin: center; }\n    ${rules.join("\n    ")}\n    ${anims}`;
  return { css, dur: T };
}


function seededRand(seed) {
  let s = (seed >>> 0) || 1;
  const next = () => { s = Math.imul(s, 48271) >>> 0; return s / 4294967296; };
  // Burn-in: a Lehmer LCG's first outputs are ~proportional to a small seed,
  // which biased every effect's first random draw toward 0. Warm it up.
  for (let i = 0; i < 5; i++) next();
  return next;
}

// ── 1. LIGHTNING ─────────────────────────────────────────────────────────────
// Real bolt shapes: jagged polylines striking downward from the top edge, each
// with a short branch and a soft glow underlay. Flicker is a CSS double-flash
// with steps(1). Groups start opacity="0" and use NEGATIVE animation delays so
// every bolt is already mid-cycle at load — no first-frame flash.
function buildLightning(cfg, W, H, br) {
  const color  = cfg.color  || "#a78bfa";
  const o      = op(cfg.opacity  ?? 85);
  const speed  = clamp(Number(cfg.speed)  || 5, 1, 10);
  const bolts  = clamp(Math.round(cfg.bolts ?? 3), 1, 6);
  const jitter = clamp(Number(cfg.jitter) || 8, 2, 20);

  const cycle = round(9 / speed + 1.5, 2); // full flicker period per bolt
  const core  = adjustBrightness(color, 165);
  const defs  = [`<clipPath id="ltClip"><rect width="${W}" height="${H}" rx="${br}"/></clipPath>`];
  const els   = [];
  const css   = [];

  // Bolt spawns from a random EDGE (top / left / right / bottom) at a random
  // position along it, striking inward. dir = unit vector into the banner;
  // perp = unit vector for zigzag jitter.
  function boltPoints(r) {
    const edgeRoll = r();
    let ox, oy, dir, perp, span;
    if (edgeRoll < 0.4) {        // top → down
      ox = W * (0.08 + r() * 0.84); oy = -3;
      dir = [0, 1]; perp = [1, 0]; span = H;
    } else if (edgeRoll < 0.6) { // bottom → up
      ox = W * (0.08 + r() * 0.84); oy = H + 3;
      dir = [0, -1]; perp = [1, 0]; span = H;
    } else if (edgeRoll < 0.8) { // left → right
      ox = -3; oy = H * (0.15 + r() * 0.7);
      dir = [1, 0]; perp = [0, 1]; span = W * 0.55;
    } else {                     // right → left
      ox = W + 3; oy = H * (0.15 + r() * 0.7);
      dir = [-1, 0]; perp = [0, 1]; span = W * 0.55;
    }
    const segs  = 6 + Math.floor(r() * 3);          // 6-8 kinks
    const depth = span * (0.7 + r() * 0.28);        // strike depth into banner
    const lean  = (r() - 0.5) * 2;                  // overall sideways lean
    const pts = [[round(ox, 1), round(oy, 1)]];
    let off = 0;
    for (let i = 1; i <= segs; i++) {
      const along = (i / segs) * depth;
      off += lean * (jitter * 0.4) + (r() - 0.5) * jitter * 2.2;
      pts.push([
        round(ox + dir[0] * along + perp[0] * off, 1),
        round(oy + dir[1] * along + perp[1] * off, 1),
      ]);
    }
    return { pts, dir, perp };
  }
  const toPoly = (pts) => pts.map((p) => `${p[0]},${p[1]}`).join(" ");

  for (let b = 0; b < bolts; b++) {
    const r  = seededRand(211 + b * 53);
    const { pts: main, dir, perp } = boltPoints(r);

    // Branch: fork off a mid point, shorter and thinner, diverging sideways
    const fi = 2 + Math.floor(r() * (main.length - 4));
    const side = r() < 0.5 ? -1 : 1;
    const branch = [main[fi]];
    let bx = main[fi][0], by = main[fi][1];
    for (let k = 1; k <= 3; k++) {
      const sideStep  = side * jitter * (0.8 + r() * 1.2);
      const alongStep = Math.min(W, H) * 0.08 * (0.6 + r() * 0.8);
      bx += perp[0] * sideStep + dir[0] * alongStep;
      by += perp[1] * sideStep + dir[1] * alongStep;
      branch.push([round(bx, 1), round(by, 1)]);
    }

    const sw = round(1.2 + r() * 0.9, 2);
    const shape = (pts, w, col, alpha) =>
      `<polyline points="${toPoly(pts)}" fill="none" stroke="${col}" stroke-width="${w}" stroke-opacity="${alpha}" stroke-linejoin="round" stroke-linecap="round"/>`;

    // Double-flash flicker: on → dim → on → off, then dark for the rest.
    const g = `lt${b}`;
    const delay = round(-(r() * cycle), 2); // negative: staggered, mid-cycle at load
    css.push(
      `@keyframes ${g}f{0%{opacity:0}3%{opacity:1}6%{opacity:.25}9%{opacity:1}14%{opacity:0}100%{opacity:0}}`,
      `.${g}{animation:${g}f ${cycle}s ${delay}s steps(1,end) infinite}`
    );

    els.push(
      `<g class="${g}" opacity="0" clip-path="url(#ltClip)">` +
      shape(main, sw * 3.2, color, round(o * 0.25, 3)) +   // glow underlay
      shape(branch, sw * 0.7, color, round(o * 0.8, 3)) +  // branch
      shape(main, sw, core, round(o, 3)) +                 // bright core
      `</g>`
    );
  }

  return { defs, els, css: css.join("\n    ") };
}

// ── 2. SOUND WAVES ───────────────────────────────────────────────────────────
// Sine waves that TRAVEL horizontally: SMIL animates `d` through a full phase
// cycle (0 → 2π in quarter steps, linear) so crests glide across the banner
// instead of flapping in place. Alternating rows travel in opposite directions.
function buildSoundWaves(cfg, W, H, br) {
  const color  = cfg.color     || "#38bdf8";
  const o      = op(cfg.opacity ?? 45);
  const speed  = clamp(Number(cfg.speed) || 4, 1, 10);
  const count  = clamp(Math.round(cfg.count ?? 4), 1, 8);
  const sw     = clamp(Number(cfg.strokeWidth) || 1.5, 0.5, 4);

  const dur  = round(14 / speed, 2);
  const defs = [`<clipPath id="swClip"><rect width="${W}" height="${H}" rx="${br}"/></clipPath>`];
  const els  = [];
  const rand = seededRand(77);

  function wavePath(cy, amp, phase, cycles, steps = 48) {
    const pts = [];
    for (let i = 0; i <= steps; i++) {
      const x = round((i / steps) * W, 1);
      const y = round(cy + amp * Math.sin((i / steps) * Math.PI * 2 * cycles + phase), 2);
      pts.push(i === 0 ? `M ${x} ${y}` : `L ${x} ${y}`);
    }
    return pts.join(" ");
  }

  els.push(`<g clip-path="url(#swClip)">`);
  for (let i = 0; i < count; i++) {
    const t = count <= 1 ? 0.5 : i / (count - 1);
    const cy     = round(H * (0.22 + t * 0.56), 1);
    const amp    = round(H * (0.05 + rand() * 0.05), 1);
    const cycles = round(1.5 + rand() * 1.5, 2);
    const waveO  = round(o * (0.45 + (1 - t) * 0.55), 3);
    const rowDur = round(dur * (0.8 + rand() * 0.5), 2);
    const dirSign = i % 2 === 0 ? 1 : -1; // alternate travel direction

    // Phase steps: equal quarters of a full cycle → constant travel speed
    const states = [0, 1, 2, 3, 4]
      .map((k) => wavePath(cy, amp, dirSign * k * (Math.PI / 2), cycles))
      .join(";");

    els.push(
      `<path d="${wavePath(cy, amp, 0, cycles)}" fill="none" stroke="${color}" ` +
      `stroke-width="${sw}" stroke-opacity="${waveO}" stroke-linecap="round">` +
      `<animate attributeName="d" values="${states}" dur="${rowDur}s" begin="${round(-rand() * rowDur, 2)}s" repeatCount="indefinite" calcMode="linear"/>` +
      `</path>`
    );
  }
  els.push(`</g>`);

  return { defs, els, css: "" };
}

// ── 3. PARTICLES ─────────────────────────────────────────────────────────────
// Circles drifting upward on a gentle S-curve, fading in/out. Baseline
// opacity="0" + negative begin → every particle mid-flight at load, no flash.
function buildParticles(cfg, W, H, br) {
  const color = cfg.color  || "#f472b6";
  const o     = op(cfg.opacity ?? 70);
  const speed = clamp(Number(cfg.speed) || 3, 1, 10);
  const count = clamp(Math.round(cfg.count ?? 15), 3, 40);
  const size  = clamp(Number(cfg.size) || 3, 1, 10);

  const rand    = seededRand(55);
  const baseDur = round(18 / speed, 2);
  const defs = [`<clipPath id="ptClip"><rect width="${W}" height="${H}" rx="${br}"/></clipPath>`];
  const els = [`<g clip-path="url(#ptClip)">`];

  for (let i = 0; i < count; i++) {
    const cx    = round(rand() * W, 1);
    const cy    = round(H * (0.55 + rand() * 0.5), 1);   // start low, some below edge
    const r     = round(size * (0.4 + rand() * 0.8), 1);
    const dur   = round(baseDur * (0.55 + rand() * 0.75), 2);
    const begin = round(-(rand() * dur), 2);              // negative: mid-cycle at load
    const sway  = round((rand() - 0.5) * W * 0.18, 1);
    const riseY = round(-(H * (0.75 + rand() * 0.45)), 1);
    const pO    = round(o * (0.55 + rand() * 0.45), 3);

    els.push(
      `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${color}" opacity="0">` +
      `<animateTransform attributeName="transform" type="translate" ` +
      `values="0 0;${round(sway * 0.7, 1)} ${round(riseY * 0.5, 1)};${round(sway * 0.2, 1)} ${riseY}" ` +
      `keyTimes="0;0.5;1" dur="${dur}s" begin="${begin}s" repeatCount="indefinite" calcMode="linear"/>` +
      `<animate attributeName="opacity" values="0;${pO};${pO};0" keyTimes="0;0.12;0.65;1" dur="${dur}s" begin="${begin}s" repeatCount="indefinite"/>` +
      `</circle>`
    );
  }
  els.push(`</g>`);

  return { defs, els, css: "" };
}

// ── 4. SCANLINES ─────────────────────────────────────────────────────────────
// Fine CRT grid (clipped to the rounded banner) + a soft glowing beam sweeping
// top → bottom. Beam uses a NEGATIVE begin so it's mid-sweep at load.
function buildScanlines(cfg, W, H, br) {
  const color   = cfg.color      || "#ffffff";
  const o       = op(cfg.opacity  ?? 18);
  const speed   = clamp(Number(cfg.speed) || 3, 1, 10);
  const lineGap = clamp(Math.round(cfg.lineGap   ?? 4), 2, 20);
  const beamH   = clamp(Math.round(cfg.beamHeight ?? 36), 8, 100);

  const dur  = round(9 / speed, 2);
  const defs = [];
  const els  = [];

  const gradId = "scBeamGrad";
  const clipId = "scClip";
  defs.push(
    `<linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">` +
    `<stop offset="0%" stop-color="${color}" stop-opacity="0"/>` +
    `<stop offset="45%" stop-color="${color}" stop-opacity="${round(o * 1.6, 3)}"/>` +
    `<stop offset="55%" stop-color="${color}" stop-opacity="${round(o * 1.6, 3)}"/>` +
    `<stop offset="100%" stop-color="${color}" stop-opacity="0"/>` +
    `</linearGradient>`,
    `<clipPath id="${clipId}"><rect width="${W}" height="${H}" rx="${br}"/></clipPath>`
  );

  // Static grid — clipped so lines don't poke past rounded corners
  const lineEls = [];
  for (let y = lineGap; y < H; y += lineGap) {
    lineEls.push(`<line x1="0" y1="${y}" x2="${W}" y2="${y}" stroke="${color}" stroke-width="0.5" stroke-opacity="${round(o * 0.45, 3)}"/>`);
  }

  const travel = H + beamH * 2;
  els.push(
    `<g clip-path="url(#${clipId})">` +
    `<g>${lineEls.join("")}</g>` +
    `<rect x="0" y="${-beamH}" width="${W}" height="${beamH}" fill="url(#${gradId})">` +
    `<animateTransform attributeName="transform" type="translate" from="0 0" to="0 ${travel}" dur="${dur}s" begin="${round(-dur * 0.45, 2)}s" repeatCount="indefinite"/>` +
    `</rect>` +
    `</g>`
  );

  return { defs, els, css: "" };
}

// ── 5. SHIMMER ───────────────────────────────────────────────────────────────
// Diagonal gloss sweep with a dwell: the beam crosses in the first 40% of the
// period, then rests off-screen. keyTimes-based SMIL, negative begin.
function buildShimmer(cfg, W, H, br) {
  const color = cfg.color      || "#ffffff";
  const o     = op(cfg.opacity  ?? 55);
  const speed = clamp(Number(cfg.speed) || 3, 1, 10);
  const beamW = clamp(Math.round(cfg.beamWidth ?? 100), 20, 300);

  const period = round(16 / speed, 2);
  const defs = [];
  const els  = [];

  const gradId = "shimGrad";
  const clipId = "shimClip";
  defs.push(
    `<linearGradient id="${gradId}" x1="0" y1="0" x2="1" y2="0">` +
    `<stop offset="0%"   stop-color="${color}" stop-opacity="0"/>` +
    `<stop offset="38%"  stop-color="${color}" stop-opacity="${round(o * 0.45, 3)}"/>` +
    `<stop offset="50%"  stop-color="${color}" stop-opacity="${round(o, 3)}"/>` +
    `<stop offset="62%"  stop-color="${color}" stop-opacity="${round(o * 0.45, 3)}"/>` +
    `<stop offset="100%" stop-color="${color}" stop-opacity="0"/>` +
    `</linearGradient>`,
    `<clipPath id="${clipId}"><rect width="${W}" height="${H}" rx="${br}"/></clipPath>`
  );

  const skewRad = 20 * Math.PI / 180;
  const extraX  = Math.round(H * Math.tan(skewRad));
  const startX  = -(beamW + extraX);
  const travel  = W + beamW + extraX * 2;

  els.push(
    `<g clip-path="url(#${clipId})">` +
    `<g transform="skewX(-20)">` +
    `<rect x="${startX}" y="0" width="${beamW}" height="${H}" fill="url(#${gradId})">` +
    `<animateTransform attributeName="transform" type="translate" ` +
    `values="0 0;${travel} 0;${travel} 0" keyTimes="0;0.4;1" ` +
    `dur="${period}s" begin="${round(-period * 0.15, 2)}s" repeatCount="indefinite" ` +
    `calcMode="spline" keySplines="0.35 0 0.65 1;0 0 1 1"/>` +
    `</rect>` +
    `</g>` +
    `</g>`
  );

  return { defs, els, css: "" };
}

// ── 6. PULSE RINGS ───────────────────────────────────────────────────────────
// Ellipses expanding from center with a quick pop-in then long fade.
// Baseline stroke-opacity="0" + negative begin → rings mid-expand at load.
function buildPulseRings(cfg, W, H, br) {
  const color = cfg.color  || "#818cf8";
  const o     = op(cfg.opacity ?? 60);
  const speed = clamp(Number(cfg.speed) || 3, 1, 10);
  const count = clamp(Math.round(cfg.count ?? 3), 1, 8);
  const sw    = clamp(Number(cfg.strokeWidth) || 1.5, 0.5, 4);

  const dur   = round(10 / speed, 2);
  const cx    = round(W / 2, 1);
  const cy    = round(H / 2, 1);
  const maxRx = round(W / 2 + sw * 2, 1);
  const maxRy = round(H / 2 + sw * 2, 1);
  const defs  = [`<clipPath id="prClip"><rect width="${W}" height="${H}" rx="${br}"/></clipPath>`];
  const els   = [`<g clip-path="url(#prClip)">`];

  for (let i = 0; i < count; i++) {
    const begin = round(-(i / count) * dur, 2); // negative stagger
    els.push(
      `<ellipse cx="${cx}" cy="${cy}" rx="2" ry="2" fill="none" stroke="${color}" stroke-width="${sw}" stroke-opacity="0">` +
      `<animate attributeName="rx" values="2;${maxRx}" dur="${dur}s" begin="${begin}s" repeatCount="indefinite" calcMode="spline" keySplines="0.25 0 0.65 1"/>` +
      `<animate attributeName="ry" values="2;${maxRy}" dur="${dur}s" begin="${begin}s" repeatCount="indefinite" calcMode="spline" keySplines="0.25 0 0.65 1"/>` +
      `<animate attributeName="stroke-opacity" values="0;${round(o, 3)};${round(o * 0.6, 3)};0" keyTimes="0;0.08;0.55;1" dur="${dur}s" begin="${begin}s" repeatCount="indefinite"/>` +
      `</ellipse>`
    );
  }
  els.push(`</g>`);

  return { defs, els, css: "" };
}

// ── 7. MATRIX RAIN ───────────────────────────────────────────────────────────
// Falling dotted columns with bright head dots. One shared clip group; every
// column uses a NEGATIVE begin so the rain is already falling at load.
function buildMatrixRain(cfg, W, H, br) {
  const color   = cfg.color    || "#4ade80";
  const o       = op(cfg.opacity ?? 55);
  const speed   = clamp(Number(cfg.speed) || 5, 1, 10);
  const columns = clamp(Math.round(cfg.columns ?? 12), 3, 30);
  const dotSize = clamp(Number(cfg.dotSize) || 3, 1, 8);

  const rand    = seededRand(13);
  const baseDur = round(14 / speed, 2);
  const head    = adjustBrightness(color, 150);
  const defs    = [`<clipPath id="mrClip"><rect width="${W}" height="${H}" rx="${br}"/></clipPath>`];
  const els     = [`<g clip-path="url(#mrClip)">`];

  for (let i = 0; i < columns; i++) {
    const cellW  = W / columns;
    const cx     = round((i + 0.2 + rand() * 0.6) * cellW, 1); // jittered off the grid
    const colH   = round(H * (0.35 + rand() * 0.55), 1);
    const dur    = round(baseDur * (0.55 + rand() * 0.7), 2);
    const begin  = round(-(rand() * dur), 2);                   // negative: mid-fall
    const colO   = round(o * (0.45 + rand() * 0.55), 3);
    const dashOn  = round(dotSize * 0.9, 1);
    const dashOff = round(dotSize * 1.4, 1);
    const startY  = -colH;
    const travel  = round(H + colH, 1);

    els.push(
      `<line x1="${cx}" y1="${startY}" x2="${cx}" y2="0" ` +
      `stroke="${color}" stroke-width="${round(dotSize * 0.5, 1)}" stroke-opacity="${colO}" ` +
      `stroke-dasharray="${dashOn} ${dashOff}" stroke-linecap="round">` +
      `<animateTransform attributeName="transform" type="translate" from="0 0" to="0 ${travel}" dur="${dur}s" begin="${begin}s" repeatCount="indefinite"/>` +
      `</line>` +
      `<circle cx="${cx}" cy="0" r="${round(dotSize * 0.6, 1)}" fill="${head}" fill-opacity="${round(Math.min(1, colO * 1.9), 3)}">` +
      `<animateTransform attributeName="transform" type="translate" from="0 0" to="0 ${travel}" dur="${dur}s" begin="${begin}s" repeatCount="indefinite"/>` +
      `</circle>`
    );
  }
  els.push(`</g>`);

  return { defs, els, css: "" };
}

// ── Hue helper (local) ───────────────────────────────────────────────────────
// Rotate a hex colour's hue by `deg` degrees. Used by confetti/aurora to build
// small palettes anchored to the user's chosen colour.
function hueShift(hex, deg) {
  const { r, g, b } = hexToRgb(hex);
  const rf = r / 255, gf = g / 255, bf = b / 255;
  const mx = Math.max(rf, gf, bf), mn = Math.min(rf, gf, bf);
  const l = (mx + mn) / 2;
  let h = 0, s = 0;
  if (mx !== mn) {
    const d = mx - mn;
    s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    if (mx === rf) h = ((gf - bf) / d + (gf < bf ? 6 : 0)) / 6;
    else if (mx === gf) h = ((bf - rf) / d + 2) / 6;
    else h = ((rf - gf) / d + 4) / 6;
  }
  h = (h + deg / 360 + 1) % 1;
  const hue2 = (p, q, t) => {
    t = (t + 1) % 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  let r2, g2, b2;
  if (s === 0) { r2 = g2 = b2 = l; }
  else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r2 = hue2(p, q, h + 1 / 3); g2 = hue2(p, q, h); b2 = hue2(p, q, h - 1 / 3);
  }
  return rgbToHex(r2 * 255, g2 * 255, b2 * 255);
}

// ── 8. BORDER BEAM ───────────────────────────────────────────────────────────
// Glowing comet(s) orbiting the banner's border. A rounded rect with
// pathLength="100" gets a dash pattern; SMIL animates stroke-dashoffset so the
// dash travels around the perimeter. Three stacked strokes (wide faint glow,
// mid tail, bright head segment) fake a fading comet tail.
function buildBorderBeam(cfg, W, H, br) {
  const color = cfg.color || "#38bdf8";
  const o     = op(cfg.opacity ?? 90);
  const speed = clamp(Number(cfg.speed) || 4, 1, 10);
  const count = clamp(Math.round(cfg.count ?? 1), 1, 4);
  const thick = clamp(Number(cfg.thickness) || 3, 1, 8);

  const seg   = 100 / count;
  // Clamp tail so adjacent comets never run into each other.
  const tail  = Math.min(clamp(Number(cfg.tailLength) || 18, 5, 40), round(seg * 0.8, 2));

  const dur   = round(24 / speed, 2);
  const head  = adjustBrightness(color, 165);
  const inset = thick / 2 + 0.5;
  const rx    = Math.max(0, br - inset);
  const rectAttrs = `x="${round(inset, 1)}" y="${round(inset, 1)}" width="${round(W - inset * 2, 1)}" height="${round(H - inset * 2, 1)}" rx="${round(rx, 1)}" fill="none" pathLength="100" stroke-linecap="round"`;

  // A dash of length `len` occupies path positions [-offset, -offset + len];
  // animating the offset downward moves it FORWARD along the path. Every layer
  // sets offset = len - tail so all leading edges align at position `tail` —
  // the bright head sits at the FRONT and longer, fainter layers trail behind.
  const layer = (len, w, col, alpha) => {
    const on    = round(Math.min(len, seg * 0.9), 2);
    const shift = round(on - tail, 2);
    return (
      `<rect ${rectAttrs} stroke="${col}" stroke-width="${round(w, 2)}" stroke-opacity="${round(alpha, 3)}" ` +
      `stroke-dasharray="${on} ${round(seg - on, 2)}">` +
      `<animate attributeName="stroke-dashoffset" from="${shift}" to="${round(shift - 100, 2)}" dur="${dur}s" repeatCount="indefinite"/>` +
      `</rect>`
    );
  };

  // Clip to the banner's rounded rect so the wide glow stroke can't spill
  // outside the shape (the "transparent border" halo at high thickness).
  const defs = [`<clipPath id="bbClip"><rect width="${W}" height="${H}" rx="${br}"/></clipPath>`];
  const els = [
    `<g clip-path="url(#bbClip)">`,
    layer(tail,        thick * 2.4, color, o * 0.16),   // soft glow underlay
    layer(tail,        thick,       color, o * 0.22),   // faint far tail
    layer(tail * 0.62, thick,       color, o * 0.4),    // mid tail
    layer(tail * 0.34, thick,       color, o * 0.65),   // near tail
    layer(tail * 0.14, thick,       head,  o),          // bright head (front)
    `</g>`,
  ];

  return { defs, els, css: "" };
}

// ── 9. SPARKLES ──────────────────────────────────────────────────────────────
// Classic 4-point star sparkles that twinkle in place: scale pop + opacity
// pulse, staggered with negative begins. Baseline opacity="0" → no flash.
function buildSparkles(cfg, W, H, br) {
  const color = cfg.color || "#fde047";
  const o     = op(cfg.opacity ?? 85);
  const speed = clamp(Number(cfg.speed) || 4, 1, 10);
  const count = clamp(Math.round(cfg.count ?? 10), 3, 30);
  const size  = clamp(Number(cfg.size) || 5, 2, 12);

  const rand    = seededRand(313);
  const baseDur = round(9 / speed, 2);
  const defs = [`<clipPath id="spClip"><rect width="${W}" height="${H}" rx="${br}"/></clipPath>`];
  const els  = [`<g clip-path="url(#spClip)">`];

  // Concave 4-point star centred on the origin, radius s
  const starPath = (s) => {
    const q = round(s * 0.18, 2);
    return `M 0 ${-s} Q ${q} ${-q} ${s} 0 Q ${q} ${q} 0 ${s} Q ${-q} ${q} ${-s} 0 Q ${-q} ${-q} 0 ${-s} Z`;
  };

  for (let i = 0; i < count; i++) {
    const x     = round(W * (0.04 + rand() * 0.92), 1);
    const y     = round(H * (0.1 + rand() * 0.8), 1);
    const s     = round(size * (0.5 + rand() * 0.8), 2);
    const dur   = round(baseDur * (0.6 + rand() * 0.9), 2);
    const begin = round(-(rand() * dur), 2);
    const pO    = round(o * (0.6 + rand() * 0.4), 3);
    const rot   = Math.round(rand() * 90);

    els.push(
      `<g transform="translate(${x} ${y}) rotate(${rot})">` +
      `<path d="${starPath(s)}" fill="${color}" opacity="0">` +
      `<animateTransform attributeName="transform" type="scale" values="0.25;1;0.25" keyTimes="0;0.5;1" dur="${dur}s" begin="${begin}s" repeatCount="indefinite" calcMode="spline" keySplines="0.4 0 0.6 1;0.4 0 0.6 1"/>` +
      `<animate attributeName="opacity" values="0;${pO};0" keyTimes="0;0.5;1" dur="${dur}s" begin="${begin}s" repeatCount="indefinite"/>` +
      `</path>` +
      `</g>`
    );
  }
  els.push(`</g>`);

  return { defs, els, css: "" };
}

// ── 10. CONFETTI ─────────────────────────────────────────────────────────────
// Small rectangles tumbling downward with sideways sway. A 4-colour palette is
// derived from the base colour via hue rotation. Pieces start above the banner
// (clipped) and use negative begins → already raining at load.
function buildConfetti(cfg, W, H, br) {
  const color = cfg.color || "#f472b6";
  const o     = op(cfg.opacity ?? 90);
  const speed = clamp(Number(cfg.speed) || 4, 1, 10);
  const count = clamp(Math.round(cfg.count ?? 18), 5, 40);
  const size  = clamp(Number(cfg.size) || 5, 2, 10);

  const rand    = seededRand(97);
  const baseDur = round(16 / speed, 2);
  const palette = [color, hueShift(color, 45), hueShift(color, -45), hueShift(color, 160)];
  const defs = [`<clipPath id="cfClip"><rect width="${W}" height="${H}" rx="${br}"/></clipPath>`];
  const els  = [`<g clip-path="url(#cfClip)">`];

  for (let i = 0; i < count; i++) {
    const x     = round(W * rand(), 1);
    const w     = round(size * (0.6 + rand() * 0.7), 1);
    const h     = round(w * (0.4 + rand() * 0.3), 1);
    const col   = palette[Math.floor(rand() * palette.length)];
    const dur   = round(baseDur * (0.55 + rand() * 0.8), 2);
    const begin = round(-(rand() * dur), 2);
    const sway  = round((rand() - 0.5) * W * 0.15, 1);
    const drop  = round(H + size * 4, 1);
    const y0    = round(-size * 2, 1);
    const spin  = round(240 + rand() * 480, 0) * (rand() < 0.5 ? -1 : 1);
    const pO    = round(o * (0.7 + rand() * 0.3), 3);

    els.push(
      `<g transform="translate(${x} ${y0})">` +
      `<g>` +
      `<animateTransform attributeName="transform" type="translate" values="0 0;${sway} ${round(drop * 0.5, 1)};0 ${drop}" keyTimes="0;0.5;1" dur="${dur}s" begin="${begin}s" repeatCount="indefinite" calcMode="linear"/>` +
      `<rect x="${round(-w / 2, 1)}" y="${round(-h / 2, 1)}" width="${w}" height="${h}" rx="${round(h * 0.2, 1)}" fill="${col}" fill-opacity="${pO}">` +
      `<animateTransform attributeName="transform" type="rotate" from="0 0 0" to="${spin} 0 0" dur="${dur}s" begin="${begin}s" repeatCount="indefinite"/>` +
      `</rect>` +
      `</g>` +
      `</g>`
    );
  }
  els.push(`</g>`);

  return { defs, els, css: "" };
}

// ── 11. AURORA ───────────────────────────────────────────────────────────────
// Soft, blurred colour blobs drifting slowly behind the text — northern-lights
// haze. Blobs use hue-shifted shades of the base colour, a shared Gaussian
// blur, slow SMIL drift and gentle opacity breathing. Negative begins.
function buildAurora(cfg, W, H, br) {
  const color = cfg.color || "#22d3ee";
  const o     = op(cfg.opacity ?? 45);
  const speed = clamp(Number(cfg.speed) || 2, 1, 10);
  const blobs = clamp(Math.round(cfg.blobs ?? 3), 1, 4);
  const size  = clamp(Number(cfg.size) || 60, 30, 120);   // % of banner height

  const rand    = seededRand(41);
  const baseDur = round(40 / speed, 2);
  const blur    = round(Math.max(6, H * 0.12), 1);
  const shades  = [color, hueShift(color, 60), hueShift(color, -60), hueShift(color, 120)];
  const defs = [
    `<filter id="auBlur" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="${blur}"/></filter>`,
    `<clipPath id="auClip"><rect width="${W}" height="${H}" rx="${br}"/></clipPath>`,
  ];
  const els = [`<g clip-path="url(#auClip)">`];

  for (let i = 0; i < blobs; i++) {
    const col   = shades[i % shades.length];
    const cx    = round(W * ((i + 0.5) / blobs + (rand() - 0.5) * 0.15), 1);
    const cy    = round(H * (0.35 + rand() * 0.35), 1);
    const ry    = round(H * (size / 100) * (0.45 + rand() * 0.25), 1);
    const rx    = round(ry * (1.6 + rand() * 0.9), 1);
    const dur   = round(baseDur * (0.7 + rand() * 0.6), 2);
    const begin = round(-(rand() * dur), 2);
    const dx    = round(W * (0.1 + rand() * 0.12) * (i % 2 === 0 ? 1 : -1), 1);
    const dy    = round(H * 0.08 * (rand() < 0.5 ? 1 : -1), 1);
    const pO    = round(o * (0.55 + rand() * 0.45), 3);

    els.push(
      `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${col}" opacity="0" filter="url(#auBlur)">` +
      `<animateTransform attributeName="transform" type="translate" values="0 0;${dx} ${dy};0 0" dur="${dur}s" begin="${begin}s" repeatCount="indefinite" calcMode="spline" keySplines="0.4 0 0.6 1;0.4 0 0.6 1"/>` +
      `<animate attributeName="opacity" values="${round(pO * 0.55, 3)};${pO};${round(pO * 0.55, 3)}" dur="${round(dur * 0.5, 2)}s" begin="${begin}s" repeatCount="indefinite"/>` +
      `</ellipse>`
    );
  }
  els.push(`</g>`);

  return { defs, els, css: "" };
}

// ── 12. Blur light ────────────────────────────────────────────────────────────────
// Soft out-of-focus orbs drifting slowly upward. Three shared Gaussian blur
// levels fake depth of field; opacity breathing + negative begins, no flash.
function buildBlurlight(cfg, W, H, br) {
  const color = cfg.color || "#fbbf24";
  const o     = op(cfg.opacity ?? 45);
  const speed = clamp(Number(cfg.speed) || 2, 1, 10);
  const count = clamp(Math.round(cfg.count ?? 10), 3, 25);
  const size  = clamp(Number(cfg.size) || 10, 4, 24);

  const rand    = seededRand(929);
  const baseDur = round(30 / speed, 2);
  const blurs   = [round(H * 0.015, 1), round(H * 0.04, 1), round(H * 0.08, 1)];
  const defs = [
    `<clipPath id="bkClip"><rect width="${W}" height="${H}" rx="${br}"/></clipPath>`,
    ...blurs.map((b, i) =>
      `<filter id="bkBlur${i}" x="-120%" y="-120%" width="340%" height="340%"><feGaussianBlur stdDeviation="${b}"/></filter>`),
  ];
  const els = [`<g clip-path="url(#bkClip)">`];

  for (let i = 0; i < count; i++) {
    const depth = i % 3;                                   // 0 sharp … 2 blurry
    const x     = round(W * (0.04 + rand() * 0.92), 1);
    const y     = round(H * (0.35 + rand() * 0.6), 1);
    const r     = round(size * (0.5 + rand() * 1.1) * (1 + depth * 0.45), 1);
    const dy    = round(-H * (0.25 + rand() * 0.3), 1);
    const dx    = round(W * (rand() - 0.5) * 0.06, 1);
    const dur   = round(baseDur * (0.7 + rand() * 0.7), 2);
    const begin = round(-(rand() * dur), 2);
    const pO    = round(o * (0.45 + rand() * 0.55) * (1 - depth * 0.18), 3);

    els.push(
      `<circle cx="${x}" cy="${y}" r="${r}" fill="${color}" opacity="0" filter="url(#bkBlur${depth})">` +
      `<animateTransform attributeName="transform" type="translate" values="0 0;${dx} ${dy}" dur="${dur}s" begin="${begin}s" repeatCount="indefinite"/>` +
      `<animate attributeName="opacity" values="0;${pO};${pO};0" keyTimes="0;0.2;0.75;1" dur="${dur}s" begin="${begin}s" repeatCount="indefinite"/>` +
      `</circle>`
    );
  }
  els.push(`</g>`);

  return { defs, els, css: "" };
}

// ── 13. SYNTHWAVE GRID ───────────────────────────────────────────────────────
// Retro 3D wireframe floor: static verticals fan out from a vanishing point,
// horizontal lines scroll toward the viewer along a quadratic (perspective)
// easing sampled into SMIL `values`. A vertical fade gradient on the strokes
// dissolves everything into the horizon. Negative begins pre-bake positions.
function buildSynthGrid(cfg, W, H, br) {
  const color = cfg.color || "#ff2d95";
  const o     = op(cfg.opacity ?? 55);
  const speed = clamp(Number(cfg.speed) || 4, 1, 10);
  const cols  = clamp(Math.round(cfg.columns ?? 7), 3, 12);   // per side
  const rows  = clamp(Math.round(cfg.rows ?? 5), 2, 8);

  const yH   = round(H * 0.52, 1);        // horizon
  const cx   = round(W / 2, 1);
  const dur  = round(10 / speed, 2);
  const defs = [
    `<clipPath id="sgClip"><rect width="${W}" height="${H}" rx="${br}"/></clipPath>`,
    `<linearGradient id="sgFade" gradientUnits="userSpaceOnUse" x1="0" y1="${yH}" x2="0" y2="${H}">` +
    `<stop offset="0" stop-color="${color}" stop-opacity="0"/>` +
    `<stop offset="0.25" stop-color="${color}" stop-opacity="${round(o * 0.55, 3)}"/>` +
    `<stop offset="1" stop-color="${color}" stop-opacity="${round(o, 3)}"/>` +
    `</linearGradient>`,
  ];
  const els = [`<g clip-path="url(#sgClip)">`];

  // Static converging verticals (mirrored around the centre).
  const spread = W / (cols * 0.9);
  for (let i = -cols; i <= cols; i++) {
    if (i === 0) continue;
    const bx = round(cx + i * spread, 1);
    els.push(`<line x1="${cx}" y1="${yH}" x2="${bx}" y2="${H}" stroke="url(#sgFade)" stroke-width="1"/>`);
  }
  // Horizon glow line.
  els.push(`<line x1="0" y1="${yH}" x2="${W}" y2="${yH}" stroke="${color}" stroke-opacity="${round(o * 0.5, 3)}" stroke-width="1.5"/>`);

  // Scrolling horizontals: y(t) = yH + (H − yH)·t², sampled for SMIL.
  const samples = 13;
  const ys = [];
  for (let k = 0; k < samples; k++) {
    const t = k / (samples - 1);
    ys.push(round(yH + (H - yH) * t * t, 1));
  }
  const vals = ys.join(";");
  for (let rI = 0; rI < rows; rI++) {
    const begin = round(-(rI / rows) * dur, 2);
    els.push(
      `<line x1="0" y1="${yH}" x2="${W}" y2="${yH}" stroke="url(#sgFade)" stroke-width="1.4">` +
      `<animate attributeName="y1" values="${vals}" dur="${dur}s" begin="${begin}s" repeatCount="indefinite" calcMode="linear"/>` +
      `<animate attributeName="y2" values="${vals}" dur="${dur}s" begin="${begin}s" repeatCount="indefinite" calcMode="linear"/>` +
      `</line>`
    );
  }
  els.push(`</g>`);

  return { defs, els, css: "" };
}

// ── 14. STARFIELD (WARP) ─────────────────────────────────────────────────────
// Streaks shooting from the centre to the edges — hyperspace jump. Each ray is
// a line with pathLength="100"; a short dash travels start→end via animated
// stroke-dashoffset with an ease-in spline (accelerating outward). Dash starts
// fully off-path (offset = streak length) → invisible baseline, no flash.
function buildStarfield(cfg, W, H, br) {
  const color  = cfg.color || "#dbeafe";
  const o      = op(cfg.opacity ?? 70);
  const speed  = clamp(Number(cfg.speed) || 5, 1, 10);
  const count  = clamp(Math.round(cfg.count ?? 18), 6, 40);
  const streak = clamp(Number(cfg.streak) || 14, 5, 30);   // % of ray length

  const rand    = seededRand(1201);
  const baseDur = round(7 / speed, 2);
  const cx = round(W / 2, 1), cy = round(H / 2, 1);
  const R  = Math.hypot(W / 2, H / 2) * 1.02;
  const defs = [`<clipPath id="stClip"><rect width="${W}" height="${H}" rx="${br}"/></clipPath>`];
  const els  = [`<g clip-path="url(#stClip)">`];

  for (let i = 0; i < count; i++) {
    const ang = (i / count) * Math.PI * 2 + rand() * 0.5;
    const r0  = R * (0.04 + rand() * 0.06);
    const x1  = round(cx + Math.cos(ang) * r0, 1);
    const y1  = round(cy + Math.sin(ang) * r0, 1);
    const x2  = round(cx + Math.cos(ang) * R, 1);
    const y2  = round(cy + Math.sin(ang) * R, 1);
    const on  = round(streak * (0.7 + rand() * 0.6), 2);
    const dur = round(baseDur * (0.6 + rand() * 0.9), 2);
    const begin = round(-(rand() * dur), 2);
    const sw  = round(0.8 + rand() * 1.4, 2);
    const pO  = round(o * (0.5 + rand() * 0.5), 3);

    els.push(
      `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" pathLength="100" fill="none" ` +
      `stroke="${color}" stroke-width="${sw}" stroke-opacity="${pO}" stroke-linecap="round" ` +
      `stroke-dasharray="${on} ${round(100 - on, 2)}" stroke-dashoffset="${on}">` +
      `<animate attributeName="stroke-dashoffset" values="${on};-100" dur="${dur}s" begin="${begin}s" repeatCount="indefinite" calcMode="spline" keySplines="0.55 0 0.9 0.6"/>` +
      `</line>`
    );
  }
  els.push(`</g>`);

  return { defs, els, css: "" };
}

// ── 15. CRT VIGNETTE ─────────────────────────────────────────────────────────
// Radial darkening toward the edges + a subtle discrete opacity flicker, like
// a failing CRT. Renders last in the effect stack so it sits over the other
// effects. Pairs with scanlines.
function buildVignette(cfg, W, H, br) {
  const color   = cfg.color || "#000000";
  const o       = op(cfg.opacity ?? 60);
  const speed   = clamp(Number(cfg.speed) || 5, 1, 10);
  const flicker = clamp(Number(cfg.flicker ?? 25), 0, 100) / 100;

  const defs = [
    `<radialGradient id="vgGrad" cx="50%" cy="50%" r="72%">` +
    `<stop offset="0" stop-color="${color}" stop-opacity="0"/>` +
    `<stop offset="0.55" stop-color="${color}" stop-opacity="0"/>` +
    `<stop offset="1" stop-color="${color}" stop-opacity="${round(o, 3)}"/>` +
    `</radialGradient>`,
  ];

  let anim = "";
  if (flicker > 0) {
    const rand = seededRand(547);
    const dur  = round(9 / speed, 2);
    const n    = 18;
    const vals = [], times = [];
    for (let k = 0; k < n; k++) {
      vals.push(round(1 - rand() * flicker * 0.5, 3));
      times.push(round(k / n, 3));
    }
    vals.push(vals[0]); times.push(1);
    anim = `<animate attributeName="opacity" values="${vals.join(";")}" keyTimes="${times.join(";")}" dur="${dur}s" repeatCount="indefinite" calcMode="discrete"/>`;
  }

  const els = [`<rect width="${W}" height="${H}" rx="${br}" fill="url(#vgGrad)">${anim}</rect>`];

  return { defs, els, css: "" };
}

// ── Text motion (per-sentence) ───────────────────────────────────────────────
// A subtle looping transform applied to a <g> WRAPPING each text element, so it
// composes cleanly with the text's own transition (clip-path for typing, CSS
// transforms for crossfades) instead of fighting it. Returns { className, css }
// or null for "none". amplitude scales with font size so motion reads the same
// at any size. Uses ease-in-out keyframes for organic, non-mechanical motion.

function buildMotion(id, index, fontSize, speed = 1) {
  if (!id || id === "none") return null;
  const A = Math.max(3, fontSize * 0.14);          // base amplitude in px
  const spd = clamp(Number(speed) || 1, 0.25, 4);
  const dur = round(4 / spd, 2);                   // slower = calmer
  const name = `mv${index}`;
  // Slight per-sentence phase offset so stacked lines don't move in lockstep.
  const delay = round(-(index * 0.35), 2);
  let frames;
  switch (id) {
    case "float": // diagonal drifting loop
      frames = `0%{transform:translate(0,0)}25%{transform:translate(${round(A * 0.6, 1)}px,${round(-A, 1)}px)}50%{transform:translate(0,${round(-A * 0.4, 1)}px)}75%{transform:translate(${round(-A * 0.6, 1)}px,${round(-A, 1)}px)}100%{transform:translate(0,0)}`;
      break;
    case "bob": // vertical up/down
      frames = `0%,100%{transform:translateY(${round(A, 1)}px)}50%{transform:translateY(${round(-A, 1)}px)}`;
      break;
    case "sway": // horizontal left/right
      frames = `0%,100%{transform:translateX(${round(-A * 1.3, 1)}px)}50%{transform:translateX(${round(A * 1.3, 1)}px)}`;
      break;
    case "pulse": // gentle zoom in/out
      frames = `0%,100%{transform:scale(1)}50%{transform:scale(1.06)}`;
      break;
    case "wobble": // rocking rotation
      frames = `0%,100%{transform:rotate(-2.2deg)}50%{transform:rotate(2.2deg)}`;
      break;
    case "orbit": // small circular path
      frames = `0%{transform:translate(${round(A, 1)}px,0)}25%{transform:translate(0,${round(A, 1)}px)}50%{transform:translate(${round(-A, 1)}px,0)}75%{transform:translate(0,${round(-A, 1)}px)}100%{transform:translate(${round(A, 1)}px,0)}`;
      break;
    default:
      return null;
  }
  const timing = id === "pulse" || id === "wobble" || id === "bob" || id === "sway"
    ? "ease-in-out" : "linear";
  const css =
    `@keyframes ${name}{${frames}}` +
    `.${name}{animation:${name} ${dur}s ${delay}s ${timing} infinite;` +
    // transform-box keeps scale/rotate centred on the text's own box, not the
    // SVG origin, so pulse/wobble/orbit pivot around the glyphs.
    `transform-box:fill-box;transform-origin:center;}`;
  return { className: name, css };
}

// ── Master dispatcher ────────────────────────────────────────────────────────
function buildEffects(effects, W, H, br) {
  if (!effects || !effects.length) return { defs: [], els: [], css: "" };
  const allDefs = [], allEls = [], allCss = [];

  for (const eff of effects) {
    if (!eff || !eff.enabled) continue;
    let r = null;
    if (eff.id === "lightning")  r = buildLightning(eff,  W, H, br);
    if (eff.id === "soundwaves") r = buildSoundWaves(eff, W, H, br);
    if (eff.id === "particles")  r = buildParticles(eff,  W, H, br);
    if (eff.id === "scanlines")  r = buildScanlines(eff,  W, H, br);
    if (eff.id === "shimmer")    r = buildShimmer(eff,    W, H, br);
    if (eff.id === "pulserings") r = buildPulseRings(eff, W, H, br);
    if (eff.id === "matrixrain") r = buildMatrixRain(eff, W, H, br);
    if (eff.id === "borderbeam") r = buildBorderBeam(eff, W, H, br);
    if (eff.id === "sparkles")   r = buildSparkles(eff,   W, H, br);
    if (eff.id === "confetti")   r = buildConfetti(eff,   W, H, br);
    if (eff.id === "aurora")     r = buildAurora(eff,     W, H, br);
    if (eff.id === "blurlight")  r = buildBlurlight(eff,  W, H, br);
    if (eff.id === "synthgrid")  r = buildSynthGrid(eff,  W, H, br);
    if (eff.id === "starfield")  r = buildStarfield(eff,  W, H, br);
    if (eff.id === "vignette")   r = buildVignette(eff,   W, H, br);
    if (!r) continue;
    allDefs.push(...r.defs);
    allEls.push(...r.els);
    if (r.css) allCss.push(r.css);
  }

  return { defs: allDefs, els: allEls, css: allCss.join("\n    ") };
}

export function generateSvg(config) {
  const {
    sentences = [{ text: "Your Name", width: 220, prefixes: [] }],
    fontSize = 40,
    fontWeight = 700,
    fontFamily = FONT_STACK,
    embedFont = null,
    transition = "typing",
    transitionDuration = 0.6,
    typingMode = "smooth",
    typingSpeed = 1,
    cursor = true,
    holdDuration = 1.5,
    textPaint,
    motionSpeed = 1,
    border = false,
    borderWidth = 2,
    borderRadius = 14,
    borderPaint,
    bgPaint,
    glow = false,
    autoWidth = true,
    bannerWidth = 600,
    autoHeight = true,
    bannerHeight = 120,
    linkUrl = "",
    effects = [],
  } = config;

  const live = sentences.filter((s) => s.text && s.text.length);
  const list = live.length ? live : [{ text: " ", width: 40, prefixes: [0, 40] }];
  const padding = PADDING;
  const auto = autoSize(list, fontSize);
  const width = autoWidth ? auto.width : Math.round(clamp(Number(bannerWidth) || auto.width, 80, 4000));
  const height = autoHeight ? auto.height : Math.round(clamp(Number(bannerHeight) || auto.height, 40, 2000));
  const baseline = Math.round(height / 2 + fontSize * 0.35);
  const cursorY = Math.round((height - fontSize) / 2);
  const br = Math.min(Number(borderRadius) || 0, width / 2, height / 2);

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
      motion: s.motion || "none",
      justified: canJustify,
      startX: round(startX, 2),
    };
  });
  const justifyAttr = (g) => (g.justified ? ` textLength="${round(g.width, 2)}" lengthAdjust="spacing"` : "");

  // Per-sentence text motion (wraps each <text> in an animated <g>). Built once
  // here so every transition branch can reuse it. motions[i] is null for "none".
  const motions = geo.map((g, i) => buildMotion(g.motion, i, fontSize, motionSpeed));
  const motionCss = motions.filter(Boolean).map((m) => m.css).join("\n    ");
  // Wrap `el` (a <text> string) in its motion group if the sentence has motion.
  const withMotion = (el, i) =>
    motions[i] ? `<g class="${motions[i].className}">${el}</g>` : el;

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

  // Build effects (rendered between background and text)
  const effResult = buildEffects(effects, width, height, br);
  defs.push(...effResult.defs);

  const sw = border ? borderWidth : 0;
  const inset = sw / 2;
  const bgRect =
    `<rect x="${inset}" y="${inset}" width="${width - sw}" height="${height - sw}" rx="${br}" ` +
    `fill="${bg.fill}" fill-opacity="${bg.opacity}"` +
    (brd ? ` stroke="${brd.fill}" stroke-opacity="${brd.opacity}" stroke-width="${borderWidth}"` : "") +
    `/>`;

  const textAttrs =
    `fill="${txt.fill}" fill-opacity="${txt.opacity}" ` +
    `font-family="${fontFamily}" font-size="${fontSize}" font-weight="${fontWeight}"` +
    (glow ? ` filter="url(#glow)"` : "");

  const fontFaceCss = embedFont && embedFont.css ? embedFont.css : "";
  const styleBlock = (parts) => {
    const body = parts.filter(Boolean).join("\n    ");
    return body ? `<style>\n    ${body}\n  </style>` : "";
  };

  const liveCount = list.length;
  const effEls = effResult.els.join("\n  ");
  const effCss = effResult.css;

  // ---- typing transition ---------------------------------------------------
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
      texts.push(withMotion(`<text x="${s.startX}" y="${baseline}" ${textAttrs}${justifyAttr(s)} clip-path="url(#clip${i})">${escapeXml(s.text)}</text>`, i));
    });

    let cursorEl = "";
    let cursorCss = "";
    if (cursor) {
      const ca = toAnim(cursorPts, T);
      cursorCss = `.cursor { animation: blink 1s steps(1) infinite; }
    @keyframes blink { 50% { opacity: 0; } }`;
      cursorEl = `<rect class="cursor" x="${geo[0].startX}" y="${cursorY}" width="3" height="${fontSize}" fill="${main.color}" fill-opacity="${main.opacity}">
    <animate attributeName="x" values="${ca.values}" keyTimes="${ca.keyTimes}" dur="${round(T, 2)}s" calcMode="${calcMode}" repeatCount="indefinite"/>
  </rect>`;
    }

    const inner = [
      styleBlock([fontFaceCss, effCss, cursorCss, motionCss]),
      `<defs>\n    ${defs.join("\n    ")}\n  </defs>`,
      bgRect,
      effEls,
      ...texts,
      cursorEl,
    ].filter(Boolean).join("\n  ");
    return wrap(width, height, geo[0].text, inner, linkUrl);
  }

  // ---- single sentence, non-typing -----------------------------------------
  if (liveCount <= 1) {
    const g0 = geo[0];
    const inner = [
      styleBlock([fontFaceCss, effCss, motionCss]),
      defs.length ? `<defs>\n    ${defs.join("\n    ")}\n  </defs>` : "",
      bgRect,
      effEls,
      withMotion(`<text x="${g0.startX}" y="${baseline}" ${textAttrs}${justifyAttr(g0)}>${escapeXml(g0.text)}</text>`, 0),
    ].filter(Boolean).join("\n  ");
    return wrap(width, height, g0.text, inner, linkUrl);
  }

  // ---- crossfade-style transitions -----------------------------------------
  const trans = transition === "none" ? 0.05 : clamp(Number(transitionDuration) || 0.6, 0.05, 3);
  const { css: transCss } = buildTransitionCss(liveCount, transition, Math.max(0.1, Number(holdDuration) || 1.5), trans, width, fontSize);
  const transTexts = geo.map(
    (s, i) => withMotion(`<text class="tt tt${i}" x="${s.startX}" y="${baseline}" ${textAttrs}${justifyAttr(s)}>${escapeXml(s.text)}</text>`, i)
  );
  const inner = [
    styleBlock([fontFaceCss, effCss, transCss, motionCss]),
    defs.length ? `<defs>\n    ${defs.join("\n    ")}\n  </defs>` : "",
    bgRect,
    effEls,
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