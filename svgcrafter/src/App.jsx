import { useEffect, useMemo, useState } from "react";
import { generateSvg, adjustBrightness, autoSize, normalizeUrl } from "./generateSvg";
import "./App.css";

// Real text measurement (needs the DOM, so it stays out of generateSvg).
// The font family must match what the SVG renders or the typing reveal drifts.
function measureTextWidth(text, fontSize, fontWeight, fontFamily) {
  const canvas =
    measureTextWidth._c || (measureTextWidth._c = document.createElement("canvas"));
  const ctx = canvas.getContext("2d");
  ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
  return Math.ceil(ctx.measureText(text || " ").width);
}

// Cumulative width after each character — needed for the "one letter at a time"
// typing mode so the reveal lands exactly on each character boundary.
function measureSentence(text, fontSize, fontWeight, fontFamily) {
  const prefixes = [0];
  for (let k = 1; k <= text.length; k++) prefixes.push(measureTextWidth(text.slice(0, k), fontSize, fontWeight, fontFamily));
  return { text, width: prefixes[prefixes.length - 1] || measureTextWidth(text, fontSize, fontWeight, fontFamily), prefixes };
}

const TABS = [
  { id: "text", label: "Text" },
  { id: "border", label: "Border" },
  { id: "background", label: "Background" },
  { id: "effects", label: "Effects" },
];

const MAX_SENTENCES = 6;

// Default fonts are system-font stacks: they need no embedding and render on the
// viewer's machine (external web fonts don't load through GitHub's image proxy).
const FONTS = [
  { id: "sans", label: "Sans", stack: "system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" },
  { id: "serif", label: "Serif", stack: "Georgia, 'Times New Roman', Times, serif" },
  { id: "mono", label: "Mono", stack: "ui-monospace, 'SFMono-Regular', Menlo, Consolas, 'Liberation Mono', monospace" },
  { id: "rounded", label: "Rounded", stack: "'Trebuchet MS', 'Segoe UI', Verdana, system-ui, sans-serif" },
  { id: "condensed", label: "Condensed", stack: "'Arial Narrow', 'Helvetica Neue', Arial, sans-serif" },
];

// A few popular Google Fonts shown as quick-pick chips.
const GOOGLE_FONTS = [
  "Inter", "Poppins", "Montserrat", "Roboto Slab", "Playfair Display",
  "Lobster", "Pacifico", "Bebas Neue", "Caveat", "Fira Code",
];

// A larger catalogue of popular Google Fonts, used only to suggest names as the
// user types. Any name can still be loaded even if it's not in this list.
const FONT_LIBRARY = [
  "Abril Fatface", "Albert Sans", "Alegreya", "Alegreya Sans", "Amatic SC", "Anton",
  "Archivo", "Archivo Black", "Arvo", "Assistant", "Audiowide", "Baloo 2", "Barlow",
  "Barlow Condensed", "Bebas Neue", "Be Vietnam Pro", "Bitter", "Bodoni Moda",
  "Bricolage Grotesque", "Bungee", "Cabin", "Caveat", "Catamaran", "Chivo", "Cinzel",
  "Comfortaa", "Cormorant", "Cormorant Garamond", "Crimson Text", "Dancing Script",
  "DM Mono", "DM Sans", "DM Serif Display", "Domine", "EB Garamond", "Epilogue", "Exo",
  "Exo 2", "Figtree", "Fira Code", "Fira Mono", "Fira Sans", "Frank Ruhl Libre",
  "Fredoka", "Gabarito", "Great Vibes", "Hanken Grotesk", "Heebo", "Hind",
  "IBM Plex Mono", "IBM Plex Sans", "IBM Plex Serif", "Inconsolata", "Indie Flower",
  "Inter", "Instrument Sans", "Italiana", "JetBrains Mono", "Josefin Sans", "Jost",
  "Kanit", "Karla", "Lato", "Lexend", "Libre Baskerville", "Libre Franklin", "Lobster",
  "Lora", "Manrope", "Marcellus", "Merriweather", "Monoton", "Montserrat", "Mukta",
  "Mulish", "Noto Sans", "Noto Serif", "Nunito", "Nunito Sans", "Onest", "Open Sans",
  "Orbitron", "Oswald", "Outfit", "Overpass", "Pacifico", "Pathway Gothic One",
  "Permanent Marker", "Philosopher", "Playfair Display", "Plus Jakarta Sans", "Poppins",
  "Prata", "Press Start 2P", "PT Sans", "PT Serif", "Quicksand", "Raleway",
  "Red Hat Display", "Red Hat Text", "Righteous", "Roboto", "Roboto Condensed",
  "Roboto Mono", "Roboto Slab", "Rubik", "Sacramento", "Saira", "Saira Condensed",
  "Satisfy", "Schibsted Grotesk", "Sen", "Shadows Into Light", "Sora", "Source Code Pro",
  "Source Sans 3", "Source Serif 4", "Space Grotesk", "Space Mono", "Spectral", "Syne",
  "Teko", "Titillium Web", "Tinos", "Ubuntu", "Ubuntu Mono", "Unbounded", "Urbanist",
  "Varela Round", "Vollkorn", "Work Sans", "Yeseva One", "Zilla Slab",
];

// Resolve the active CSS font-family string (used for both in-browser
// measurement and the generated SVG). A fetched Google font is rendered under
// its real family name with a system fallback.
const familyFor = (fontId, embedFont) =>
  embedFont ? `'${embedFont.family}', ${FONTS[0].stack}` : (FONTS.find((f) => f.id === fontId) || FONTS[0]).stack;

// --- Google Fonts: fetch + base64-embed (so the SVG stays self-contained) ----
function bufferToBase64(buf) {
  const bytes = new Uint8Array(buf);
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  return btoa(bin);
}

// From a Google Fonts CSS2 response, pick the basic-latin woff2 face.
function pickLatinFace(css) {
  const re = /\/\*\s*([\w-]+)\s*\*\/\s*@font-face\s*{([^}]*)}/g;
  const found = [];
  let m;
  while ((m = re.exec(css))) {
    const body = m[2];
    const url = (body.match(/url\((https:\/\/[^)]+\.woff2)\)/) || [])[1];
    if (!url) continue;
    found.push({
      label: m[1],
      url,
      // eslint-disable-next-line no-sparse-arrays
      weight: (body.match(/font-weight:\s*([^;]+);/) || [, "400"])[1].trim(),
      // eslint-disable-next-line no-sparse-arrays
      style: (body.match(/font-style:\s*([^;]+);/) || [, "normal"])[1].trim(),
    });
  }
  if (found.length) return found.find((f) => f.label === "latin") || found[0];
  const url = (css.match(/url\((https:\/\/[^)]+\.woff2)\)/) || [])[1];
  return url ? { url, weight: "400", style: "normal" } : null;
}

// Fetch a Google font by family name, embed it, and load it for measurement.
// Returns { family, css } where css is the ready-to-inline @font-face rule.
async function loadGoogleFont(family) {
  const res = await fetch(`https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}&display=swap`);
  if (!res.ok) throw new Error(`Couldn't find "${family}" on Google Fonts.`);
  const face = pickLatinFace(await res.text());
  if (!face) throw new Error("That font has no usable web file.");
  const fontRes = await fetch(face.url);
  if (!fontRes.ok) throw new Error("Couldn't download the font file.");
  const dataUrl = `data:font/woff2;base64,${bufferToBase64(await fontRes.arrayBuffer())}`;
  const css = `@font-face { font-family: '${family}'; font-style: ${face.style}; font-weight: ${face.weight}; font-display: block; src: url('${dataUrl}') format('woff2'); }`;
  try {
    const ff = new FontFace(family, `url(${dataUrl})`);
    await ff.load();
    document.fonts.add(ff);
  } catch {
    /* measurement may be approximate, but the embedded SVG still renders */
  }
  return { family, css };
}

// Bold the matched portion of a suggestion (case-insensitive), Word-style.
function highlightMatch(name, query) {
  const q = query.trim();
  if (!q) return name;
  const idx = name.toLowerCase().indexOf(q.toLowerCase());
  if (idx === -1) return name;
  return (
    <>
      {name.slice(0, idx)}
      <b>{name.slice(idx, idx + q.length)}</b>
      {name.slice(idx + q.length)}
    </>
  );
}

// Sentence-switch transitions. "typing" is the typewriter; the rest are CSS
// crossfade styles. "none" is an instant cut.
const TRANSITIONS = [
  { id: "none", label: "None" },
  { id: "typing", label: "Typing" },
  { id: "fade", label: "Fade" },
  { id: "zoom", label: "Zoom" },
  { id: "slide", label: "Slide" },
  { id: "rise", label: "Rise" },
  { id: "blur", label: "Blur" },
];

// Per-sentence text alignment. "justify" stretches multi-word sentences to fill
// the banner band (single words fall back to left in generateSvg).
const ALIGNMENTS = [
  { id: "left", label: "Align left" },
  { id: "center", label: "Align center" },
  { id: "right", label: "Align right" },
  { id: "justify", label: "Justify" },
];

// Tiny inline icon (three bars) illustrating each alignment.
function AlignIcon({ type }) {
  const rows = {
    left: [[2, 14], [2, 9], [2, 11]],
    center: [[2, 14], [5, 11], [3, 13]],
    right: [[2, 14], [7, 14], [5, 14]],
    justify: [[2, 14], [2, 14], [2, 14]],
  }[type] || [];
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor"
      strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
      {rows.map(([x1, x2], i) => (
        <line key={i} x1={x1} x2={x2} y1={4 + i * 4} y2={4 + i * 4} />
      ))}
    </svg>
  );
}

// ---- text motion (per-sentence, layered on top of transitions) ----
const MOTIONS = [
  { id: "none",   label: "No motion" },
  { id: "float",  label: "Float" },
  { id: "bob",    label: "Bob (up/down)" },
  { id: "sway",   label: "Sway (left/right)" },
  { id: "pulse",  label: "Pulse (zoom)" },
  { id: "wobble", label: "Wobble (rock)" },
  { id: "orbit",  label: "Orbit (circle)" },
];

// Tiny inline glyph illustrating each motion preset.
function MotionIcon({ type }) {
  const c = "currentColor";
  const common = { width: 16, height: 16, viewBox: "0 0 16 16", fill: "none", stroke: c, strokeWidth: 1.6, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true };
  switch (type) {
    case "none":   return <svg {...common}><circle cx="8" cy="8" r="1.4" fill={c} stroke="none"/></svg>;
    case "float":  return <svg {...common}><path d="M3 10c2-3 3 3 5 0s3-3 5 0"/></svg>;
    case "bob":    return <svg {...common}><path d="M8 3v10"/><path d="M5 6l3-3 3 3"/><path d="M5 10l3 3 3-3"/></svg>;
    case "sway":   return <svg {...common}><path d="M3 8h10"/><path d="M6 5L3 8l3 3"/><path d="M10 5l3 3-3 3"/></svg>;
    case "pulse":  return <svg {...common}><circle cx="8" cy="8" r="2.5"/><circle cx="8" cy="8" r="5.5" opacity="0.5"/></svg>;
    case "wobble": return <svg {...common}><path d="M8 13V6"/><path d="M4.5 8.5L8 4l3.5 4.5"/></svg>;
    case "orbit":  return <svg {...common}><circle cx="8" cy="8" r="5"/><circle cx="13" cy="8" r="1.6" fill={c} stroke="none"/></svg>;
    default:       return null;
  }
}

// ---- paint factories ------------------------------------------------------
const uid = () => Math.random().toString(36).slice(2, 9);
const newStop = (color = "#8b7cff") => ({ id: uid(), color, opacity: 100, brightness: 100 });
const solidPaint = (color) => ({ type: "solid", color, opacity: 100, brightness: 100, angle: 0, anim: "none", animSpeed: 3, animReverse: false, stops: [newStop(color)] });
const gradientPaint = (c1, c2, angle = 0) => ({ type: "gradient", color: c1, opacity: 100, brightness: 100, angle, anim: "none", animSpeed: 3, animReverse: false, stops: [newStop(c1), newStop(c2)] });

const MAX_STOPS = 8;
const alphaHex = (o) => Math.round((o / 100) * 255).toString(16).padStart(2, "0");

// CSS preview of a gradient paint (CSS angle = svg angle + 90).
function cssGradient(paint) {
  const cssAngle = (Number(paint.angle) || 0) + 90;
  const stops = paint.stops
    .map((s, i, arr) => {
      const offset = arr.length <= 1 ? 0 : (i / (arr.length - 1)) * 100;
      return `${adjustBrightness(s.color, s.brightness)}${alphaHex(s.opacity)} ${offset}%`;
    })
    .join(", ");
  return `linear-gradient(${cssAngle}deg, ${stops})`;
}

// One editable colour: swatch + opacity + brightness (reused for solid & stops).
function StopRow({ value, onChange, onRemove, onMoveUp, onMoveDown, disabled, dragging, onDragStart, onDragEnter, onDragEnd }) {
  const patch = (p) => onChange({ ...value, ...p });
  const isReorderable = Boolean(onMoveUp);
  return (
    <div
      className={"stoprow" + (dragging ? " dragging" : "")}
      onDragEnter={isReorderable ? onDragEnter : undefined}
      onDragOver={isReorderable ? (e) => e.preventDefault() : undefined}
      onDrop={isReorderable ? (e) => e.preventDefault() : undefined}
      onDragEnd={isReorderable ? onDragEnd : undefined}
    >
      {isReorderable && (
        <div className="reorder">
          <span
            className="grip"
            draggable={!disabled}
            onDragStart={(e) => {
              e.dataTransfer.effectAllowed = "move";
              e.dataTransfer.setData("text/plain", "");
              onDragStart && onDragStart();
            }}
            role="button"
            aria-label="Drag to reorder"
            title="Drag to reorder"
          >
            ⠿
          </span>
          <button type="button" onClick={onMoveUp} disabled={disabled} aria-label="Move up">▲</button>
          <button type="button" onClick={onMoveDown} disabled={disabled} aria-label="Move down">▼</button>
        </div>
      )}
      <input type="color" value={value.color} disabled={disabled}
        onChange={(e) => patch({ color: e.target.value })} />
      <div className="sliders">
        <label><i>Opacity</i>
          <input type="range" min="0" max="100" value={value.opacity} disabled={disabled}
            onChange={(e) => patch({ opacity: Number(e.target.value) })} />
          <em>{value.opacity}%</em>
        </label>
        <label><i>Brightness</i>
          <input type="range" min="0" max="200" value={value.brightness} disabled={disabled}
            onChange={(e) => patch({ brightness: Number(e.target.value) })} />
          <em>{value.brightness}%</em>
        </label>
      </div>
      {onRemove && (
        <button type="button" className="remove" onClick={onRemove} disabled={disabled} aria-label="Remove colour">✕</button>
      )}
    </div>
  );
}

// Full paint editor: solid/gradient switch, stop list, reorder, direction.
function PaintControl({ label, paint, onChange, disabled }) {
  const isGrad = paint.type === "gradient";
  const [dragId, setDragId] = useState(null);

  const setType = (type) => {
    if (type === "gradient" && paint.stops.length < 2) {
      onChange({ ...paint, type, stops: [newStop(paint.color), newStop("#bd34fe")] });
    } else {
      onChange({ ...paint, type });
    }
  };

  const setStops = (stops) => onChange({ ...paint, stops });
  const updateStop = (i, next) => setStops(paint.stops.map((s, idx) => (idx === i ? next : s)));
  const addStop = () => paint.stops.length < MAX_STOPS && setStops([...paint.stops, newStop("#41d1ff")]);
  const removeStop = (i) => paint.stops.length > 2 && setStops(paint.stops.filter((_, idx) => idx !== i));
  const move = (i, dir) => {
    const j = i + dir;
    if (j < 0 || j >= paint.stops.length) return;
    const next = [...paint.stops];
    [next[i], next[j]] = [next[j], next[i]];
    setStops(next);
  };

  // Drag-to-reorder: reorder live as the dragged stop passes over others.
  const dragOver = (overId) => {
    if (dragId == null || dragId === overId) return;
    const from = paint.stops.findIndex((s) => s.id === dragId);
    const to = paint.stops.findIndex((s) => s.id === overId);
    if (from === -1 || to === -1 || from === to) return;
    const next = [...paint.stops];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setStops(next);
  };

  return (
    <div className={"paint" + (disabled ? " is-disabled" : "")}>
      <div className="paint-head">
        <span>{label}</span>
        <div className="seg">
          <button type="button" className={!isGrad ? "on" : ""} disabled={disabled} onClick={() => setType("solid")}>Solid</button>
          <button type="button" className={isGrad ? "on" : ""} disabled={disabled} onClick={() => setType("gradient")}>Gradient</button>
        </div>
      </div>

      {!isGrad && (
        <StopRow
          value={{ color: paint.color, opacity: paint.opacity, brightness: paint.brightness }}
          onChange={(v) => onChange({ ...paint, ...v })}
          disabled={disabled}
        />
      )}

      {isGrad && (
        <>
          <div className="gradbar" style={{ background: disabled ? "var(--panel-2)" : cssGradient(paint) }} />
          <label className="field dir">
            <span>Direction — {paint.angle}°</span>
            <input type="range" min="0" max="360" value={paint.angle} disabled={disabled}
              onChange={(e) => onChange({ ...paint, angle: Number(e.target.value) })} />
          </label>
          <div className="stops">
            {paint.stops.map((s, i) => (
              <StopRow
                key={s.id}
                value={s}
                onChange={(v) => updateStop(i, v)}
                onRemove={paint.stops.length > 2 ? () => removeStop(i) : undefined}
                onMoveUp={() => move(i, -1)}
                onMoveDown={() => move(i, 1)}
                disabled={disabled}
                dragging={dragId === s.id}
                onDragStart={() => setDragId(s.id)}
                onDragEnter={() => dragOver(s.id)}
                onDragEnd={() => setDragId(null)}
              />
            ))}
          </div>
          <button type="button" className="add" onClick={addStop} disabled={disabled || paint.stops.length >= MAX_STOPS}>
            + Add colour
          </button>

          <div className="gradanim">
            <div className="field">
              <span>Animation</span>
              <div className="seg">
                <button type="button" className={paint.anim === "none" ? "on" : ""} disabled={disabled} onClick={() => onChange({ ...paint, anim: "none" })}>None</button>
                <button type="button" className={paint.anim === "rotate" ? "on" : ""} disabled={disabled} onClick={() => onChange({ ...paint, anim: "rotate" })}>Rotate</button>
                <button type="button" className={paint.anim === "move" ? "on" : ""} disabled={disabled} onClick={() => onChange({ ...paint, anim: "move" })}>Move</button>
              </div>
            </div>
            {paint.anim !== "none" && (
              <>
                <label className="field">
                  <span>Animation speed — {paint.animSpeed}</span>
                  <input type="range" min="1" max="10" value={paint.animSpeed} disabled={disabled}
                    onChange={(e) => onChange({ ...paint, animSpeed: Number(e.target.value) })} />
                </label>
                <div className="field">
                  <span>Direction</span>
                  <div className="seg">
                    {paint.anim === "rotate" ? (
                      <>
                        <button type="button" className={!paint.animReverse ? "on" : ""} disabled={disabled} onClick={() => onChange({ ...paint, animReverse: false })}>Clockwise</button>
                        <button type="button" className={paint.animReverse ? "on" : ""} disabled={disabled} onClick={() => onChange({ ...paint, animReverse: true })}>Counter</button>
                      </>
                    ) : (
                      <>
                        <button type="button" className={!paint.animReverse ? "on" : ""} disabled={disabled} onClick={() => onChange({ ...paint, animReverse: false })}>With gradient</button>
                        <button type="button" className={paint.animReverse ? "on" : ""} disabled={disabled} onClick={() => onChange({ ...paint, animReverse: true })}>Opposite</button>
                      </>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ============================================================================
// COLLAPSIBLE SECTION (accordion)
// ============================================================================
// Reusable expanding panel. `summary` shows on the right of the header when
// collapsed (e.g. a live value like "40px · Poppins"). `badge` shows a small
// pill (e.g. active-effect count). Controlled-open supported via `open`/`onToggle`,
// otherwise it manages its own state seeded by `defaultOpen`.
function Section({ title, icon, summary, badge, defaultOpen = false, open, onToggle, children }) {
  const [localOpen, setLocalOpen] = useState(defaultOpen);
  const isControlled = open !== undefined;
  const expanded = isControlled ? open : localOpen;
  const toggle = () => (isControlled ? onToggle && onToggle(!expanded) : setLocalOpen((o) => !o));

  return (
    <div className={"section" + (expanded ? " section-open" : "")}>
      <button type="button" className="section-head" onClick={toggle} aria-expanded={expanded}>
        {icon && <span className="section-icon">{icon}</span>}
        <span className="section-title">{title}</span>
        {badge != null && badge > 0 && <span className="section-badge">{badge}</span>}
        {!expanded && summary && <span className="section-summary">{summary}</span>}
        <span className={"section-chevron" + (expanded ? " open" : "")}>›</span>
      </button>
      {expanded && <div className="section-body">{children}</div>}
    </div>
  );
}

// ============================================================================
// EFFECTS TAB
// ============================================================================

const EFFECT_DEFAULTS = [
  { id: "lightning",  enabled: false, color: "#a78bfa", opacity: 85, speed: 5,  bolts: 3,   jitter: 8   },
  { id: "soundwaves", enabled: false, color: "#38bdf8", opacity: 45, speed: 4,  count: 4,   strokeWidth: 1.5 },
  { id: "particles",  enabled: false, color: "#f472b6", opacity: 70, speed: 3,  count: 15,  size: 3     },
  { id: "scanlines",  enabled: false, color: "#ffffff", opacity: 18, speed: 3,  lineGap: 4, beamHeight: 36  },
  { id: "shimmer",    enabled: false, color: "#ffffff", opacity: 55, speed: 3,  beamWidth: 100 },
  { id: "pulserings", enabled: false, color: "#818cf8", opacity: 60, speed: 3,  count: 3,   strokeWidth: 1.5 },
  { id: "matrixrain", enabled: false, color: "#4ade80", opacity: 55, speed: 5,  columns: 12, dotSize: 3  },
  { id: "borderbeam", enabled: false, color: "#38bdf8", opacity: 90, speed: 4,  count: 1,   tailLength: 18, thickness: 3 },
  { id: "sparkles",   enabled: false, color: "#fde047", opacity: 85, speed: 4,  count: 10,  size: 5 },
  { id: "confetti",   enabled: false, color: "#f472b6", opacity: 90, speed: 4,  count: 18,  size: 5 },
  { id: "aurora",     enabled: false, color: "#22d3ee", opacity: 45, speed: 2,  blobs: 3,   size: 60 },
];

const EFFECT_META = [
  {
    id: "lightning",
    label: "⚡ Lightning",
    desc: "Zigzag bolts flicker along the banner edges",
    controls: [
      { key: "bolts",  label: "Bolts",  type: "int",   min: 1, max: 6,  step: 1 },
      { key: "jitter", label: "Jitter", type: "float", min: 2, max: 20, step: 1, fmt: v => `${v}px` },
    ],
  },
  {
    id: "soundwaves",
    label: "〜 Sound Waves",
    desc: "Sine waves ripple horizontally across the banner",
    controls: [
      { key: "count",       label: "Waves",     type: "int",   min: 1, max: 8,  step: 1 },
      { key: "strokeWidth", label: "Thickness", type: "float", min: 0.5, max: 4, step: 0.5, fmt: v => `${v}px` },
    ],
  },
  {
    id: "particles",
    label: "✦ Particles",
    desc: "Glowing sparks drift upward and fade out",
    controls: [
      { key: "count", label: "Count", type: "int",   min: 3, max: 40, step: 1 },
      { key: "size",  label: "Size",  type: "float", min: 1, max: 10, step: 0.5, fmt: v => `${v}px` },
    ],
  },
  {
    id: "scanlines",
    label: "📺 Scanlines",
    desc: "CRT grid with a glowing beam sweeping top to bottom",
    controls: [
      { key: "lineGap",    label: "Line gap",    type: "int", min: 2, max: 20, step: 1, fmt: v => `${v}px` },
      { key: "beamHeight", label: "Beam height", type: "int", min: 8, max: 100, step: 4, fmt: v => `${v}px` },
    ],
  },
  {
    id: "shimmer",
    label: "✨ Shimmer",
    desc: "Diagonal gloss highlight sweeps across the banner",
    controls: [
      { key: "beamWidth", label: "Beam width", type: "int", min: 20, max: 300, step: 10, fmt: v => `${v}px` },
    ],
  },
  {
    id: "pulserings",
    label: "◎ Pulse Rings",
    desc: "Rings expand outward from the center and fade",
    controls: [
      { key: "count",       label: "Rings",     type: "int",   min: 1, max: 8,  step: 1 },
      { key: "strokeWidth", label: "Thickness", type: "float", min: 0.5, max: 4, step: 0.5, fmt: v => `${v}px` },
    ],
  },
  {
    id: "matrixrain",
    label: "⬇ Matrix Rain",
    desc: "Columns of glowing dots rain downward",
    controls: [
      { key: "columns", label: "Columns",  type: "int",   min: 3, max: 30, step: 1 },
      { key: "dotSize", label: "Dot size", type: "float", min: 1, max: 8,  step: 0.5, fmt: v => `${v}px` },
    ],
  },
  {
    id: "borderbeam",
    label: "◉ Border Beam",
    desc: "Glowing comets orbit around the banner's border",
    controls: [
      { key: "count",      label: "Comets",    type: "int",   min: 1, max: 4,  step: 1 },
      { key: "tailLength", label: "Tail",      type: "int",   min: 5, max: 40, step: 1, fmt: v => `${v}%` },
      { key: "thickness",  label: "Thickness", type: "float", min: 1, max: 8,  step: 0.5, fmt: v => `${v}px` },
    ],
  },
  {
    id: "sparkles",
    label: "✧ Sparkles",
    desc: "Four-point stars twinkle in and out across the banner",
    controls: [
      { key: "count", label: "Count", type: "int",   min: 3, max: 30, step: 1 },
      { key: "size",  label: "Size",  type: "float", min: 2, max: 12, step: 0.5, fmt: v => `${v}px` },
    ],
  },
  {
    id: "confetti",
    label: "🎊 Confetti",
    desc: "Colourful pieces tumble down, hues derived from your colour",
    controls: [
      { key: "count", label: "Count", type: "int",   min: 5, max: 40, step: 1 },
      { key: "size",  label: "Size",  type: "float", min: 2, max: 10, step: 0.5, fmt: v => `${v}px` },
    ],
  },
  {
    id: "aurora",
    label: "≋ Aurora",
    desc: "Soft blurred colour blobs drift slowly behind the text",
    controls: [
      { key: "blobs", label: "Blobs", type: "int", min: 1, max: 4,   step: 1 },
      { key: "size",  label: "Size",  type: "int", min: 30, max: 120, step: 5, fmt: v => `${v}%` },
    ],
  },
];

function EffectCard({ meta, eff, onChange }) {
  const [open, setOpen] = useState(false);
  const patch = (updates) => onChange({ ...eff, ...updates });

  return (
    <div className={"eff-card" + (eff.enabled ? " eff-on" : "")}>
      <div className="eff-header">
        <label className="eff-toggle-row">
          <input
            type="checkbox"
            checked={eff.enabled}
            onChange={e => patch({ enabled: e.target.checked })}
          />
          <span className="eff-label">{meta.label}</span>
        </label>
        <button
          type="button"
          className={"eff-chevron" + (open ? " open" : "")}
          onClick={() => setOpen(o => !o)}
          aria-label={open ? "Collapse" : "Expand"}
        >
          ›
        </button>
      </div>

      {!open && <p className="eff-desc">{meta.desc}</p>}

      {open && (
        <div className="eff-controls">
          {/* Colour */}
          <div className="eff-row">
            <span className="eff-row-label">Colour</span>
            <input
              type="color"
              className="eff-swatch"
              value={eff.color}
              onChange={e => patch({ color: e.target.value })}
            />
          </div>
          {/* Opacity */}
          <div className="eff-row">
            <span className="eff-row-label">Opacity</span>
            <input type="range" min={5} max={100} step={5} value={eff.opacity}
              onChange={e => patch({ opacity: Number(e.target.value) })} />
            <em className="eff-val">{eff.opacity}%</em>
          </div>
          {/* Speed */}
          <div className="eff-row">
            <span className="eff-row-label">Speed</span>
            <input type="range" min={1} max={10} step={1} value={eff.speed}
              onChange={e => patch({ speed: Number(e.target.value) })} />
            <em className="eff-val">{eff.speed}</em>
          </div>
          {/* Effect-specific sliders */}
          {meta.controls.map(ctrl => {
            const val = eff[ctrl.key] ?? 0;
            const display = ctrl.fmt ? ctrl.fmt(val) : val;
            const parse = ctrl.type === "int"
              ? e => patch({ [ctrl.key]: parseInt(e.target.value, 10) })
              : e => patch({ [ctrl.key]: parseFloat(e.target.value) });
            return (
              <div className="eff-row" key={ctrl.key}>
                <span className="eff-row-label">{ctrl.label}</span>
                <input type="range" min={ctrl.min} max={ctrl.max} step={ctrl.step} value={val}
                  onChange={parse} />
                <em className="eff-val">{display}</em>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Effects grouped by visual family so the 11 cards aren't one long scroll.
const EFFECT_GROUPS = [
  { title: "Ambient",  ids: ["aurora", "shimmer", "scanlines", "sparkles"] },
  { title: "Motion",   ids: ["particles", "confetti", "matrixrain", "soundwaves"] },
  { title: "Accent",   ids: ["lightning", "pulserings", "borderbeam"] },
];

function EffectsTab({ effects, onChange }) {
  const update = (id, updated) => onChange(
    effects.some(e => e.id === id)
      ? effects.map(e => e.id === id ? updated : e)
      : [...effects, updated]
  );
  const activeCount = effects.filter(e => e.enabled).length;
  const activeIn = (ids) => ids.filter(id => effects.find(e => e.id === id)?.enabled).length;

  return (
    <div>
      <p className="eff-hint">
        {activeCount === 0
          ? "Enable effects to layer atmosphere onto your banner. They stack freely."
          : `${activeCount} effect${activeCount > 1 ? "s" : ""} active — expand any card to tune it.`}
      </p>
      {EFFECT_GROUPS.map((group, gi) => (
        <Section
          key={group.title}
          title={group.title}
          defaultOpen={gi === 0}
          badge={activeIn(group.ids)}
        >
          <div className="eff-list">
            {group.ids.map(id => {
              const meta = EFFECT_META.find(m => m.id === id);
              const eff = effects.find(e => e.id === id) || EFFECT_DEFAULTS.find(d => d.id === id);
              return (
                <EffectCard
                  key={id}
                  meta={meta}
                  eff={eff}
                  onChange={updated => update(id, updated)}
                />
              );
            })}
          </div>
        </Section>
      ))}
    </div>
  );
}

export default function App() {
  const [tab, setTab] = useState("text");
  const [copied, setCopied] = useState("");
  const [dragSentence, setDragSentence] = useState(null);
  const [config, setConfig] = useState({
    sentences: ["Welcome 👋", "SVG Crafter"],
    sentenceAligns: ["left", "left"],
    sentenceMotions: ["none", "none"],
    sentenceIds: [uid(), uid()],
    motionSpeed: 1,
    fontSize: 40,
    fontWeight: 700,
    fontId: "sans",
    googleFont: "",
    embedFont: null,
    transition: "typing",
    transitionDuration: 0.6,
    typingMode: "smooth",
    typingSpeed: 1,
    cursor: true,
    holdDuration: 1.5,
    textPaint: gradientPaint("#41d1ff", "#bd34fe", 0),
    border: false,
    borderWidth: 2,
    borderRadius: 14,
    borderPaint: gradientPaint("#41d1ff", "#bd34fe", 0),
    bgPaint: solidPaint("#14142b"),
    glow: false,
    autoWidth: true,
    bannerWidth: 600,
    autoHeight: true,
    bannerHeight: 120,
    linkUrl: "",
    effects: EFFECT_DEFAULTS,
  });

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", "dark");
  }, []);

  const set = (key) => (e) => {
    const el = e.target;
    const value = el.type === "checkbox" ? el.checked : el.value;
    setConfig((c) => ({ ...c, [key]: el.type === "range" ? Number(value) : value }));
  };
  const setPaint = (key) => (p) => setConfig((c) => ({ ...c, [key]: p }));

  // sentence list helpers
  const setSentence = (i, text) =>
    setConfig((c) => ({ ...c, sentences: c.sentences.map((s, idx) => (idx === i ? text : s)) }));
  const setSentenceAlign = (i, align) =>
    setConfig((c) => ({ ...c, sentenceAligns: c.sentenceAligns.map((a, idx) => (idx === i ? align : a)) }));
  const setSentenceMotion = (i, motion) =>
    setConfig((c) => ({ ...c, sentenceMotions: (c.sentenceMotions || []).map((mm, idx) => (idx === i ? motion : mm)) }));
  const addSentence = () =>
    setConfig((c) =>
      c.sentences.length < MAX_SENTENCES
        ? { ...c, sentences: [...c.sentences, ""], sentenceAligns: [...c.sentenceAligns, "left"], sentenceMotions: [...(c.sentenceMotions || []), "none"], sentenceIds: [...(c.sentenceIds || c.sentences.map(uid)), uid()] }
        : c
    );
  const removeSentence = (i) =>
    setConfig((c) =>
      c.sentences.length > 1
        ? {
            ...c,
            sentences: c.sentences.filter((_, idx) => idx !== i),
            sentenceAligns: c.sentenceAligns.filter((_, idx) => idx !== i),
            sentenceMotions: (c.sentenceMotions || []).filter((_, idx) => idx !== i),
            sentenceIds: (c.sentenceIds || []).filter((_, idx) => idx !== i),
          }
        : c
    );
  // Reorder all parallel sentence arrays together (text, align, motion, id).
  const moveSentence = (from, to) =>
    setConfig((c) => {
      const n = c.sentences.length;
      if (from === to || from < 0 || to < 0 || from >= n || to >= n) return c;
      const reorder = (arr) => {
        const next = [...arr];
        const [m] = next.splice(from, 1);
        next.splice(to, 0, m);
        return next;
      };
      const ids = c.sentenceIds || c.sentences.map(() => uid());
      return {
        ...c,
        sentences: reorder(c.sentences),
        sentenceAligns: reorder(c.sentenceAligns),
        sentenceMotions: reorder(c.sentenceMotions || c.sentences.map(() => "none")),
        sentenceIds: reorder(ids),
      };
    });

  // Active font family, measured sentences, and the resulting SVG.
  const fontFamily = useMemo(() => familyFor(config.fontId, config.embedFont), [config.fontId, config.embedFont]);
  const measured = useMemo(
    () =>
      config.sentences.map((t, i) => ({
        ...measureSentence(t, config.fontSize, config.fontWeight, fontFamily),
        align: config.sentenceAligns[i] || "left",
        motion: (config.sentenceMotions && config.sentenceMotions[i]) || "none",
      })),
    [config.sentences, config.sentenceAligns, config.sentenceMotions, config.fontSize, config.fontWeight, fontFamily]
  );
  const auto = useMemo(() => autoSize(measured, config.fontSize), [measured, config.fontSize]);
  const svg = useMemo(() => generateSvg({ ...config, sentences: measured, fontFamily }), [config, measured, fontFamily]);

  // Fetch + embed a Google font whenever the chosen family changes. Status is
  // set in the handler (loading) and in the async then/catch (ready/error) — no
  // synchronous setState inside the effect body.
  const [fontStatus, setFontStatus] = useState({ state: "idle", msg: "" });
  const [fontQuery, setFontQuery] = useState("");
  useEffect(() => {
    const fam = config.googleFont;
    if (!fam) return;
    let cancelled = false;
    loadGoogleFont(fam)
      .then((embed) => {
        if (cancelled) return;
        setConfig((c) => (c.googleFont === fam ? { ...c, embedFont: embed } : c));
        setFontStatus({ state: "ready", msg: "" });
      })
      .catch((err) => {
        if (cancelled) return;
        setFontStatus({ state: "error", msg: err.message || "Couldn't load that font." });
        setConfig((c) => (c.googleFont === fam ? { ...c, googleFont: "", embedFont: null, fontId: "sans" } : c));
      });
    return () => { cancelled = true; };
  }, [config.googleFont]);

  const selectFont = (id) => {
    setFontStatus({ state: "idle", msg: "" });
    setConfig((c) => ({ ...c, fontId: id, googleFont: "", embedFont: null }));
  };
  const selectGoogleFont = (family) => {
    const fam = family.trim();
    if (!fam) return;
    setFontStatus({ state: "loading", msg: `Loading ${fam}…` });
    setConfig((c) => ({ ...c, googleFont: fam, fontId: "custom" }));
  };
  const removeFont = () => {
    setFontStatus({ state: "idle", msg: "" });
    setConfig((c) => ({ ...c, fontId: "sans", googleFont: "", embedFont: null }));
  };

  // Font search autocomplete (case-insensitive; prefix matches first).
  const [showSuggest, setShowSuggest] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const suggestions = useMemo(() => {
    const q = fontQuery.trim().toLowerCase();
    if (!q) return [];
    const starts = [];
    const contains = [];
    for (const name of FONT_LIBRARY) {
      const ln = name.toLowerCase();
      if (ln.startsWith(q)) starts.push(name);
      else if (ln.includes(q)) contains.push(name);
    }
    return [...starts, ...contains].slice(0, 8);
  }, [fontQuery]);
  const chooseFont = (name) => {
    setFontQuery(name);
    setShowSuggest(false);
    setActiveIdx(-1);
    selectGoogleFont(name);
  };
  const onFontKeyDown = (e) => {
    if (showSuggest && suggestions.length) {
      if (e.key === "ArrowDown") { e.preventDefault(); setActiveIdx((i) => (i + 1) % suggestions.length); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setActiveIdx((i) => (i <= 0 ? suggestions.length - 1 : i - 1)); return; }
      if (e.key === "Escape") { setShowSuggest(false); setActiveIdx(-1); return; }
      if (e.key === "Enter") { e.preventDefault(); chooseFont(activeIdx >= 0 ? suggestions[activeIdx] : suggestions[0]); return; }
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (fontQuery.trim()) chooseFont(fontQuery.trim());
    }
  };

  // Width/height: seed the slider with the live auto value when going custom.
  const setWidthAuto = (isAuto) =>
    setConfig((c) => ({ ...c, autoWidth: isAuto, bannerWidth: isAuto ? c.bannerWidth : auto.width }));
  const setHeightAuto = (isAuto) =>
    setConfig((c) => ({ ...c, autoHeight: isAuto, bannerHeight: isAuto ? c.bannerHeight : auto.height }));

  const dataUri = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  const link = normalizeUrl(config.linkUrl);
  const alt = config.sentences[0] || "banner";
  const imageMd = `![${alt}](./assets/banner.svg)`;
  const markdown = link ? `[${imageMd}](${link})` : imageMd;

  async function copy(value, which) {
    await navigator.clipboard.writeText(value);
    setCopied(which);
    setTimeout(() => setCopied(""), 1400);
  }

  function download() {
    const blob = new Blob([svg], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "banner.svg";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="dot" />
          <span className="wordmark">SVG <span className="accent">Crafter</span></span>
          <span className="tagline">GitHub profile banner generator</span>
        </div>
      </header>

      <div className="workspace">
        <aside className="sidebar">
          <div className="tabs" role="tablist">
            {TABS.map((t) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={tab === t.id}
                className={tab === t.id ? "tab active" : "tab"}
                onClick={() => setTab(t.id)}
              >
                {t.label}
                {t.id === "effects" && config.effects.filter(e => e.enabled).length > 0 && (
                  <span className="tab-badge">
                    {config.effects.filter(e => e.enabled).length}
                  </span>
                )}
              </button>
            ))}
          </div>

          <div className="tabpanel">
            {tab === "text" && (
              <>
                <Section
                  title="Sentences"
                  defaultOpen
                  summary={`${config.sentences.filter(s => s.trim()).length || 1} line${(config.sentences.filter(s => s.trim()).length || 1) > 1 ? "s" : ""}`}
                >
                <div className="field">
                  <span>Sentences{config.sentences.length > 1 ? " (cycle in order)" : ""}</span>
                  <div className="sentences">
                    {config.sentences.map((s, i) => {
                      const sid = (config.sentenceIds && config.sentenceIds[i]) || i;
                      const multi = config.sentences.length > 1;
                      const dragOverSentence = () => {
                        if (dragSentence == null) return;
                        const from = (config.sentenceIds || []).indexOf(dragSentence);
                        if (from === -1 || from === i) return;
                        moveSentence(from, i);
                      };
                      return (
                      <div
                        className={"sentence-item" + (dragSentence === sid ? " dragging" : "")}
                        key={sid}
                        onDragEnter={multi ? dragOverSentence : undefined}
                        onDragOver={multi ? (e) => e.preventDefault() : undefined}
                        onDrop={multi ? (e) => e.preventDefault() : undefined}
                        onDragEnd={multi ? () => setDragSentence(null) : undefined}
                      >
                        <div className="sentence-row">
                          {multi && (
                            <div className="s-reorder">
                              <span
                                className="grip"
                                draggable
                                onDragStart={(e) => {
                                  e.dataTransfer.effectAllowed = "move";
                                  e.dataTransfer.setData("text/plain", "");
                                  setDragSentence(sid);
                                }}
                                role="button"
                                aria-label="Drag to reorder sentence"
                                title="Drag to reorder"
                              >⠿</span>
                              <div className="s-arrows">
                                <button type="button" onClick={() => moveSentence(i, i - 1)} disabled={i === 0} aria-label="Move sentence up">▲</button>
                                <button type="button" onClick={() => moveSentence(i, i + 1)} disabled={i === config.sentences.length - 1} aria-label="Move sentence down">▼</button>
                              </div>
                            </div>
                          )}
                          <input
                            type="text"
                            value={s}
                            onChange={(e) => setSentence(i, e.target.value)}
                            maxLength={40}
                            placeholder={`Sentence ${i + 1}`}
                          />
                          {multi && (
                            <button type="button" className="remove" onClick={() => removeSentence(i)} aria-label="Remove sentence">✕</button>
                          )}
                        </div>
                        <div className="seg align-seg" role="group" aria-label="Text alignment">
                          {ALIGNMENTS.map((a) => {
                            const on = (config.sentenceAligns[i] || "left") === a.id;
                            return (
                              <button
                                key={a.id}
                                type="button"
                                className={on ? "on" : ""}
                                onClick={() => setSentenceAlign(i, a.id)}
                                title={a.label}
                                aria-label={a.label}
                                aria-pressed={on}
                              >
                                <AlignIcon type={a.id} />
                              </button>
                            );
                          })}
                        </div>
                        <div className="seg motion-seg" role="group" aria-label="Text motion">
                          {MOTIONS.map((mm) => {
                            const on = ((config.sentenceMotions && config.sentenceMotions[i]) || "none") === mm.id;
                            return (
                              <button
                                key={mm.id}
                                type="button"
                                className={on ? "on" : ""}
                                onClick={() => setSentenceMotion(i, mm.id)}
                                title={mm.label}
                                aria-label={mm.label}
                                aria-pressed={on}
                              >
                                <MotionIcon type={mm.id} />
                              </button>
                            );
                          })}
                        </div>
                      </div>
                      );
                    })}
                  </div>
                  <button type="button" className="add" onClick={addSentence} disabled={config.sentences.length >= MAX_SENTENCES}>
                    + Add sentence
                  </button>
                </div>
                </Section>

                <Section
                  title="Text style"
                  summary={`${config.fontSize}px${config.embedFont ? " · " + config.embedFont.family : config.googleFont ? " · " + config.googleFont : ""}`}
                >
                <PaintControl label="Text colour" paint={config.textPaint} onChange={setPaint("textPaint")} />

                <div className="field">
                  <span>Font</span>
                  <div className="font-grid">
                    {FONTS.map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        className={"font-chip" + (!config.embedFont && !config.googleFont && config.fontId === f.id ? " on" : "")}
                        style={{ fontFamily: f.stack }}
                        onClick={() => selectFont(f.id)}
                      >
                        {f.label}
                      </button>
                    ))}
                    {GOOGLE_FONTS.map((name) => (
                      <button
                        key={name}
                        type="button"
                        className={"font-chip" + (config.googleFont === name ? " on" : "")}
                        style={config.embedFont && config.embedFont.family === name ? { fontFamily: `'${name}'` } : undefined}
                        onClick={() => selectGoogleFont(name)}
                      >
                        {name}
                      </button>
                    ))}
                  </div>
                  <div className="font-search">
                    <div className="font-load">
                      <input
                        type="text"
                        placeholder="Type any Font name"
                        value={fontQuery}
                        autoComplete="off"
                        role="combobox"
                        aria-expanded={showSuggest && suggestions.length > 0}
                        aria-autocomplete="list"
                        onChange={(e) => { setFontQuery(e.target.value); setShowSuggest(true); setActiveIdx(-1); }}
                        onFocus={() => setShowSuggest(true)}
                        onBlur={() => setTimeout(() => setShowSuggest(false), 120)}
                        onKeyDown={onFontKeyDown}
                      />
                      <button type="button" className="ghost" onClick={() => fontQuery.trim() && chooseFont(fontQuery.trim())}>Load</button>
                    </div>
                    {showSuggest && suggestions.length > 0 && (
                      <ul className="suggest" role="listbox">
                        {suggestions.map((name, i) => (
                          <li
                            key={name}
                            role="option"
                            aria-selected={i === activeIdx}
                            className={"suggest-item" + (i === activeIdx ? " active" : "")}
                            onMouseDown={(e) => { e.preventDefault(); chooseFont(name); }}
                            onMouseEnter={() => setActiveIdx(i)}
                          >
                            {highlightMatch(name, fontQuery)}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  {fontStatus.state === "loading" && <p className="font-note">{fontStatus.msg}</p>}
                  {fontStatus.state === "error" && <p className="font-note error">{fontStatus.msg}</p>}
                  {config.embedFont && fontStatus.state !== "loading" && (
                    <p className="font-note">
                      Using <b>{config.embedFont.family}</b> · <button type="button" className="linkish" onClick={removeFont}>remove</button>
                    </p>
                  )}
                </div>

                <label className="field">
                  <span>Font size — {config.fontSize}px</span>
                  <input type="range" min="20" max="72" value={config.fontSize} onChange={set("fontSize")} />
                </label>
                <label className="field">
                  <span>Font weight — {config.fontWeight}</span>
                  <input type="range" min="400" max="800" step="100" value={config.fontWeight} onChange={set("fontWeight")} />
                </label>
                <label className="toggle">
                  <input type="checkbox" checked={config.glow} onChange={set("glow")} />
                  <span>Text glow</span>
                </label>
                </Section>

                <Section
                  title="Animation"
                  summary={TRANSITIONS.find(t => t.id === config.transition)?.label || "None"}
                >
                {(config.sentenceMotions || []).some(mm => mm && mm !== "none") && (
                  <label className="field">
                    <span>Motion speed — {config.motionSpeed}x</span>
                    <input type="range" min="0.25" max="3" step="0.25" value={config.motionSpeed} onChange={set("motionSpeed")} />
                  </label>
                )}
                <div className="field">
                  <span>Transition{config.sentences.length > 1 ? "" : " (single sentence — needs 2+ to cycle)"}</span>
                  <div className="font-grid">
                    {TRANSITIONS.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        className={"font-chip" + (config.transition === t.id ? " on" : "")}
                        onClick={() => setConfig((c) => ({ ...c, transition: t.id }))}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>

                {(config.sentences.length > 1 || config.transition === "typing") && (
                  <label className="field">
                    <span>Hold time — {config.holdDuration}s</span>
                    <input type="range" min="0.5" max="5" step="0.5" value={config.holdDuration} onChange={set("holdDuration")} />
                  </label>
                )}

                {config.transition !== "none" && config.transition !== "typing" && config.sentences.length > 1 && (
                  <label className="field">
                    <span>Transition speed — {config.transitionDuration}s</span>
                    <input type="range" min="0.2" max="1.5" step="0.1" value={config.transitionDuration} onChange={set("transitionDuration")} />
                  </label>
                )}

                {config.transition === "typing" && (
                  <div className="subgroup">
                    <div className="field">
                      <span>Typing style</span>
                      <div className="seg">
                        <button type="button" className={config.typingMode === "smooth" ? "on" : ""} onClick={() => setConfig((c) => ({ ...c, typingMode: "smooth" }))}>Smooth</button>
                        <button type="button" className={config.typingMode === "char" ? "on" : ""} onClick={() => setConfig((c) => ({ ...c, typingMode: "char" }))}>Letter by letter</button>
                      </div>
                    </div>
                    <label className="toggle">
                      <input type="checkbox" checked={config.cursor} onChange={set("cursor")} />
                      <span>Show cursor</span>
                    </label>
                    <label className="field">
                      <span>Typing speed — {config.typingSpeed}x</span>
                      <input type="range" min="0.5" max="4" step="0.5" value={config.typingSpeed} onChange={set("typingSpeed")} />
                    </label>
                  </div>
                )}
                </Section>
              </>
            )}

            {tab === "border" && (
              <>
                <Section title="Border" defaultOpen summary={config.border ? `on · ${config.borderWidth}px` : "off"}>
                  <label className="toggle">
                    <input type="checkbox" checked={config.border} onChange={set("border")} />
                    <span>Show border</span>
                  </label>
                  <PaintControl label="Border colour" paint={config.borderPaint} onChange={setPaint("borderPaint")} disabled={!config.border} />
                  <label className="field">
                    <span>Border width — {config.borderWidth}px</span>
                    <input type="range" min="1" max="10" value={config.borderWidth} onChange={set("borderWidth")} disabled={!config.border} />
                  </label>
                </Section>
                <Section title="Corners" defaultOpen summary={`${config.borderRadius}px radius`}>
                  <label className="field">
                    <span>Corner radius — {config.borderRadius}px</span>
                    <input type="range" min="0" max="40" value={config.borderRadius} onChange={set("borderRadius")} />
                  </label>
                </Section>
              </>
            )}

            {tab === "background" && (
              <>
                <Section
                  title="Dimensions"
                  defaultOpen
                  summary={`${config.autoWidth ? "auto" : config.bannerWidth} × ${config.autoHeight ? "auto" : config.bannerHeight}`}
                >
                <div className="field">
                  <span>Width</span>
                  <div className="seg">
                    <button type="button" className={config.autoWidth ? "on" : ""} onClick={() => setWidthAuto(true)}>Fit text</button>
                    <button type="button" className={!config.autoWidth ? "on" : ""} onClick={() => setWidthAuto(false)}>Custom</button>
                  </div>
                </div>
                {!config.autoWidth && (
                  <label className="field">
                    <span>Banner width — {config.bannerWidth}px</span>
                    <input type="range" min="200" max="1000" step="10" value={config.bannerWidth} onChange={set("bannerWidth")} />
                  </label>
                )}

                <div className="field">
                  <span>Height</span>
                  <div className="seg">
                    <button type="button" className={config.autoHeight ? "on" : ""} onClick={() => setHeightAuto(true)}>Fit text</button>
                    <button type="button" className={!config.autoHeight ? "on" : ""} onClick={() => setHeightAuto(false)}>Custom</button>
                  </div>
                </div>
                {!config.autoHeight && (
                  <label className="field">
                    <span>Banner height — {config.bannerHeight}px</span>
                    <input type="range" min="60" max="400" step="10" value={config.bannerHeight} onChange={set("bannerHeight")} />
                  </label>
                )}
                </Section>

                <Section title="Fill" defaultOpen>
                  <PaintControl label="Background" paint={config.bgPaint} onChange={setPaint("bgPaint")} />
                </Section>
              </>
            )}

            {tab === "effects" && (
              <EffectsTab
                effects={config.effects}
                onChange={effects => setConfig(c => ({ ...c, effects }))}
              />
            )}
          </div>
        </aside>

        <main className="main">
        <section className="preview">
          <h2>Preview</h2>
          <div className="stage">
            <img key={dataUri} src={dataUri} alt={config.sentences[0] || "preview"} />
          </div>
        </section>

        <section className="export">
          <h2>Export</h2>
          <div className="actions">
            <button onClick={() => copy(svg, "svg")}>{copied === "svg" ? "Copied" : "Copy SVG"}</button>
            <button onClick={download}>Download .svg</button>
          </div>

          <label className="field">
            <span>Link URL (optional)</span>
            <input
              type="text"
              value={config.linkUrl}
              onChange={set("linkUrl")}
              placeholder="github.com/username"
            />
          </label>

          <label className="field">
            <span>README snippet</span>
            <div className="snippet">
              <code>{markdown}</code>
              <button className="ghost" onClick={() => copy(markdown, "md")}>{copied === "md" ? "copied" : "copy"}</button>
            </div>
          </label>

          <div className="guide">
            <h3>How to use</h3>
            <ol>
              <li>Customise your banner with the panel on the left.</li>
              <li>Hit <b>Download .svg</b>, or <b>Copy SVG</b> to grab the markup.</li>
              <li>Add the file to an <code>assets</code> folder in your profile repo.</li>
              <li>Paste the snippet above into your <code>README.md</code>.</li>
              {link && <li>The snippet wraps the image in your link, so clicking the banner on GitHub opens <code>{link}</code>.</li>}
            </ol>
          </div>
        </section>
        </main>
      </div>
    </div>
  );
}