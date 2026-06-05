// App.jsx
import { useMemo, useState } from "react";
import { generateSvg } from "./generateSvg";
import "./App.css";

// Measures real rendered text width with a canvas so the typing animation
// and the SVG width fit the text exactly. This is the one piece that needs
// the DOM, which is why it lives here and not in generateSvg.js.
function measureTextWidth(text, fontSize, fontWeight) {
  const canvas =
    measureTextWidth._c || (measureTextWidth._c = document.createElement("canvas"));
  const ctx = canvas.getContext("2d");
  ctx.font = `${fontWeight} ${fontSize}px 'Segoe UI', system-ui, -apple-system, Arial, sans-serif`;
  return Math.ceil(ctx.measureText(text || " ").width);
}

// const FONT = "'Segoe UI', system-ui, -apple-system, Arial, sans-serif";

export default function App() {
  const [config, setConfig] = useState({
    text: "Mohab",
    textColor: "#bef264",
    bgColor: "#0a0a0a",
    fontSize: 40,
    fontWeight: 700,
    animate: true,
    borderRadius: 14,
  });
  const [copied, setCopied] = useState("");

  const set = (key) => (e) => {
    const el = e.target;
    const value = el.type === "checkbox" ? el.checked : el.value;
    setConfig((c) => ({
      ...c,
      [key]: el.type === "range" ? Number(value) : value,
    }));
  };

  const svg = useMemo(() => {
    const textWidth = measureTextWidth(config.text, config.fontSize, config.fontWeight);
    return generateSvg({ ...config, textWidth });
  }, [config]);

  const dataUri = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  const markdown = `![${config.text}](./assets/banner.svg)`;

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
        <span className="dot" /> svg<span className="accent">forge</span>
        <span className="sub">// github profile banner generator</span>
      </header>

      <main className="layout">
        <section className="panel controls">
          <h2>Customize</h2>

          <label className="field">
            <span>Text</span>
            <input type="text" value={config.text} onChange={set("text")} maxLength={40} />
          </label>

          <div className="row">
            <label className="field">
              <span>Text color</span>
              <input type="color" value={config.textColor} onChange={set("textColor")} />
            </label>
            <label className="field">
              <span>Background</span>
              <input type="color" value={config.bgColor} onChange={set("bgColor")} />
            </label>
          </div>

          <label className="field">
            <span>Font size — {config.fontSize}px</span>
            <input type="range" min="20" max="72" value={config.fontSize} onChange={set("fontSize")} />
          </label>

          <label className="field">
            <span>Font weight — {config.fontWeight}</span>
            <input type="range" min="400" max="800" step="100" value={config.fontWeight} onChange={set("fontWeight")} />
          </label>

          <label className="field">
            <span>Corner radius — {config.borderRadius}px</span>
            <input type="range" min="0" max="40" value={config.borderRadius} onChange={set("borderRadius")} />
          </label>

          <label className="toggle">
            <input type="checkbox" checked={config.animate} onChange={set("animate")} />
            <span>Typing animation</span>
          </label>
        </section>

        <section className="panel preview">
          <h2>Preview</h2>
          <div className="stage">
            {/* Rendered as <img>, exactly how GitHub will show it */}
            <img key={dataUri} src={dataUri} alt={config.text} />
          </div>

          <div className="actions">
            <button onClick={() => copy(svg, "svg")}>
              {copied === "svg" ? "Copied ✓" : "Copy SVG"}
            </button>
            <button onClick={download}>Download .svg</button>
          </div>

          <label className="field">
            <span>README snippet</span>
            <div className="snippet">
              <code>{markdown}</code>
              <button className="ghost" onClick={() => copy(markdown, "md")}>
                {copied === "md" ? "✓" : "copy"}
              </button>
            </div>
          </label>
          <p className="hint">
            Drop <code>banner.svg</code> in an <code>assets/</code> folder in your repo,
            then paste the snippet into your README.
          </p>
        </section>
      </main>
    </div>
  );
}