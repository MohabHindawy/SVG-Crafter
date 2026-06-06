import { useEffect, useMemo, useRef, useState } from "react";
import { generateSvg, adjustBrightness, autoSize, normalizeUrl } from "./generateSvg";
import "./App.css";
import sunIcon from "../public/LightMode.svg";
import moonIcon from "../public/DarkMode.svg";

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
const CUSTOM_FAMILY = "SVGCrafterCustom"; // family name used for an imported font

// Resolve the active CSS font-family string from config (used for both
// in-browser measurement and the generated SVG).
const familyFor = (config) =>
  config.embedFont ? `'${CUSTOM_FAMILY}', ${FONTS[0].stack}` : (FONTS.find((f) => f.id === config.fontId) || FONTS[0]).stack;

// format() token for an @font-face src, from the file extension.
const fontFormat = (name) => {
  const ext = (name.split(".").pop() || "").toLowerCase();
  return { woff2: "woff2", woff: "woff", ttf: "truetype", otf: "opentype" }[ext] || "woff2";
};
const readAsDataURL = (file) =>
  new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = () => rej(r.error);
    r.readAsDataURL(file);
  });

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

export default function App() {
  const [theme, setTheme] = useState("dark");
  const [tab, setTab] = useState("text");
  const [copied, setCopied] = useState("");
  const [config, setConfig] = useState({
    sentences: ["Hello", "SVG Crafter"],
    sentenceAligns: ["left", "left"],
    fontSize: 40,
    fontWeight: 700,
    fontId: "sans",
    embedFont: null,
    animate: true,
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
  });

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

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
  const addSentence = () =>
    setConfig((c) =>
      c.sentences.length < MAX_SENTENCES
        ? { ...c, sentences: [...c.sentences, ""], sentenceAligns: [...c.sentenceAligns, "left"] }
        : c
    );
  const removeSentence = (i) =>
    setConfig((c) =>
      c.sentences.length > 1
        ? {
            ...c,
            sentences: c.sentences.filter((_, idx) => idx !== i),
            sentenceAligns: c.sentenceAligns.filter((_, idx) => idx !== i),
          }
        : c
    );

  // Active font family, measured sentences, and the resulting SVG.
  const fontFamily = useMemo(
    () => familyFor(config.fontId, config.embedFont),
    [config.fontId, config.embedFont]
  );
  const measured = useMemo(
    () =>
      config.sentences.map((t, i) => ({
        ...measureSentence(t, config.fontSize, config.fontWeight, fontFamily),
        align: config.sentenceAligns[i] || "left",
      })),
    [config.sentences, config.sentenceAligns, config.fontSize, config.fontWeight, fontFamily]
  );
  const auto = useMemo(() => autoSize(measured, config.fontSize), [measured, config.fontSize]);
  const svg = useMemo(() => generateSvg({ ...config, sentences: measured, fontFamily }), [config, measured, fontFamily]);

  // Import a custom font: load it so canvas measurement is correct, then store
  // it (base64) so generateSvg can embed it for a self-contained SVG.
  const fontInputRef = useRef(null);
  async function importFont(file) {
    if (!file) return;
    try {
      const dataUrl = await readAsDataURL(file);
      const format = fontFormat(file.name);
      try {
        const ff = new FontFace(CUSTOM_FAMILY, `url(${dataUrl})`);
        await ff.load();
        document.fonts.add(ff);
      } catch {
        /* measurement may be approximate, but the embedded SVG still renders */
      }
      setConfig((c) => ({ ...c, embedFont: { family: CUSTOM_FAMILY, dataUrl, format, name: file.name }, fontId: "custom" }));
    } catch {
      /* ignore unreadable file */
    }
  }
  const selectFont = (id) => setConfig((c) => ({ ...c, fontId: id, embedFont: null }));
  const removeFont = () => setConfig((c) => ({ ...c, fontId: "sans", embedFont: null }));

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
        <button className="theme-toggle" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
          <img
            src={theme === "dark" ? sunIcon : moonIcon}
            alt={theme === "dark" ? "Light mode" : "Dark mode"}
            width={24}
            height={24}
          />
        </button>
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
              </button>
            ))}
          </div>

          <div className="tabpanel">
            {tab === "text" && (
              <>
                <div className="field">
                  <span>Sentences{config.sentences.length > 1 ? " (cycle in order)" : ""}</span>
                  <div className="sentences">
                    {config.sentences.map((s, i) => (
                      <div className="sentence-item" key={i}>
                        <div className="sentence-row">
                          <input
                            type="text"
                            value={s}
                            onChange={(e) => setSentence(i, e.target.value)}
                            maxLength={40}
                            placeholder={`Sentence ${i + 1}`}
                          />
                          {config.sentences.length > 1 && (
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
                      </div>
                    ))}
                  </div>
                  <button type="button" className="add" onClick={addSentence} disabled={config.sentences.length >= MAX_SENTENCES}>
                    + Add sentence
                  </button>
                </div>

                <PaintControl label="Text colour" paint={config.textPaint} onChange={setPaint("textPaint")} />

                <div className="field">
                  <span>Font</span>
                  <div className="font-grid">
                    {FONTS.map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        className={"font-chip" + (!config.embedFont && config.fontId === f.id ? " on" : "")}
                        style={{ fontFamily: f.stack }}
                        onClick={() => selectFont(f.id)}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                  <input
                    ref={fontInputRef}
                    type="file"
                    accept=".woff2,.woff,.ttf,.otf,font/*"
                    style={{ display: "none" }}
                    onChange={(e) => {
                      importFont(e.target.files?.[0]);
                      e.target.value = "";
                    }}
                  />
                  {config.embedFont ? (
                    <div className="font-custom">
                      <span className="font-custom-name" title={config.embedFont.name}>{config.embedFont.name}</span>
                      <button type="button" className="ghost" onClick={() => fontInputRef.current?.click()}>replace</button>
                      <button type="button" className="remove" onClick={removeFont} aria-label="Remove custom font">✕</button>
                    </div>
                  ) : (
                    <button type="button" className="add" onClick={() => fontInputRef.current?.click()}>
                      + Import custom font
                    </button>
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

                <label className="toggle">
                  <input type="checkbox" checked={config.animate} onChange={set("animate")} />
                  <span>Typing animation</span>
                </label>

                {config.animate && (
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
                    <label className="field">
                      <span>Time between sentences — {config.holdDuration}s</span>
                      <input type="range" min="0.5" max="5" step="0.5" value={config.holdDuration} onChange={set("holdDuration")} />
                    </label>
                  </div>
                )}
              </>
            )}

            {tab === "border" && (
              <>
                <label className="toggle">
                  <input type="checkbox" checked={config.border} onChange={set("border")} />
                  <span>Show border</span>
                </label>
                <PaintControl label="Border colour" paint={config.borderPaint} onChange={setPaint("borderPaint")} disabled={!config.border} />
                <label className="field">
                  <span>Border width — {config.borderWidth}px</span>
                  <input type="range" min="1" max="10" value={config.borderWidth} onChange={set("borderWidth")} disabled={!config.border} />
                </label>
                <label className="field">
                  <span>Corner radius — {config.borderRadius}px</span>
                  <input type="range" min="0" max="40" value={config.borderRadius} onChange={set("borderRadius")} />
                </label>
              </>
            )}

            {tab === "background" && (
              <>
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

                <PaintControl label="Background" paint={config.bgPaint} onChange={setPaint("bgPaint")} />
              </>
            )}

            {tab === "effects" && (
              <div className="empty-tab">More effects coming soon.</div>
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