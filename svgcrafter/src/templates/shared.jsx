/* eslint-disable react-refresh/only-export-components */
import { useState } from "react";

export const clamp = (val, min, max) => Math.max(min, Math.min(max, val));

export const round = (val, decimals = 1) => {
  const factor = Math.pow(10, decimals);
  return Math.round(val * factor) / factor;
};

export const escapeXml = (str) => {
  if (str == null) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
};

export const isHex = (v) =>
  typeof v === "string" && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v.trim());

export const hex = (v, fallback = "#000000") => {
  if (!isHex(v)) return fallback;
  const s = v.trim().toLowerCase();
  if (s.length === 4) {
    return `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`;
  }
  return s;
};

export const THEMES = [
  {
    id: "terminal",
    name: "Terminal",
    roles: {
      bg: "#000000",
      surface: "#121212",
      surfaceBorder: "#1e1e1e",
      border: "#2e2e2e",
      text: "#e5e5e5",
      muted: "#737373",
      primary: "#58a6ff",
      primaryDim: "#1f3a5f",
      secondary: "#1f6feb",
    },
  },
  {
    id: "matrix",
    name: "Matrix",
    roles: {
      bg: "#080c08",
      surface: "#0e170e",
      surfaceBorder: "#142214",
      border: "#1c3820",
      text: "#bbf7d0",
      muted: "#3d7348",
      primary: "#22c55e",
      primaryDim: "#0e3b18",
      secondary: "#16a34a",
    },
  },
  {
    id: "dracula",
    name: "Dracula",
    roles: {
      bg: "#282a36",
      surface: "#21222c",
      surfaceBorder: "#191a21",
      border: "#44475a",
      text: "#f8f8f2",
      muted: "#6272a4",
      primary: "#7db2ff",
      primaryDim: "#3f4f7d",
      secondary: "#4f78c4",
    },
  },
  {
    id: "nord",
    name: "Nord",
    roles: {
      bg: "#2e3440",
      surface: "#242933",
      surfaceBorder: "#1e222a",
      border: "#434c5e",
      text: "#eceff4",
      muted: "#7b88a1",
      primary: "#88c0d0",
      primaryDim: "#3b5360",
      secondary: "#81a1c1",
    },
  },
  {
    id: "gruvbox",
    name: "Gruvbox",
    roles: {
      bg: "#282828",
      surface: "#1d2021",
      surfaceBorder: "#141617",
      border: "#504945",
      text: "#ebdbb2",
      muted: "#928374",
      primary: "#fabd2f",
      primaryDim: "#665c32",
      secondary: "#fe8019",
    },
  },
  {
    id: "catppuccin",
    name: "Catppuccin",
    roles: {
      bg: "#1e1e2e",
      surface: "#181825",
      surfaceBorder: "#11111b",
      border: "#45475a",
      text: "#cdd6f4",
      muted: "#7f849c",
      primary: "#cba6f7",
      primaryDim: "#4f3b6d",
      secondary: "#89b4fa",
    },
  },
  {
    id: "tokyonight",
    name: "Tokyo Night",
    roles: {
      bg: "#1a1b26",
      surface: "#16161e",
      surfaceBorder: "#101014",
      border: "#292e42",
      text: "#c0caf5",
      muted: "#565f89",
      primary: "#7aa2f7",
      primaryDim: "#3d4e7a",
      secondary: "#2ac3de",
    },
  },
  {
    id: "onedark",
    name: "One Dark",
    roles: {
      bg: "#282c34",
      surface: "#21252b",
      surfaceBorder: "#181a1f",
      border: "#3e4451",
      text: "#abb2bf",
      muted: "#5c6370",
      primary: "#61afef",
      primaryDim: "#314f6b",
      secondary: "#98c379",
    },
  },
  {
    id: "monokai",
    name: "Monokai",
    roles: {
      bg: "#272822",
      surface: "#1e1f1c",
      surfaceBorder: "#141512",
      border: "#49483e",
      text: "#f8f8f2",
      muted: "#75715e",
      primary: "#f92672",
      primaryDim: "#54192d",
      secondary: "#a6e22e",
    },
  },
];

export const DEFAULT_THEME_ID = "terminal";

export const TERMINAL_NAMES = [
  "Konsole",
  "GNOME Terminal",
  "Alacritty",
  "Kitty",
  "iTerm2",
  "Windows Terminal",
  "WezTerm",
  "Terminal",
];

export function ColorField({ label, value, onChange }) {
  const [draft, setDraft] = useState(value);
  const [prevValue, setPrevValue] = useState(value);

  if (value !== prevValue) {
    setPrevValue(value);
    setDraft(value);
  }

  const commit = (val) => {
    if (isHex(val)) {
      const formatted = hex(val, value);
      setDraft(formatted);
      onChange(formatted);
    } else {
      setDraft(value);
    }
  };

  return (
    <div className="field">
      <span>{label}</span>
      <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
        <input
          type="color"
          className="eff-swatch"
          value={hex(value, "#000000")}
          onChange={(e) => {
            setDraft(e.target.value);
            onChange(e.target.value);
          }}
        />
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => commit(draft)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit(draft);
          }}
          spellCheck={false}
          style={{ width: "95px", fontFamily: "monospace" }}
        />
      </div>
    </div>
  );
}

export function ThemePicker({ value, onPick }) {
  return (
    <div className="font-grid" style={{ marginBottom: "16px" }}>
      {THEMES.map((theme) => (
        <button
          key={theme.id}
          type="button"
          className={`font-chip${value === theme.id ? " on" : ""}`}
          onClick={() => onPick(theme.id)}
        >
          {theme.name}
        </button>
      ))}
    </div>
  );
}
