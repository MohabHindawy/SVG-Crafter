import { useEffect, useMemo, useState } from "react";
import {
  generateSvg,
  adjustBrightness,
  autoSize,
  normalizeUrl,
} from "./generateSvg";
import {
  TEMPLATES,
  getTemplate,
  defaultTemplateState,
  sanitizeTemplateState,
} from "./templates";
import "./App.css";

// Font styles must match SVG text attributes so canvas measurement aligns with SVG typewriter clip paths.
function measureTextWidth(text, fontSize, fontWeight, fontFamily) {
  const canvas =
    measureTextWidth._c ||
    (measureTextWidth._c = document.createElement("canvas"));
  const ctx = canvas.getContext("2d");
  ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
  return Math.ceil(ctx.measureText(text || " ").width);
}

function measureSentence(text, fontSize, fontWeight, fontFamily) {
  const prefixes = [0];
  for (let k = 1; k <= text.length; k++)
    prefixes.push(
      measureTextWidth(text.slice(0, k), fontSize, fontWeight, fontFamily),
    );
  return {
    text,
    width:
      prefixes[prefixes.length - 1] ||
      measureTextWidth(text, fontSize, fontWeight, fontFamily),
    prefixes,
  };
}

function bufferToBase64(buf) {
  const bytes = new Uint8Array(buf);
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk)
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  return btoa(bin);
}

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
      weight: (body.match(/font-weight:\s*([^;]+);/)?.[1] || "400").trim(),
      style: (body.match(/font-style:\s*([^;]+);/)?.[1] || "normal").trim(),
    });
  }
  if (found.length) return found.find((f) => f.label === "latin") || found[0];
  const url = (css.match(/url\((https:\/\/[^)]+\.woff2)\)/) || [])[1];
  return url ? { url, weight: "400", style: "normal" } : null;
}

// Embeds WOFF2 data URI directly so the exported SVG remains standalone without network dependencies.
async function loadGoogleFont(family) {
  const res = await fetch(
    `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}&display=swap`,
  );
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
    // If it fails, measurement might be slightly off in the browser, but the embedded SVG still renders
  }
  return { family, css };
}

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

const familyFor = (fontId, embedFont) =>
  embedFont
    ? `'${embedFont.family}', ${FONTS[0].stack}`
    : (FONTS.find((f) => f.id === fontId) || FONTS[0]).stack;

const TABS = [
  { id: "text", label: "Text" },
  { id: "border-background", label: "Background" },
  { id: "effects", label: "Effects" },
  { id: "templates", label: "Templates" },
];

const MAX_SENTENCES = 6;
const MAX_STOPS = 8;

// System font fallbacks ensure rendering when GitHub image proxies block external network fonts.
const FONTS = [
  {
    id: "sans",
    label: "Sans",
    stack:
      "system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  },
  {
    id: "serif",
    label: "Serif",
    stack: "Georgia, 'Times New Roman', Times, serif",
  },
  {
    id: "mono",
    label: "Mono",
    stack:
      "ui-monospace, 'SFMono-Regular', Menlo, Consolas, 'Liberation Mono', monospace",
  },
  {
    id: "rounded",
    label: "Rounded",
    stack: "'Trebuchet MS', 'Segoe UI', Verdana, system-ui, sans-serif",
  },
  {
    id: "condensed",
    label: "Condensed",
    stack: "'Arial Narrow', 'Helvetica Neue', Arial, sans-serif",
  },
];

const GOOGLE_FONTS = [
  "Inter",
  "Poppins",
  "Montserrat",
  "Roboto Slab",
  "Playfair Display",
  "Lobster",
  "Pacifico",
  "Bebas Neue",
  "Caveat",
  "Fira Code",
];

const FONT_LIBRARY = [
  "Abril Fatface",
  "Albert Sans",
  "Alegreya",
  "Alegreya Sans",
  "Amatic SC",
  "Anton",
  "Archivo",
  "Archivo Black",
  "Arvo",
  "Assistant",
  "Audiowide",
  "Baloo 2",
  "Barlow",
  "Barlow Condensed",
  "Bebas Neue",
  "Be Vietnam Pro",
  "Bitter",
  "Bodoni Moda",
  "Bricolage Grotesque",
  "Bungee",
  "Cabin",
  "Caveat",
  "Catamaran",
  "Chivo",
  "Cinzel",
  "Comfortaa",
  "Cormorant",
  "Cormorant Garamond",
  "Crimson Text",
  "Dancing Script",
  "DM Mono",
  "DM Sans",
  "DM Serif Display",
  "Domine",
  "EB Garamond",
  "Epilogue",
  "Exo",
  "Exo 2",
  "Figtree",
  "Fira Code",
  "Fira Mono",
  "Fira Sans",
  "Frank Ruhl Libre",
  "Fredoka",
  "Gabarito",
  "Great Vibes",
  "Hanken Grotesk",
  "Heebo",
  "Hind",
  "IBM Plex Mono",
  "IBM Plex Sans",
  "IBM Plex Serif",
  "Inconsolata",
  "Indie Flower",
  "Inter",
  "Instrument Sans",
  "Italiana",
  "JetBrains Mono",
  "Josefin Sans",
  "Jost",
  "Kanit",
  "Karla",
  "Lato",
  "Lexend",
  "Libre Baskerville",
  "Libre Franklin",
  "Lobster",
  "Lora",
  "Manrope",
  "Marcellus",
  "Merriweather",
  "Monoton",
  "Montserrat",
  "Mukta",
  "Mulish",
  "Noto Sans",
  "Noto Serif",
  "Nunito",
  "Nunito Sans",
  "Onest",
  "Open Sans",
  "Orbitron",
  "Oswald",
  "Outfit",
  "Overpass",
  "Pacifico",
  "Pathway Gothic One",
  "Permanent Marker",
  "Philosopher",
  "Playfair Display",
  "Plus Jakarta Sans",
  "Poppins",
  "Prata",
  "Press Start 2P",
  "PT Sans",
  "PT Serif",
  "Quicksand",
  "Raleway",
  "Red Hat Display",
  "Red Hat Text",
  "Righteous",
  "Roboto",
  "Roboto Condensed",
  "Roboto Mono",
  "Roboto Slab",
  "Rubik",
  "Sacramento",
  "Saira",
  "Saira Condensed",
  "Satisfy",
  "Schibsted Grotesk",
  "Sen",
  "Shadows Into Light",
  "Sora",
  "Source Code Pro",
  "Source Sans 3",
  "Source Serif 4",
  "Space Grotesk",
  "Space Mono",
  "Spectral",
  "Syne",
  "Teko",
  "Titillium Web",
  "Tinos",
  "Ubuntu",
  "Ubuntu Mono",
  "Unbounded",
  "Urbanist",
  "Varela Round",
  "Vollkorn",
  "Work Sans",
  "Yeseva One",
  "Zilla Slab",
];

const TRANSITIONS = [
  { id: "none", label: "None" },
  { id: "typing", label: "Typing" },
  { id: "fade", label: "Fade" },
  { id: "zoom", label: "Zoom" },
  { id: "slide", label: "Slide" },
  { id: "rise", label: "Rise" },
  { id: "blur", label: "Blur" },
];

const ALIGNMENTS = [
  { id: "left", label: "Align left" },
  { id: "center", label: "Align center" },
  { id: "right", label: "Align right" },
  { id: "justify", label: "Justify" },
];

const MOTIONS = [
  { id: "none", label: "No motion" },
  { id: "float", label: "Float" },
  { id: "bob", label: "Bob (up/down)" },
  { id: "sway", label: "Sway (left/right)" },
  { id: "pulse", label: "Pulse (zoom)" },
  { id: "wobble", label: "Wobble (rock)" },
  { id: "orbit", label: "Orbit (circle)" },
];

const EFFECT_DEFAULTS = [
  {
    id: "lightning",
    enabled: false,
    color: "#a78bfa",
    opacity: 85,
    speed: 5,
    bolts: 3,
    jitter: 8,
  },
  {
    id: "soundwaves",
    enabled: false,
    color: "#38bdf8",
    opacity: 45,
    speed: 4,
    count: 4,
    strokeWidth: 1.5,
  },
  {
    id: "particles",
    enabled: false,
    color: "#f472b6",
    opacity: 70,
    speed: 3,
    count: 15,
    size: 3,
  },
  {
    id: "scanlines",
    enabled: false,
    color: "#ffffff",
    opacity: 20,
    speed: 3,
    lineGap: 4,
    beamHeight: 36,
  },
  {
    id: "shimmer",
    enabled: true,
    color: "#58a6ff",
    opacity: 20,
    speed: 3,
    beamWidth: 100,
  },
  {
    id: "pulserings",
    enabled: false,
    color: "#818cf8",
    opacity: 60,
    speed: 3,
    count: 3,
    strokeWidth: 1.5,
  },
  {
    id: "matrixrain",
    enabled: false,
    color: "#4ade80",
    opacity: 55,
    speed: 5,
    columns: 12,
    dotSize: 3,
  },
  {
    id: "borderbeam",
    enabled: false,
    color: "#38bdf8",
    opacity: 90,
    speed: 4,
    count: 1,
    tailLength: 18,
    thickness: 3,
  },
  {
    id: "sparkles",
    enabled: false,
    color: "#fde047",
    opacity: 85,
    speed: 4,
    count: 10,
    size: 5,
  },
  {
    id: "confetti",
    enabled: false,
    color: "#f472b6",
    opacity: 90,
    speed: 4,
    count: 18,
    size: 5,
  },
  {
    id: "aurora",
    enabled: true,
    color: "#238636",
    opacity: 25,
    speed: 2,
    blobs: 3,
    size: 80,
  },
  {
    id: "blurrylights",
    enabled: true,
    color: "#58a6ff",
    opacity: 30,
    speed: 2,
    count: 8,
    size: 10,
  },
  {
    id: "synthgrid",
    enabled: false,
    color: "#ff2d95",
    opacity: 55,
    speed: 4,
    columns: 7,
    rows: 5,
  },
  {
    id: "starfield",
    enabled: false,
    color: "#dbeafe",
    opacity: 70,
    speed: 5,
    count: 18,
    streak: 14,
  },
  {
    id: "vignette",
    enabled: false,
    color: "#000000",
    opacity: 60,
    speed: 5,
    flicker: 25,
  },
];

const EFFECT_META = [
  {
    id: "lightning",
    label: "Lightning",
    desc: "Zigzag bolts flicker along the banner edges",
    controls: [
      { key: "bolts", label: "Bolts", type: "int", min: 1, max: 6, step: 1 },
      {
        key: "jitter",
        label: "Jitter",
        type: "float",
        min: 2,
        max: 20,
        step: 1,
        fmt: (v) => `${v}px`,
      },
    ],
  },
  {
    id: "soundwaves",
    label: "Sound Waves",
    desc: "Sine waves ripple horizontally across the banner",
    controls: [
      { key: "count", label: "Waves", type: "int", min: 1, max: 8, step: 1 },
      {
        key: "strokeWidth",
        label: "Thickness",
        type: "float",
        min: 0.5,
        max: 4,
        step: 0.5,
        fmt: (v) => `${v}px`,
      },
    ],
  },
  {
    id: "particles",
    label: "Particles",
    desc: "Glowing sparks drift upward and fade out",
    controls: [
      { key: "count", label: "Count", type: "int", min: 3, max: 40, step: 1 },
      {
        key: "size",
        label: "Size",
        type: "float",
        min: 1,
        max: 10,
        step: 0.5,
        fmt: (v) => `${v}px`,
      },
    ],
  },
  {
    id: "scanlines",
    label: "Scanlines",
    desc: "CRT grid with a glowing beam sweeping top to bottom",
    controls: [
      {
        key: "lineGap",
        label: "Line gap",
        type: "int",
        min: 2,
        max: 20,
        step: 1,
        fmt: (v) => `${v}px`,
      },
      {
        key: "beamHeight",
        label: "Beam height",
        type: "int",
        min: 8,
        max: 100,
        step: 4,
        fmt: (v) => `${v}px`,
      },
    ],
  },
  {
    id: "shimmer",
    label: "Shimmer",
    desc: "Diagonal gloss highlight sweeps across the banner",
    controls: [
      {
        key: "beamWidth",
        label: "Beam width",
        type: "int",
        min: 20,
        max: 300,
        step: 10,
        fmt: (v) => `${v}px`,
      },
    ],
  },
  {
    id: "pulserings",
    label: "Pulse Rings",
    desc: "Rings expand outward from the center and fade",
    controls: [
      { key: "count", label: "Rings", type: "int", min: 1, max: 8, step: 1 },
      {
        key: "strokeWidth",
        label: "Thickness",
        type: "float",
        min: 0.5,
        max: 4,
        step: 0.5,
        fmt: (v) => `${v}px`,
      },
    ],
  },
  {
    id: "matrixrain",
    label: "Matrix Rain",
    desc: "Columns of glowing dots rain downward",
    controls: [
      {
        key: "columns",
        label: "Columns",
        type: "int",
        min: 3,
        max: 30,
        step: 1,
      },
      {
        key: "dotSize",
        label: "Dot size",
        type: "float",
        min: 1,
        max: 8,
        step: 0.5,
        fmt: (v) => `${v}px`,
      },
    ],
  },
  {
    id: "borderbeam",
    label: "Border Beam",
    desc: "Glowing comets orbit around the banner's border",
    controls: [
      { key: "count", label: "Comets", type: "int", min: 1, max: 4, step: 1 },
      {
        key: "tailLength",
        label: "Tail",
        type: "int",
        min: 5,
        max: 40,
        step: 1,
        fmt: (v) => `${v}%`,
      },
      {
        key: "thickness",
        label: "Thickness",
        type: "float",
        min: 1,
        max: 8,
        step: 0.5,
        fmt: (v) => `${v}px`,
      },
    ],
  },
  {
    id: "sparkles",
    label: "Sparkles",
    desc: "Four-point stars twinkle in and out across the banner",
    controls: [
      { key: "count", label: "Count", type: "int", min: 3, max: 30, step: 1 },
      {
        key: "size",
        label: "Size",
        type: "float",
        min: 2,
        max: 12,
        step: 0.5,
        fmt: (v) => `${v}px`,
      },
    ],
  },
  {
    id: "confetti",
    label: "Confetti",
    desc: "Colourful pieces tumble down, hues derived from your colour",
    controls: [
      { key: "count", label: "Count", type: "int", min: 5, max: 40, step: 1 },
      {
        key: "size",
        label: "Size",
        type: "float",
        min: 2,
        max: 10,
        step: 0.5,
        fmt: (v) => `${v}px`,
      },
    ],
  },
  {
    id: "aurora",
    label: "Aurora",
    desc: "Soft blurred colour blobs drift slowly behind the text",
    controls: [
      { key: "blobs", label: "Blobs", type: "int", min: 1, max: 4, step: 1 },
      {
        key: "size",
        label: "Size",
        type: "int",
        min: 30,
        max: 120,
        step: 5,
        fmt: (v) => `${v}%`,
      },
    ],
  },
  {
    id: "blurrylights",
    label: "Blurry lights",
    desc: "Soft out-of-focus orbs drift slowly upward",
    controls: [
      { key: "count", label: "Orbs", type: "int", min: 3, max: 25, step: 1 },
      {
        key: "size",
        label: "Size",
        type: "int",
        min: 4,
        max: 24,
        step: 1,
        fmt: (v) => `${v}px`,
      },
    ],
  },
  {
    id: "synthgrid",
    label: "Synthwave Grid",
    desc: "Retro 3D wireframe floor scrolls toward the viewer",
    controls: [
      {
        key: "columns",
        label: "Columns",
        type: "int",
        min: 3,
        max: 12,
        step: 1,
      },
      { key: "rows", label: "Rows", type: "int", min: 2, max: 8, step: 1 },
    ],
  },
  {
    id: "starfield",
    label: "Starfield",
    desc: "Hyperspace streaks shoot from the centre outward",
    controls: [
      { key: "count", label: "Streaks", type: "int", min: 6, max: 40, step: 1 },
      {
        key: "streak",
        label: "Length",
        type: "int",
        min: 5,
        max: 30,
        step: 1,
        fmt: (v) => `${v}%`,
      },
    ],
  },
  {
    id: "vignette",
    label: "CRT Vignette",
    desc: "Edges darken with a subtle CRT flicker — pairs with scanlines",
    controls: [
      {
        key: "flicker",
        label: "Flicker",
        type: "int",
        min: 0,
        max: 100,
        step: 5,
        fmt: (v) => `${v}%`,
      },
    ],
  },
];

const EFFECT_GROUPS = [
  {
    title: "Ambient",
    ids: [
      "aurora",
      "blurrylights",
      "shimmer",
      "scanlines",
      "vignette",
      "sparkles",
    ],
  },
  {
    title: "Motion",
    ids: [
      "particles",
      "confetti",
      "matrixrain",
      "soundwaves",
      "synthgrid",
      "starfield",
    ],
  },
  { title: "Accent", ids: ["lightning", "pulserings", "borderbeam"] },
];

// ============================================================================
// 4. Reusable UI components
// ============================================================================

function AlignIcon({ type }) {
  const rows =
    {
      left: [
        [2, 14],
        [2, 9],
        [2, 11],
      ],
      center: [
        [2, 14],
        [5, 11],
        [3, 13],
      ],
      right: [
        [2, 14],
        [7, 14],
        [5, 14],
      ],
      justify: [
        [2, 14],
        [2, 14],
        [2, 14],
      ],
    }[type] || [];
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      aria-hidden="true"
    >
      {rows.map(([x1, x2], i) => (
        <line key={i} x1={x1} x2={x2} y1={4 + i * 4} y2={4 + i * 4} />
      ))}
    </svg>
  );
}

function MotionIcon({ type }) {
  const c = "currentColor";
  const common = {
    width: 16,
    height: 16,
    viewBox: "0 0 16 16",
    fill: "none",
    stroke: c,
    strokeWidth: 1.6,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": true,
  };
  switch (type) {
    case "none":
      return (
        <svg {...common}>
          <circle cx="8" cy="8" r="1.4" fill={c} stroke="none" />
        </svg>
      );
    case "float":
      return (
        <svg {...common}>
          <path d="M3 10c2-3 3 3 5 0s3-3 5 0" />
        </svg>
      );
    case "bob":
      return (
        <svg {...common}>
          <path d="M8 3v10" />
          <path d="M5 6l3-3 3 3" />
          <path d="M5 10l3 3 3-3" />
        </svg>
      );
    case "sway":
      return (
        <svg {...common}>
          <path d="M3 8h10" />
          <path d="M6 5L3 8l3 3" />
          <path d="M10 5l3 3-3 3" />
        </svg>
      );
    case "pulse":
      return (
        <svg {...common}>
          <circle cx="8" cy="8" r="2.5" />
          <circle cx="8" cy="8" r="5.5" opacity="0.5" />
        </svg>
      );
    case "wobble":
      return (
        <svg {...common}>
          <path d="M8 13V6" />
          <path d="M4.5 8.5L8 4l3.5 4.5" />
        </svg>
      );
    case "orbit":
      return (
        <svg {...common}>
          <circle cx="8" cy="8" r="5" />
          <circle cx="13" cy="8" r="1.6" fill={c} stroke="none" />
        </svg>
      );
    default:
      return null;
  }
}

const uid = () => Math.random().toString(36).slice(2, 9);
const newStop = (color = "#8b7cff") => ({
  id: uid(),
  color,
  opacity: 100,
  brightness: 100,
});
const solidPaint = (color) => ({
  type: "solid",
  color,
  opacity: 100,
  brightness: 100,
  angle: 0,
  anim: "none",
  animSpeed: 3,
  animReverse: false,
  stops: [newStop(color)],
});
const gradientPaint = (c1, c2, angle = 0) => ({
  type: "gradient",
  color: c1,
  opacity: 100,
  brightness: 100,
  angle,
  anim: "none",
  animSpeed: 3,
  animReverse: false,
  stops: [newStop(c1), newStop(c2)],
});
const alphaHex = (o) =>
  Math.round((o / 100) * 255)
    .toString(16)
    .padStart(2, "0");

// CSS linear-gradient angles are offset by 90deg relative to SVG coordinate angles.
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

function StopRow({
  value,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
  disabled,
  dragging,
  onDragStart,
  onDragEnter,
  onDragEnd,
}) {
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
              onDragStart?.();
            }}
            role="button"
            aria-label="Drag to reorder"
            title="Drag to reorder"
          >
            ⠿
          </span>
          <button
            type="button"
            onClick={onMoveUp}
            disabled={disabled}
            aria-label="Move up"
          >
            ▲
          </button>
          <button
            type="button"
            onClick={onMoveDown}
            disabled={disabled}
            aria-label="Move down"
          >
            ▼
          </button>
        </div>
      )}
      <input
        type="color"
        value={value.color}
        disabled={disabled}
        onChange={(e) => patch({ color: e.target.value })}
      />
      <div className="sliders">
        <label>
          <i>Opacity</i>
          <input
            type="range"
            min="0"
            max="100"
            value={value.opacity}
            disabled={disabled}
            onChange={(e) => patch({ opacity: Number(e.target.value) })}
          />
          <em>{value.opacity}%</em>
        </label>
        <label>
          <i>Brightness</i>
          <input
            type="range"
            min="0"
            max="200"
            value={value.brightness}
            disabled={disabled}
            onChange={(e) => patch({ brightness: Number(e.target.value) })}
          />
          <em>{value.brightness}%</em>
        </label>
      </div>
      {onRemove && (
        <button
          type="button"
          className="remove"
          onClick={onRemove}
          disabled={disabled}
          aria-label="Remove colour"
        >
          ✕
        </button>
      )}
    </div>
  );
}

function PaintControl({ label, paint, onChange, disabled }) {
  const isGrad = paint.type === "gradient";
  const [dragId, setDragId] = useState(null);

  const setType = (type) => {
    if (type === "gradient" && paint.stops.length < 2) {
      onChange({
        ...paint,
        type,
        stops: [newStop(paint.color), newStop("#bd34fe")],
      });
    } else {
      onChange({ ...paint, type });
    }
  };

  const setStops = (stops) => onChange({ ...paint, stops });
  const updateStop = (i, next) =>
    setStops(paint.stops.map((s, idx) => (idx === i ? next : s)));
  const addStop = () =>
    paint.stops.length < MAX_STOPS &&
    setStops([...paint.stops, newStop("#41d1ff")]);
  const removeStop = (i) =>
    paint.stops.length > 2 &&
    setStops(paint.stops.filter((_, idx) => idx !== i));
  const move = (i, dir) => {
    const j = i + dir;
    if (j < 0 || j >= paint.stops.length) return;
    const next = [...paint.stops];
    [next[i], next[j]] = [next[j], next[i]];
    setStops(next);
  };

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
          <button
            type="button"
            className={!isGrad ? "on" : ""}
            disabled={disabled}
            onClick={() => setType("solid")}
          >
            Solid
          </button>
          <button
            type="button"
            className={isGrad ? "on" : ""}
            disabled={disabled}
            onClick={() => setType("gradient")}
          >
            Gradient
          </button>
        </div>
      </div>

      {!isGrad && (
        <StopRow
          value={{
            color: paint.color,
            opacity: paint.opacity,
            brightness: paint.brightness,
          }}
          onChange={(v) => onChange({ ...paint, ...v })}
          disabled={disabled}
        />
      )}

      {isGrad && (
        <>
          <div
            className="gradbar"
            style={{
              background: disabled ? "var(--panel-2)" : cssGradient(paint),
            }}
          />
          <label className="field dir">
            <span>Direction — {paint.angle}°</span>
            <input
              type="range"
              min="0"
              max="360"
              value={paint.angle}
              disabled={disabled}
              onChange={(e) =>
                onChange({ ...paint, angle: Number(e.target.value) })
              }
            />
          </label>
          <div className="stops">
            {paint.stops.map((s, i) => (
              <StopRow
                key={s.id}
                value={s}
                onChange={(v) => updateStop(i, v)}
                onRemove={
                  paint.stops.length > 2 ? () => removeStop(i) : undefined
                }
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
          <button
            type="button"
            className="add"
            onClick={addStop}
            disabled={disabled || paint.stops.length >= MAX_STOPS}
          >
            + Add colour
          </button>

          <div className="gradanim">
            <div className="field">
              <span>Animation</span>
              <div className="seg">
                <button
                  type="button"
                  className={paint.anim === "none" ? "on" : ""}
                  disabled={disabled}
                  onClick={() => onChange({ ...paint, anim: "none" })}
                >
                  None
                </button>
                <button
                  type="button"
                  className={paint.anim === "rotate" ? "on" : ""}
                  disabled={disabled}
                  onClick={() => onChange({ ...paint, anim: "rotate" })}
                >
                  Rotate
                </button>
                <button
                  type="button"
                  className={paint.anim === "move" ? "on" : ""}
                  disabled={disabled}
                  onClick={() => onChange({ ...paint, anim: "move" })}
                >
                  Move
                </button>
              </div>
            </div>
            {paint.anim !== "none" && (
              <>
                <label className="field">
                  <span>Animation speed — {paint.animSpeed}</span>
                  <input
                    type="range"
                    min="1"
                    max="10"
                    value={paint.animSpeed}
                    disabled={disabled}
                    onChange={(e) =>
                      onChange({ ...paint, animSpeed: Number(e.target.value) })
                    }
                  />
                </label>
                <div className="field">
                  <span>Direction</span>
                  <div className="seg">
                    {paint.anim === "rotate" ? (
                      <>
                        <button
                          type="button"
                          className={!paint.animReverse ? "on" : ""}
                          disabled={disabled}
                          onClick={() =>
                            onChange({ ...paint, animReverse: false })
                          }
                        >
                          Clockwise
                        </button>
                        <button
                          type="button"
                          className={paint.animReverse ? "on" : ""}
                          disabled={disabled}
                          onClick={() =>
                            onChange({ ...paint, animReverse: true })
                          }
                        >
                          Counter
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          className={!paint.animReverse ? "on" : ""}
                          disabled={disabled}
                          onClick={() =>
                            onChange({ ...paint, animReverse: false })
                          }
                        >
                          With gradient
                        </button>
                        <button
                          type="button"
                          className={paint.animReverse ? "on" : ""}
                          disabled={disabled}
                          onClick={() =>
                            onChange({ ...paint, animReverse: true })
                          }
                        >
                          Opposite
                        </button>
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

// In-memory map persists accordion states across tab switches without persisting to storage.
const openMemory = new Map();
function useRememberedOpen(key, defaultOpen) {
  const [open, setOpen] = useState(() =>
    openMemory.has(key) ? openMemory.get(key) : defaultOpen,
  );
  const toggle = () =>
    setOpen((o) => {
      const next = !o;
      openMemory.set(key, next);
      return next;
    });
  return [open, toggle];
}

function Section({
  title,
  icon,
  summary,
  badge,
  defaultOpen = false,
  open,
  onToggle,
  children,
}) {
  const [localOpen, localToggle] = useRememberedOpen(
    `sec:${title}`,
    defaultOpen,
  );
  const isControlled = open !== undefined;
  const expanded = isControlled ? open : localOpen;
  const toggle = () => (isControlled ? onToggle?.(!expanded) : localToggle());

  return (
    <div className={"section" + (expanded ? " section-open" : "")}>
      <button
        type="button"
        className="section-head"
        onClick={toggle}
        aria-expanded={expanded}
      >
        {icon && <span className="section-icon">{icon}</span>}
        <span className="section-title">{title}</span>
        {badge != null && badge > 0 && (
          <span className="section-badge">{badge}</span>
        )}
        {!expanded && summary && (
          <span className="section-summary">{summary}</span>
        )}
        <span className={"section-chevron" + (expanded ? " open" : "")}>›</span>
      </button>
      {expanded && <div className="section-body">{children}</div>}
    </div>
  );
}

function EffectCard({ meta, eff, onChange }) {
  const [open, toggleOpen] = useRememberedOpen(`eff:${eff.id}`, false);
  const patch = (updates) => onChange({ ...eff, ...updates });

  return (
    <div className={"eff-card" + (eff.enabled ? " eff-on" : "")}>
      <div className="eff-header">
        <label className="eff-toggle-row">
          <input
            type="checkbox"
            checked={eff.enabled}
            onChange={(e) => patch({ enabled: e.target.checked })}
          />
          <span className="eff-label">{meta.label}</span>
        </label>
        <button
          type="button"
          className={"eff-chevron" + (open ? " open" : "")}
          onClick={toggleOpen}
          aria-label={open ? "Collapse" : "Expand"}
        >
          ›
        </button>
      </div>

      {!open && <p className="eff-desc">{meta.desc}</p>}

      {open && (
        <div className="eff-controls">
          <div className="eff-row">
            <span className="eff-row-label">Colour</span>
            <input
              type="color"
              className="eff-swatch"
              value={eff.color}
              onChange={(e) => patch({ color: e.target.value })}
            />
          </div>
          <div className="eff-row">
            <span className="eff-row-label">Opacity</span>
            <input
              type="range"
              min={5}
              max={100}
              step={5}
              value={eff.opacity}
              onChange={(e) => patch({ opacity: Number(e.target.value) })}
            />
            <em className="eff-val">{eff.opacity}%</em>
          </div>
          <div className="eff-row">
            <span className="eff-row-label">Speed</span>
            <input
              type="range"
              min={1}
              max={10}
              step={1}
              value={eff.speed}
              onChange={(e) => patch({ speed: Number(e.target.value) })}
            />
            <em className="eff-val">{eff.speed}</em>
          </div>
          {meta.controls.map((ctrl) => {
            const val = eff[ctrl.key] ?? 0;
            const display = ctrl.fmt ? ctrl.fmt(val) : val;
            const parse =
              ctrl.type === "int"
                ? (e) => patch({ [ctrl.key]: parseInt(e.target.value, 10) })
                : (e) => patch({ [ctrl.key]: parseFloat(e.target.value) });
            return (
              <div className="eff-row" key={ctrl.key}>
                <span className="eff-row-label">{ctrl.label}</span>
                <input
                  type="range"
                  min={ctrl.min}
                  max={ctrl.max}
                  step={ctrl.step}
                  value={val}
                  onChange={parse}
                />
                <em className="eff-val">{display}</em>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function EffectsTab({ effects, onChange }) {
  const update = (id, updated) =>
    onChange(
      effects.some((e) => e.id === id)
        ? effects.map((e) => (e.id === id ? updated : e))
        : [...effects, updated],
    );
  const activeIn = (ids) =>
    ids.filter((id) => effects.find((e) => e.id === id)?.enabled).length;

  return (
    <div>
      {EFFECT_GROUPS.map((group, gi) => (
        <Section
          key={group.title}
          title={group.title}
          defaultOpen={gi === 0}
          badge={activeIn(group.ids)}
        >
          <div className="eff-list">
            {group.ids.map((id) => {
              const meta = EFFECT_META.find((m) => m.id === id);
              const eff =
                effects.find((e) => e.id === id) ||
                EFFECT_DEFAULTS.find((d) => d.id === id);
              return (
                <EffectCard
                  key={id}
                  meta={meta}
                  eff={eff}
                  onChange={(updated) => update(id, updated)}
                />
              );
            })}
          </div>
        </Section>
      ))}
    </div>
  );
}

function TemplateCard({ tpl, active, value, onToggle, onChange, Section }) {
  const [open, toggleOpen] = useRememberedOpen(`tpl:${tpl.id}`, false);

  return (
    <div className={"eff-card" + (active ? " eff-on" : "")}>
      <div
        className="eff-header tpl-header"
        onClick={toggleOpen}
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onKeyDown={(e) => {
          if (
            e.target === e.currentTarget &&
            (e.key === "Enter" || e.key === " ")
          ) {
            e.preventDefault();
            toggleOpen();
          }
        }}
      >
        <input
          type="checkbox"
          className="tpl-checkbox"
          checked={active}
          onChange={(e) => onToggle(e.target.checked)}
          onClick={(e) => e.stopPropagation()}
          aria-label={`Enable ${tpl.name}`}
        />
        <span className="eff-label" style={{ flex: 1 }}>
          {tpl.name}
        </span>
        <span
          className={"eff-chevron" + (open ? " open" : "")}
          aria-hidden="true"
        >
          ›
        </span>
      </div>

      {!open && (
        <p className="eff-desc tpl-desc" onClick={toggleOpen}>
          {tpl.desc}
        </p>
      )}

      {open && (
        <div style={{ marginTop: "12px" }}>
          <tpl.Editor value={value} onChange={onChange} Section={Section} />
        </div>
      )}
    </div>
  );
}

function TemplatesTab({ template, setActive, setCfg, Section }) {
  return (
    <div
      className="templates-tab"
      style={{ display: "flex", flexDirection: "column", gap: "10px" }}
    >
      {TEMPLATES.map((tpl) => (
        <TemplateCard
          key={tpl.id}
          tpl={tpl}
          active={template?.active === tpl.id}
          value={template?.configs?.[tpl.id]}
          onToggle={(on) => setActive(on ? tpl.id : null)}
          onChange={(next) => setCfg(tpl.id, next)}
          Section={Section}
        />
      ))}
    </div>
  );
}

const defaultConfig = () => ({
  sentences: ["Welcome 👋", "SVG Crafter"],
  sentenceAligns: ["left", "left"],
  sentenceMotions: ["float", "float"],
  sentenceIds: [uid(), uid()],
  motionSpeed: 1,
  fontSize: 40,
  fontWeight: 700,
  fontId: "sans",
  googleFont: "",
  embedFont: null,
  transition: "rise",
  transitionDuration: 0.6,
  typingMode: "smooth",
  typingSpeed: 1,
  cursor: true,
  holdDuration: 2.5,
  textPaint: gradientPaint("#58a6ff", "#3fb950", 45),
  border: true,
  borderWidth: 1,
  borderRadius: 6,
  borderPaint: { ...solidPaint("#30363d"), opacity: 100 },
  bgPaint: solidPaint("#0d1117"),
  glow: true,
  autoWidth: true,
  bannerWidth: 600,
  autoHeight: true,
  bannerHeight: 120,
  linkUrl: "",
  effects: EFFECT_DEFAULTS,
  template: defaultTemplateState(),
});

// Chunking avoids maximum call stack size limits in String.fromCharCode.
const b64encode = (str) => {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000)
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
};
const b64decode = (b64) => {
  const bin = atob(b64);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
};

const META_RE =
  /<metadata id="svgcrafter-config">([A-Za-z0-9+/=]+)<\/metadata>/;

// Embeds configuration in SVG metadata for round-trip importing; omits font binaries to reduce payload size.
function embedConfig(svg, config) {
  const rest = { ...config };
  delete rest.embedFont;
  const meta = `<metadata id="svgcrafter-config">${b64encode(JSON.stringify(rest))}</metadata>`;
  const at = svg.indexOf(">") + 1;
  return svg.slice(0, at) + meta + svg.slice(at);
}

function sanitizeConfig(raw) {
  const base = defaultConfig();
  const cfg = { ...base, ...raw, embedFont: null };

  const sentences = (
    Array.isArray(cfg.sentences) ? cfg.sentences : base.sentences
  )
    .slice(0, MAX_SENTENCES)
    .map((t) => String(t ?? ""));
  if (!sentences.length) sentences.push("");
  const syncArr = (arr, fill) =>
    sentences.map((_, i) =>
      Array.isArray(arr) && arr[i] != null ? arr[i] : fill,
    );
  cfg.sentences = sentences;
  cfg.sentenceAligns = syncArr(cfg.sentenceAligns, "left");
  cfg.sentenceMotions = syncArr(cfg.sentenceMotions, "none");
  cfg.sentenceIds = sentences.map(() => uid());

  const imported = Array.isArray(cfg.effects) ? cfg.effects : [];
  cfg.effects = EFFECT_DEFAULTS.map((d) => {
    const found = imported.find((e) => e && e.id === d.id);
    return found ? { ...d, ...found } : d;
  });

  cfg.template = sanitizeTemplateState(raw?.template);

  return cfg;
}

// Reconstructs configuration from DOM attributes for legacy SVG exports.
const LEGACY_EFFECT_MARKERS = {
  ltClip: "lightning",
  swClip: "soundwaves",
  ptClip: "particles",
  scClip: "scanlines",
  shimClip: "shimmer",
  prClip: "pulserings",
  mrClip: "matrixrain",
  bbClip: "borderbeam",
  spClip: "sparkles",
  cfClip: "confetti",
  auClip: "aurora",
  bkClip: "blurrylights",
  sgClip: "synthgrid",
  stClip: "starfield",
  vgGrad: "vignette",
};

function parseLegacySvg(root, cssText) {
  const clampN = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  const texts = [...root.querySelectorAll("text")].slice(0, MAX_SENTENCES);

  const isOurs =
    root.querySelector('[id="textPaint"],[id="bgPaint"],[id="borderPaint"]') ||
    texts.some((t) => (t.getAttribute("class") || "").includes("tt")) ||
    root.querySelector(
      'clipPath[id^="clip"] rect > animate[attributeName="width"]',
    ) ||
    Object.keys(LEGACY_EFFECT_MARKERS).some((id) =>
      root.querySelector(`[id="${id}"]`),
    );
  if (!isOurs || !texts.length) return null;

  const cfg = defaultConfig();

  // Isolated recovery stages ensure a single failure does not abort the entire import.
  const stage = (fn) => {
    try {
      fn();
    } catch {
      /* ignore stage failure */
    }
  };

  const W = Number(root.getAttribute("width"));
  const H = Number(root.getAttribute("height"));
  if (W > 0) {
    cfg.autoWidth = false;
    cfg.bannerWidth = Math.round(W);
  }
  if (H > 0) {
    cfg.autoHeight = false;
    cfg.bannerHeight = Math.round(H);
  }

  const parsePaint = (val, opacityAttr) => {
    if (!val || val === "none") return null;
    const ref = val.match(/url\(#(.+?)\)/);
    if (!ref) {
      const p = solidPaint(val);
      p.opacity = Math.round(Number(opacityAttr ?? 1) * 100);
      return p;
    }
    const grad = root.querySelector(`[id="${ref[1]}"]`);
    if (!grad) return solidPaint("#ffffff");
    const stops = [...grad.querySelectorAll("stop")].map((st) => ({
      id: uid(),
      color: st.getAttribute("stop-color") || "#ffffff",
      opacity: Math.round(Number(st.getAttribute("stop-opacity") ?? 1) * 100),
      brightness: 100,
    }));
    const g = (a) => Number(grad.getAttribute(a)) || 0;
    const angle = Math.round(
      ((Math.atan2(g("y2") - g("y1"), g("x2") - g("x1")) * 180) / Math.PI +
        360) %
        360,
    );
    let anim = "none",
      animSpeed = 3,
      animReverse = false;
    const at = grad.querySelector("animateTransform");
    if (at) {
      const dur = parseFloat(at.getAttribute("dur")) || 12;
      if (at.getAttribute("type") === "rotate") {
        anim = "rotate";
        animSpeed = clampN(Math.round(24 / dur), 1, 10);
        animReverse = (at.getAttribute("from") || "").startsWith("360");
      } else {
        anim = "move";
        animSpeed = clampN(Math.round(36 / dur), 1, 10);
        const [tx, ty] = (at.getAttribute("to") || "0 0")
          .split(/\s+/)
          .map(Number);
        const ex = 2 * (g("x2") - g("x1")),
          ey = 2 * (g("y2") - g("y1"));
        animReverse =
          Math.abs(ex) > 1e-6
            ? Math.sign(tx) !== Math.sign(ex)
            : Math.sign(ty) !== Math.sign(ey);
      }
    }
    return {
      type: "gradient",
      color: stops[0]?.color || "#ffffff",
      opacity: 100,
      brightness: 100,
      angle,
      anim,
      animSpeed,
      animReverse,
      stops,
    };
  };

  stage(() => {
    const mainRect =
      [...root.children].find(
        (el) =>
          el.tagName === "rect" &&
          !el.hasAttribute("pathLength") &&
          el.getAttribute("fill") &&
          el.getAttribute("fill") !== "none",
      ) || root.querySelector('rect[fill="url(#bgPaint)"]');
    if (!mainRect) return;
    cfg.bgPaint =
      parsePaint(
        mainRect.getAttribute("fill"),
        mainRect.getAttribute("fill-opacity"),
      ) || cfg.bgPaint;
    cfg.borderRadius = Math.round(Number(mainRect.getAttribute("rx")) || 0);
    const stroke = mainRect.getAttribute("stroke");
    if (stroke && stroke !== "none") {
      cfg.border = true;
      cfg.borderWidth = Number(mainRect.getAttribute("stroke-width")) || 2;
      cfg.borderPaint =
        parsePaint(stroke, mainRect.getAttribute("stroke-opacity")) ||
        cfg.borderPaint;
    }
  });

  cfg.sentences = texts.map((t) => t.textContent);
  const t0 = texts[0];
  let familyStr = FONTS[0].stack;

  stage(() => {
    cfg.fontSize = Number(t0.getAttribute("font-size")) || cfg.fontSize;
    cfg.fontWeight = Number(t0.getAttribute("font-weight")) || cfg.fontWeight;
    cfg.glow = (t0.getAttribute("filter") || "").includes("glow");
    cfg.textPaint =
      parsePaint(t0.getAttribute("fill"), t0.getAttribute("fill-opacity")) ||
      cfg.textPaint;

    const famAttr = t0.getAttribute("font-family") || "";
    const sysMatch = FONTS.find((f) => f.stack === famAttr);
    if (sysMatch) {
      cfg.fontId = sysMatch.id;
      familyStr = sysMatch.stack;
    } else {
      const fam = famAttr.match(/^'([^']+)'/);
      if (fam && !FONTS.some((f) => f.stack.includes(fam[1]))) {
        cfg.googleFont = fam[1];
        cfg.fontId = "custom";
      }
    }
  });

  stage(() => {
    const typingClip = root.querySelector(
      'clipPath[id^="clip"] rect > animate[attributeName="width"]',
    );
    if (typingClip) {
      cfg.transition = "typing";
      cfg.typingMode =
        typingClip.getAttribute("calcMode") === "discrete" ? "char" : "smooth";
      cfg.cursor = !!root.querySelector(".cursor");
    } else {
      const tkf = cssText.match(
        /@keyframes tkf0 \{([^}]*(?:\}[^}]*)*?)\}\s*(?=@keyframes|\.tt|$)/,
      );
      const animDur = cssText.match(/animation:\s*tkf0\s+([\d.]+)s/);
      if (tkf && animDur) {
        const body = tkf[1];
        cfg.transition = body.includes("blur(")
          ? "blur"
          : body.includes("scale(")
            ? "zoom"
            : body.includes("translateX(")
              ? "slide"
              : body.includes("translateY(")
                ? "rise"
                : "fade";
        const T = parseFloat(animDur[1]);
        const N = (cssText.match(/@keyframes tkf\d+/g) || []).length || 1;
        const pcts = [...body.matchAll(/([\d.]+)%/g)]
          .map((m) => parseFloat(m[1]))
          .filter((p) => p > 0);
        if (pcts.length) {
          const trans = Math.round((Math.min(...pcts) / 100) * T * 10) / 10;
          if (trans < 0.1) cfg.transition = "none";
          cfg.transitionDuration = clampN(trans, 0.2, 1.5);
          cfg.holdDuration = clampN(
            Math.round((T / N - trans) * 2) / 2,
            0.5,
            5,
          );
        }
      } else if (texts.length === 1) {
        cfg.transition = "none";
      }
    }
  });

  stage(() => {
    cfg.sentenceMotions = texts.map((t) => {
      const wrap = t.closest("g[class^=mv]");
      if (!wrap) return "none";
      const kf = cssText.match(
        new RegExp(
          `@keyframes ${wrap.getAttribute("class")}\\{([^}]*(?:\\}[^}]*)*?)\\}\\.`,
        ),
      );
      const body = kf ? kf[1] : "";
      if (body.includes("rotate(")) return "wobble";
      if (body.includes("scale(")) return "pulse";
      if (body.includes("translateX(")) return "sway";
      if (body.includes("translateY(")) return "bob";
      if (body.includes("translate("))
        return body.startsWith("0%{transform:translate(0,0)")
          ? "float"
          : "orbit";
      return "none";
    });
  });

  const PAD = 28;
  stage(() => {
    cfg.sentenceAligns = texts.map((t, i) => {
      if (t.hasAttribute("textLength")) return "justify";
      const x = Number(t.getAttribute("x")) || PAD;
      const w = measureSentence(
        cfg.sentences[i],
        cfg.fontSize,
        cfg.fontWeight,
        familyStr,
      ).width;
      const candidates = { left: PAD, center: (W - w) / 2, right: W - PAD - w };
      return Object.entries(candidates).sort(
        (a, b) => Math.abs(a[1] - x) - Math.abs(b[1] - x),
      )[0][0];
    });
  });
  cfg.sentenceIds = cfg.sentences.map(() => uid());

  cfg.effects = EFFECT_DEFAULTS.map((d) => {
    const marker = Object.keys(LEGACY_EFFECT_MARKERS).find(
      (k) => LEGACY_EFFECT_MARKERS[k] === d.id,
    );
    let node = marker && root.querySelector(`[id="${marker}"]`);
    if (!node && d.id === "borderbeam")
      node = root.querySelector("rect[pathLength]");
    if (!node) return d;
    const eff = { ...d, enabled: true };
    try {
      const grp = root.querySelector(`g[clip-path="url(#${marker})"]`);
      if (d.id === "vignette") {
        const stop = node.querySelectorAll("stop")[2];
        if (stop) eff.color = stop.getAttribute("stop-color") || eff.color;
        eff.flicker = root.querySelector('rect[fill="url(#vgGrad)"] > animate')
          ? eff.flicker
          : 0;
        return eff;
      }
      if (!grp && d.id !== "borderbeam") return eff;
      const el =
        grp && grp.querySelector("[fill]:not([fill='none']), [stroke]");
      if (el)
        eff.color =
          el.getAttribute("fill") && el.getAttribute("fill") !== "none"
            ? el.getAttribute("fill")
            : el.getAttribute("stroke") || eff.color;

      const num = (v) => Number(v) || 0;
      switch (d.id) {
        case "borderbeam": {
          const layers = [...(grp || root).querySelectorAll("rect[pathLength]")]
            .map((r) => {
              const [on, gap] = (r.getAttribute("stroke-dasharray") || "0 0")
                .split(/\s+/)
                .map(Number);
              return {
                on,
                gap,
                w: num(r.getAttribute("stroke-width")),
                stroke: r.getAttribute("stroke"),
                dur:
                  parseFloat(r.querySelector("animate")?.getAttribute("dur")) ||
                  6,
              };
            })
            .filter((l) => l.on > 0);
          if (layers.length) {
            eff.count = Math.max(
              1,
              Math.min(4, Math.round(100 / (layers[0].on + layers[0].gap))),
            );
            eff.tailLength = Math.round(Math.max(...layers.map((l) => l.on)));
            eff.thickness = Math.min(...layers.map((l) => l.w));
            eff.color = layers[0].stroke || eff.color;
            eff.speed = Math.max(
              1,
              Math.min(10, Math.round(24 / layers[0].dur)),
            );
          }
          break;
        }
        case "soundwaves": {
          const paths = grp.querySelectorAll("path");
          eff.count = paths.length || eff.count;
          eff.strokeWidth =
            num(paths[0]?.getAttribute("stroke-width")) || eff.strokeWidth;
          break;
        }
        case "pulserings": {
          const rings = grp.querySelectorAll("ellipse, circle");
          eff.count = rings.length || eff.count;
          eff.strokeWidth =
            num(rings[0]?.getAttribute("stroke-width")) || eff.strokeWidth;
          break;
        }
        case "particles":
        case "blurrylights":
          eff.count = grp.querySelectorAll("circle").length || eff.count;
          break;
        case "sparkles":
          eff.count = grp.querySelectorAll("path").length || eff.count;
          break;
        case "confetti":
          eff.count = grp.querySelectorAll("rect").length || eff.count;
          break;
        case "starfield":
          eff.count = grp.querySelectorAll("line").length || eff.count;
          break;
        case "aurora":
          eff.blobs = grp.querySelectorAll("ellipse").length || eff.blobs;
          break;
        case "synthgrid": {
          const lines = [...grp.querySelectorAll("line")];
          const scrolling = lines.filter((l) =>
            l.querySelector("animate"),
          ).length;
          if (scrolling) eff.rows = scrolling;
          const statics = lines.length - scrolling - 1;
          if (statics > 0) eff.columns = Math.round(statics / 2);
          break;
        }
      }
    } catch {
      // Ignore unsupported or partial effect metadata
    }
    return eff;
  });

  return cfg;
}

// 3-tier import: lossless embedded metadata, legacy SVG DOM scraping, or raw bounds/text extraction.
function parseImportedSvg(text) {
  const m = text.match(META_RE);
  if (m) {
    try {
      return {
        config: sanitizeConfig(JSON.parse(b64decode(m[1]))),
        foreign: false,
      };
    } catch {
      // Fall through to DOM scraping if metadata is unparseable
    }
  }

  const doc = new DOMParser().parseFromString(text, "image/svg+xml");
  const root = doc.querySelector("svg");
  if (!root || doc.querySelector("parsererror")) return null;

  try {
    const cssText = [...root.querySelectorAll("style")]
      .map((st) => st.textContent)
      .join("\n");
    const legacy = parseLegacySvg(root, cssText);
    if (legacy)
      return { config: sanitizeConfig(legacy), foreign: false, legacy: true };
  } catch {
    // Fall through to basic bounds/text extraction
  }

  const cfg = defaultConfig();
  const texts = [...root.querySelectorAll("text")]
    .map((t) => t.textContent.trim())
    .filter(Boolean)
    .slice(0, MAX_SENTENCES);
  if (texts.length) {
    cfg.sentences = texts;
    cfg.sentenceAligns = texts.map(() => "left");
    cfg.sentenceMotions = texts.map(() => "none");
    cfg.sentenceIds = texts.map(() => uid());
  }
  const vb = (root.getAttribute("viewBox") || "").split(/[\s,]+/).map(Number);
  const w = Number(root.getAttribute("width")) || vb[2];
  const h = Number(root.getAttribute("height")) || vb[3];
  if (w > 0) {
    cfg.autoWidth = false;
    cfg.bannerWidth = Math.round(w);
  }
  if (h > 0) {
    cfg.autoHeight = false;
    cfg.bannerHeight = Math.round(h);
  }
  return { config: cfg, foreign: true };
}

export default function App() {
  const [tab, setTab] = useState("text");
  const [copied, setCopied] = useState("");
  const [fileName, setFileName] = useState("banner");
  const [dragSentence, setDragSentence] = useState(null);
  const [importNote, setImportNote] = useState(null);
  const [config, setConfig] = useState(defaultConfig);

  const setActiveTemplate = (id) =>
    setConfig((c) => ({ ...c, template: { ...c.template, active: id } }));
  const setTemplateCfg = (id, next) =>
    setConfig((c) => ({
      ...c,
      template: {
        ...c.template,
        configs: { ...c.template.configs, [id]: next },
      },
    }));
  const activeTpl = getTemplate(config.template?.active);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", "dark");
  }, []);

  const set = (key) => (e) => {
    const el = e.target;
    const value = el.type === "checkbox" ? el.checked : el.value;
    setConfig((c) => ({
      ...c,
      [key]: el.type === "range" ? Number(value) : value,
    }));
  };
  const setPaint = (key) => (p) => setConfig((c) => ({ ...c, [key]: p }));

  const setSentence = (i, text) =>
    setConfig((c) => ({
      ...c,
      sentences: c.sentences.map((s, idx) => (idx === i ? text : s)),
    }));
  const setSentenceAlign = (i, align) =>
    setConfig((c) => ({
      ...c,
      sentenceAligns: c.sentenceAligns.map((a, idx) => (idx === i ? align : a)),
    }));
  const setSentenceMotion = (i, motion) =>
    setConfig((c) => ({
      ...c,
      sentenceMotions: (c.sentenceMotions || []).map((mm, idx) =>
        idx === i ? motion : mm,
      ),
    }));
  const addSentence = () =>
    setConfig((c) =>
      c.sentences.length < MAX_SENTENCES
        ? {
            ...c,
            sentences: [...c.sentences, ""],
            sentenceAligns: [...c.sentenceAligns, "left"],
            sentenceMotions: [...(c.sentenceMotions || []), "none"],
            sentenceIds: [...(c.sentenceIds || c.sentences.map(uid)), uid()],
          }
        : c,
    );
  const removeSentence = (i) =>
    setConfig((c) =>
      c.sentences.length > 1
        ? {
            ...c,
            sentences: c.sentences.filter((_, idx) => idx !== i),
            sentenceAligns: c.sentenceAligns.filter((_, idx) => idx !== i),
            sentenceMotions: (c.sentenceMotions || []).filter(
              (_, idx) => idx !== i,
            ),
            sentenceIds: (c.sentenceIds || []).filter((_, idx) => idx !== i),
          }
        : c,
    );

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
        sentenceMotions: reorder(
          c.sentenceMotions || c.sentences.map(() => "none"),
        ),
        sentenceIds: reorder(ids),
      };
    });

  const fontFamily = useMemo(
    () => familyFor(config.fontId, config.embedFont),
    [config.fontId, config.embedFont],
  );
  const measured = useMemo(
    () =>
      config.sentences.map((t, i) => ({
        ...measureSentence(t, config.fontSize, config.fontWeight, fontFamily),
        align: config.sentenceAligns[i] || "left",
        motion: (config.sentenceMotions && config.sentenceMotions[i]) || "none",
      })),
    [
      config.sentences,
      config.sentenceAligns,
      config.sentenceMotions,
      config.fontSize,
      config.fontWeight,
      fontFamily,
    ],
  );
  const auto = useMemo(
    () => autoSize(measured, config.fontSize),
    [measured, config.fontSize],
  );
  const svg = useMemo(
    () =>
      activeTpl
        ? activeTpl.generate(config.template?.configs?.[activeTpl.id])
        : generateSvg({ ...config, sentences: measured, fontFamily }),
    [config, measured, fontFamily, activeTpl],
  );

  const [fontStatus, setFontStatus] = useState({ state: "idle", msg: "" });
  const [fontQuery, setFontQuery] = useState("");

  useEffect(() => {
    const fam = config.googleFont;
    if (!fam) return;
    let cancelled = false;
    loadGoogleFont(fam)
      .then((embed) => {
        if (cancelled) return;
        setConfig((c) =>
          c.googleFont === fam ? { ...c, embedFont: embed } : c,
        );
        setFontStatus({ state: "ready", msg: "" });
      })
      .catch((err) => {
        if (cancelled) return;
        setFontStatus({
          state: "error",
          msg: err.message || "Couldn't load that font.",
        });
        setConfig((c) =>
          c.googleFont === fam
            ? { ...c, googleFont: "", embedFont: null, fontId: "sans" }
            : c,
        );
      });
    return () => {
      cancelled = true;
    };
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
    setConfig((c) => ({
      ...c,
      fontId: "sans",
      googleFont: "",
      embedFont: null,
    }));
  };

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
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIdx((i) => (i + 1) % suggestions.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIdx((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
        return;
      }
      if (e.key === "Escape") {
        setShowSuggest(false);
        setActiveIdx(-1);
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        chooseFont(activeIdx >= 0 ? suggestions[activeIdx] : suggestions[0]);
        return;
      }
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (fontQuery.trim()) chooseFont(fontQuery.trim());
    }
  };

  const setWidthAuto = (isAuto) =>
    setConfig((c) => ({
      ...c,
      autoWidth: isAuto,
      bannerWidth: isAuto ? c.bannerWidth : auto.width,
    }));
  const setHeightAuto = (isAuto) =>
    setConfig((c) => ({
      ...c,
      autoHeight: isAuto,
      bannerHeight: isAuto ? c.bannerHeight : auto.height,
    }));

  const dataUri = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  const link = normalizeUrl(config.linkUrl);
  const alt = activeTpl
    ? activeTpl.alt(config.template?.configs?.[activeTpl.id])
    : config.sentences[0] || "banner";
  const safeName =
    fileName
      .trim()
      .replace(/\.svg$/i, "")
      .replace(/[\\/:*?"<>|]/g, "")
      .trim() || "banner";
  const imageMd = `![${alt}](./assets/${safeName}.svg)`;
  const markdown = link ? `[${imageMd}](${link})` : imageMd;

  const exportSvg = useMemo(() => embedConfig(svg, config), [svg, config]);

  function importSvg(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const parsed = parseImportedSvg(String(reader.result));
      if (!parsed) {
        setImportNote({
          kind: "error",
          msg: "Couldn't read that file as an SVG.",
        });
        return;
      }
      setConfig(parsed.config);
      if (parsed.config?.template?.active) {
        setTab("templates");
      }
      setFileName(file.name.replace(/\.svg$/i, "") || "banner");
      const isTpl = !!parsed.config?.template?.active;
      const tplName = isTpl
        ? getTemplate(parsed.config.template.active)?.name || "Template"
        : null;
      setImportNote(
        parsed.foreign
          ? {
              kind: "warn",
              msg: "Imported a non–SVG Crafter file — recovered text and size, everything else uses defaults.",
            }
          : parsed.legacy
            ? {
                kind: "ok",
                msg: "Older SVG Crafter export imported — settings recovered from the artwork; effect fine-tuning and animation speeds use defaults.",
              }
            : isTpl
              ? {
                  kind: "ok",
                  msg: `${tplName} imported — full settings restored.`,
                }
              : { kind: "ok", msg: "Banner imported — full settings restored." },
      );
    };
    reader.onerror = () =>
      setImportNote({ kind: "error", msg: "Couldn't read that file." });
    reader.readAsText(file);
  }

  async function copy(value, which) {
    await navigator.clipboard.writeText(value);
    setCopied(which);
    setTimeout(() => setCopied(""), 1400);
  }

  function download() {
    const blob = new Blob([exportSvg], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${safeName}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const locked = !!config.template?.active && tab !== "templates";

  return (
    <div className="app">
      <div className="workspace">
        <aside className="sidebar">
          <div className="tabs" role="tablist">
            {TABS.map((t) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={tab === t.id}
                className={
                  (tab === t.id ? "tab active" : "tab") +
                  (t.id === "templates" && config.template?.active
                    ? " tab-tpl-on"
                    : "")
                }
                onClick={() => setTab(t.id)}
              >
                {t.label}
                {t.id === "effects" &&
                  config.effects.filter((e) => e.enabled).length > 0 && (
                    <span className="tab-badge">
                      {config.effects.filter((e) => e.enabled).length}
                    </span>
                  )}
              </button>
            ))}
          </div>

          <div className="tabpanel">
            {locked && (
              <div className="tpl-lock-note">
                <span>Cannot edit these options while a template is active.</span>
                <button type="button" onClick={() => setTab("templates")}>
                  Edit template
                </button>
              </div>
            )}

            {tab === "templates" ? (
              <TemplatesTab
                template={config.template}
                setActive={setActiveTemplate}
                setCfg={setTemplateCfg}
                Section={Section}
              />
            ) : (
              <fieldset className="tpl-lock" disabled={locked}>
                {tab === "text" && (
              <>
                <Section
                  title="Sentences"
                  defaultOpen
                  summary={`${config.sentences.filter((s) => s.trim()).length || 1} line${(config.sentences.filter((s) => s.trim()).length || 1) > 1 ? "s" : ""}`}
                >
                  <div className="field">
                    <span>
                      Sentences
                      {config.sentences.length > 1 ? " (cycle in order)" : ""}
                    </span>
                    <div className="sentences">
                      {config.sentences.map((s, i) => {
                        const sid =
                          (config.sentenceIds && config.sentenceIds[i]) || i;
                        const multi = config.sentences.length > 1;
                        const dragOverSentence = () => {
                          if (dragSentence == null) return;
                          const from = (config.sentenceIds || []).indexOf(
                            dragSentence,
                          );
                          if (from === -1 || from === i) return;
                          moveSentence(from, i);
                        };
                        return (
                          <div
                            className={
                              "sentence-item" +
                              (dragSentence === sid ? " dragging" : "")
                            }
                            key={sid}
                            onDragEnter={multi ? dragOverSentence : undefined}
                            onDragOver={
                              multi ? (e) => e.preventDefault() : undefined
                            }
                            onDrop={
                              multi ? (e) => e.preventDefault() : undefined
                            }
                            onDragEnd={
                              multi ? () => setDragSentence(null) : undefined
                            }
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
                                  >
                                    ⠿
                                  </span>
                                  <div className="s-arrows">
                                    <button
                                      type="button"
                                      onClick={() => moveSentence(i, i - 1)}
                                      disabled={i === 0}
                                      aria-label="Move sentence up"
                                    >
                                      ▲
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => moveSentence(i, i + 1)}
                                      disabled={
                                        i === config.sentences.length - 1
                                      }
                                      aria-label="Move sentence down"
                                    >
                                      ▼
                                    </button>
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
                                <button
                                  type="button"
                                  className="remove"
                                  onClick={() => removeSentence(i)}
                                  aria-label="Remove sentence"
                                >
                                  ✕
                                </button>
                              )}
                            </div>
                            <div
                              className="seg align-seg"
                              role="group"
                              aria-label="Text alignment"
                            >
                              {ALIGNMENTS.map((a) => {
                                const on =
                                  (config.sentenceAligns[i] || "left") === a.id;
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
                            <div
                              className="seg motion-seg"
                              role="group"
                              aria-label="Text motion"
                            >
                              {MOTIONS.map((mm) => {
                                const on =
                                  ((config.sentenceMotions &&
                                    config.sentenceMotions[i]) ||
                                    "none") === mm.id;
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
                    <button
                      type="button"
                      className="add"
                      onClick={addSentence}
                      disabled={config.sentences.length >= MAX_SENTENCES}
                    >
                      + Add sentence
                    </button>
                  </div>
                </Section>

                <Section
                  title="Text style"
                  summary={`${config.fontSize}px${config.embedFont ? " · " + config.embedFont.family : config.googleFont ? " · " + config.googleFont : ""}`}
                >
                  <PaintControl
                    label="Text colour"
                    paint={config.textPaint}
                    onChange={setPaint("textPaint")}
                  />

                  <div className="field">
                    <span>Font</span>
                    <div className="font-grid">
                      {FONTS.map((f) => (
                        <button
                          key={f.id}
                          type="button"
                          className={
                            "font-chip" +
                            (!config.embedFont &&
                            !config.googleFont &&
                            config.fontId === f.id
                              ? " on"
                              : "")
                          }
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
                          className={
                            "font-chip" +
                            (config.googleFont === name ? " on" : "")
                          }
                          style={
                            config.embedFont && config.embedFont.family === name
                              ? { fontFamily: `'${name}'` }
                              : undefined
                          }
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
                          onChange={(e) => {
                            setFontQuery(e.target.value);
                            setShowSuggest(true);
                            setActiveIdx(-1);
                          }}
                          onFocus={() => setShowSuggest(true)}
                          onBlur={() =>
                            setTimeout(() => setShowSuggest(false), 120)
                          }
                          onKeyDown={onFontKeyDown}
                        />
                        <button
                          type="button"
                          className="ghost"
                          onClick={() =>
                            fontQuery.trim() && chooseFont(fontQuery.trim())
                          }
                        >
                          Load
                        </button>
                      </div>
                      {showSuggest && suggestions.length > 0 && (
                        <ul className="suggest" role="listbox">
                          {suggestions.map((name, i) => (
                            <li
                              key={name}
                              role="option"
                              aria-selected={i === activeIdx}
                              className={
                                "suggest-item" +
                                (i === activeIdx ? " active" : "")
                              }
                              onMouseDown={(e) => {
                                e.preventDefault();
                                chooseFont(name);
                              }}
                              onMouseEnter={() => setActiveIdx(i)}
                            >
                              {highlightMatch(name, fontQuery)}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    {fontStatus.state === "loading" && (
                      <p className="font-note">{fontStatus.msg}</p>
                    )}
                    {fontStatus.state === "error" && (
                      <p className="font-note error">{fontStatus.msg}</p>
                    )}
                    {config.embedFont && fontStatus.state !== "loading" && (
                      <p className="font-note">
                        Using <b>{config.embedFont.family}</b> ·{" "}
                        <button
                          type="button"
                          className="linkish"
                          onClick={removeFont}
                        >
                          remove
                        </button>
                      </p>
                    )}
                  </div>

                  <label className="field">
                    <span>Font size — {config.fontSize}px</span>
                    <input
                      type="range"
                      min="20"
                      max="72"
                      value={config.fontSize}
                      onChange={set("fontSize")}
                    />
                  </label>
                  <label className="field">
                    <span>Font weight — {config.fontWeight}</span>
                    <input
                      type="range"
                      min="400"
                      max="800"
                      step="100"
                      value={config.fontWeight}
                      onChange={set("fontWeight")}
                    />
                  </label>
                  <label className="toggle">
                    <input
                      type="checkbox"
                      checked={config.glow}
                      onChange={set("glow")}
                    />
                    <span>Text glow</span>
                  </label>
                </Section>

                <Section
                  title="Animation"
                  summary={
                    TRANSITIONS.find((t) => t.id === config.transition)
                      ?.label || "None"
                  }
                >
                  {(config.sentenceMotions || []).some(
                    (mm) => mm && mm !== "none",
                  ) && (
                    <label className="field">
                      <span>Motion speed — {config.motionSpeed}x</span>
                      <input
                        type="range"
                        min="0.25"
                        max="3"
                        step="0.25"
                        value={config.motionSpeed}
                        onChange={set("motionSpeed")}
                      />
                    </label>
                  )}
                  <div className="field">
                    <span>
                      Transition
                      {config.sentences.length > 1
                        ? ""
                        : " (single sentence — needs 2+ to cycle)"}
                    </span>
                    <div className="font-grid">
                      {TRANSITIONS.map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          className={
                            "font-chip" +
                            (config.transition === t.id ? " on" : "")
                          }
                          onClick={() =>
                            setConfig((c) => ({ ...c, transition: t.id }))
                          }
                        >
                          {t.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {(config.sentences.length > 1 ||
                    config.transition === "typing") && (
                    <label className="field">
                      <span>Hold time — {config.holdDuration}s</span>
                      <input
                        type="range"
                        min="0.5"
                        max="5"
                        step="0.5"
                        value={config.holdDuration}
                        onChange={set("holdDuration")}
                      />
                    </label>
                  )}

                  {config.transition !== "none" &&
                    config.transition !== "typing" &&
                    config.sentences.length > 1 && (
                      <label className="field">
                        <span>
                          Transition speed — {config.transitionDuration}s
                        </span>
                        <input
                          type="range"
                          min="0.2"
                          max="1.5"
                          step="0.1"
                          value={config.transitionDuration}
                          onChange={set("transitionDuration")}
                        />
                      </label>
                    )}

                  {config.transition === "typing" && (
                    <div className="subgroup">
                      <div className="field">
                        <span>Typing style</span>
                        <div className="seg">
                          <button
                            type="button"
                            className={
                              config.typingMode === "smooth" ? "on" : ""
                            }
                            onClick={() =>
                              setConfig((c) => ({ ...c, typingMode: "smooth" }))
                            }
                          >
                            Smooth
                          </button>
                          <button
                            type="button"
                            className={config.typingMode === "char" ? "on" : ""}
                            onClick={() =>
                              setConfig((c) => ({ ...c, typingMode: "char" }))
                            }
                          >
                            Letter by letter
                          </button>
                        </div>
                      </div>
                      <label className="toggle">
                        <input
                          type="checkbox"
                          checked={config.cursor}
                          onChange={set("cursor")}
                        />
                        <span>Show cursor</span>
                      </label>
                      <label className="field">
                        <span>Typing speed — {config.typingSpeed}x</span>
                        <input
                          type="range"
                          min="0.5"
                          max="4"
                          step="0.5"
                          value={config.typingSpeed}
                          onChange={set("typingSpeed")}
                        />
                      </label>
                    </div>
                  )}
                </Section>
              </>
            )}

            {(tab === "border-background" ||
              tab === "border" ||
              tab === "background") && (
              <>
                <Section
                  title="Border"
                  defaultOpen
                  summary={
                    config.border ? `on · ${config.borderWidth}px` : "off"
                  }
                >
                  <label className="toggle">
                    <input
                      type="checkbox"
                      checked={config.border}
                      onChange={set("border")}
                    />
                    <span>Show border</span>
                  </label>
                  <PaintControl
                    label="Border colour"
                    paint={config.borderPaint}
                    onChange={setPaint("borderPaint")}
                    disabled={!config.border}
                  />
                  <label className="field">
                    <span>Border width — {config.borderWidth}px</span>
                    <input
                      type="range"
                      min="1"
                      max="10"
                      value={config.borderWidth}
                      onChange={set("borderWidth")}
                      disabled={!config.border}
                    />
                  </label>
                </Section>
                <Section
                  title="Corners"
                  defaultOpen
                  summary={`${config.borderRadius}px radius`}
                >
                  <label className="field">
                    <span>Corner radius — {config.borderRadius}px</span>
                    <input
                      type="range"
                      min="0"
                      max="40"
                      value={config.borderRadius}
                      onChange={set("borderRadius")}
                    />
                  </label>
                </Section>
                <Section
                  title="Dimensions"
                  defaultOpen
                  summary={`${config.autoWidth ? "auto" : config.bannerWidth} × ${config.autoHeight ? "auto" : config.bannerHeight}`}
                >
                  <div className="field">
                    <span>Width</span>
                    <div className="seg">
                      <button
                        type="button"
                        className={config.autoWidth ? "on" : ""}
                        onClick={() => setWidthAuto(true)}
                      >
                        Fit text
                      </button>
                      <button
                        type="button"
                        className={!config.autoWidth ? "on" : ""}
                        onClick={() => setWidthAuto(false)}
                      >
                        Custom
                      </button>
                    </div>
                  </div>
                  {!config.autoWidth && (
                    <label className="field">
                      <span>Banner width — {config.bannerWidth}px</span>
                      <input
                        type="range"
                        min="200"
                        max="1000"
                        step="10"
                        value={config.bannerWidth}
                        onChange={set("bannerWidth")}
                      />
                    </label>
                  )}

                  <div className="field">
                    <span>Height</span>
                    <div className="seg">
                      <button
                        type="button"
                        className={config.autoHeight ? "on" : ""}
                        onClick={() => setHeightAuto(true)}
                      >
                        Fit text
                      </button>
                      <button
                        type="button"
                        className={!config.autoHeight ? "on" : ""}
                        onClick={() => setHeightAuto(false)}
                      >
                        Custom
                      </button>
                    </div>
                  </div>
                  {!config.autoHeight && (
                    <label className="field">
                      <span>Banner height — {config.bannerHeight}px</span>
                      <input
                        type="range"
                        min="60"
                        max="400"
                        step="10"
                        value={config.bannerHeight}
                        onChange={set("bannerHeight")}
                      />
                    </label>
                  )}
                </Section>

                <Section title="Fill" defaultOpen>
                  <PaintControl
                    label="Background"
                    paint={config.bgPaint}
                    onChange={setPaint("bgPaint")}
                  />
                </Section>
              </>
            )}

            {tab === "effects" && (
              <EffectsTab
                effects={config.effects}
                onChange={(effects) => setConfig((c) => ({ ...c, effects }))}
              />
            )}
              </fieldset>
            )}
          </div>
        </aside>

        <main className="main">
          <section className="preview">
            <h2>Preview</h2>
            <div className="stage">
              <img
                key={dataUri}
                src={dataUri}
                alt={alt}
              />
            </div>
          </section>

          <section className="export">
            <div className="repo-callout">
              <span className="repo-callout-msg">Enjoying SVG Crafter?</span>
              <a
                href="https://github.com/MohabHindawy/SVG-Crafter"
                target="_blank"
                rel="noopener noreferrer"
                className="repo-star-btn"
              >
                <svg
                  className="octicon star-icon"
                  viewBox="0 0 16 16"
                  width="14"
                  height="14"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path d="M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.751.751 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25Zm0 2.445L6.615 5.5a.75.75 0 0 1-.564.41l-3.097.45 2.24 2.184a.75.75 0 0 1 .216.664l-.528 3.084 2.769-1.456a.75.75 0 0 1 .698 0l2.77 1.456-.53-3.084a.75.75 0 0 1 .216-.664l2.24-2.183-3.096-.45a.75.75 0 0 1-.564-.41L8 2.695Z" />
                </svg>
                <span>Star on GitHub</span>
              </a>
            </div>

            <h2>Export</h2>
            <label className="field">
              <span>File name</span>
              <input
                type="text"
                value={fileName}
                onChange={(e) => setFileName(e.target.value)}
                placeholder="banner"
              />
            </label>

            <div className="actions">
              <button onClick={() => copy(exportSvg, "svg")}>
                {copied === "svg" ? "Copied" : "Copy SVG"}
              </button>
              <button onClick={download}>Download .svg</button>
              <label className="import-btn">
                <span>Import SVG</span>
                <input
                  type="file"
                  accept=".svg,image/svg+xml"
                  hidden
                  onChange={(e) => {
                    importSvg(e.target.files[0]);
                    e.target.value = "";
                  }}
                />
              </label>
            </div>
            {importNote && (
              <p className={`import-note ${importNote.kind}`}>
                {importNote.msg}
              </p>
            )}

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
                <button className="ghost" onClick={() => copy(markdown, "md")}>
                  {copied === "md" ? "copied" : "copy"}
                </button>
              </div>
            </label>

            <div className="guide">
              <h3>How to use</h3>
              <ol>
                <li>Customise your banner with the panel on the left.</li>
                <li>
                  Hit <b>Download .svg</b>, or <b>Copy SVG</b> to grab the
                  markup.
                </li>
                <li>
                  Add the file to an <code>assets</code> folder in your profile
                  repo.
                </li>
                <li>
                  Paste the snippet above into your <code>README.md</code>.
                </li>
                {link && (
                  <li>
                    The snippet wraps the image in your link, so clicking the
                    banner on GitHub opens <code>{link}</code>.
                  </li>
                )}
              </ol>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
