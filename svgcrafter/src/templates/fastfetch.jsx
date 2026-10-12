/* eslint-disable react-refresh/only-export-components */
import {
  clamp,
  round,
  escapeXml,
  hex,
  THEMES,
  TERMINAL_NAMES,
  ColorField,
  ThemePicker,
} from "./shared";

// 16 rows of characters and fill tiers extracted from hero_animated.svg
const LOGO_CHARS = [
  "               oOO",
  "            OOOOOOOOO",
  "        OOOOOoo+ooOOOOOO",
  "    OOOOOoo+~++++++oooOOOOOO",
  "  OOOoo+~++++++++++++++ooOOO:..",
  "  OOO~+++OQQ+++++OQ0~++++OOo....",
  "  OOO:+++QQQQOo0QQQO~+++oOOo...",
  " OOOo~++oQQ~QQQQ+QQ+~+++oOO~...",
  " OOO~+++OQQ:+oo~oQQ.++++OOO....",
  " OOO:+++O0o~++++o0o:+++oOOo...",
  "oOOOoo+++++++++++++++ooOOO~...",
  " OOOOOOoo++++++++oooOOOo+~....",
  "    OOOOOOooooooOOOo+~......",
  "        OOOOOOOo+~......",
  "           Oo~......",
  "              ...",
];

const LOGO_TIERS = [
  "000000000000000111",
  "000000000000111111111",
  "000000001111111121111111",
  "0000111111112222222221111111",
  "0011111122222222222222221111111",
  "00111122223332222333322221111111",
  "0011122223333323333332222111111",
  "0111122223333333333322221111111",
  "0111122223332233233322221111111",
  "011122223333222223332222111111",
  "111112222222222222222221111111",
  "011111112222222222211111111111",
  "0000111111122221111111111111",
  "000000001111111111111111",
  "00000000000111111111",
  "00000000000000111",
];

// Empty hexagon: replace tier-3 cells with '+' at tier 2
const EMPTY_HEX_ROWS = LOGO_CHARS.map((chars, r) => {
  const charsArr = chars.split("");
  const tiersArr = LOGO_TIERS[r].split("");
  for (let c = 0; c < tiersArr.length; c++) {
    if (tiersArr[c] === "3") {
      charsArr[c] = "+";
      tiersArr[c] = "2";
    }
  }
  return {
    chars: charsArr.join(""),
    tiers: tiersArr.join(""),
  };
});

// Built-in 5x5 pixel font for A-Z and 0-9
const GLYPHS_5X5 = {
  A: [".###.", "#...#", "#####", "#...#", "#...#"],
  B: ["####.", "#...#", "####.", "#...#", "####."],
  C: [".####", "#....", "#....", "#....", ".####"],
  D: ["####.", "#...#", "#...#", "#...#", "####."],
  E: ["#####", "#....", "####.", "#....", "#####"],
  F: ["#####", "#....", "####.", "#....", "#...."],
  G: [".####", "#....", "#.###", "#...#", ".####"],
  H: ["#...#", "#...#", "#####", "#...#", "#...#"],
  I: ["#####", "..#..", "..#..", "..#..", "#####"],
  J: ["...##", "....#", "....#", "#...#", ".###."],
  K: ["#...#", "#..#.", "###..", "#..#.", "#...#"],
  L: ["#....", "#....", "#....", "#....", "#####"],
  M: ["#...#", "##.##", "#.#.#", "#...#", "#...#"],
  N: ["#...#", "##..#", "#.#.#", "#..##", "#...#"],
  O: [".###.", "#...#", "#...#", "#...#", ".###."],
  P: ["####.", "#...#", "####.", "#....", "#...."],
  Q: [".###.", "#...#", "#...#", "#..##", ".####"],
  R: ["####.", "#...#", "####.", "#..#.", "#...#"],
  S: [".####", "#....", ".###.", "....#", "####."],
  T: ["#####", "..#..", "..#..", "..#..", "..#.."],
  U: ["#...#", "#...#", "#...#", "#...#", ".###."],
  V: ["#...#", "#...#", "#...#", ".#.#.", "..#.."],
  W: ["#...#", "#...#", "#.#.#", "##.##", "#...#"],
  X: ["#...#", ".#.#.", "..#..", ".#.#.", "#...#"],
  Y: ["#...#", ".#.#.", "..#..", "..#..", "..#.."],
  Z: ["#####", "...#.", "..#..", ".#...", "#####"],
  0: [".###.", "#..##", "#.#.#", "##..#", ".###."],
  1: ["..#..", ".##..", "..#..", "..#..", ".###."],
  2: ["####.", "....#", ".###.", "#....", "#####"],
  3: ["####.", "....#", "..##.", "....#", "####."],
  4: ["#...#", "#...#", "#####", "....#", "....#"],
  5: ["#####", "#....", "####.", "....#", "####."],
  6: [".####", "#....", "####.", "#...#", ".###."],
  7: ["#####", "....#", "...#.", "..#..", "..#.."],
  8: [".###.", "#...#", ".###.", "#...#", ".###."],
  9: [".###.", "#...#", ".####", "....#", "####."],
};

const logoCache = new Map();

function buildLogo(letter = "S") {
  const norm = String(letter || "S").toUpperCase().trim()[0] || "S";
  const valid = (norm >= "A" && norm <= "Z") || (norm >= "0" && norm <= "9") ? norm : "S";
  if (logoCache.has(valid)) {
    return logoCache.get(valid);
  }

  const glyph = GLYPHS_5X5[valid] || GLYPHS_5X5.S;
  // Center: col 10 in rows 5..9
  const startCol = 10;
  const grid = EMPTY_HEX_ROWS.map((row, rIdx) => {
    const charsArr = row.chars.split("");
    const tiersArr = row.tiers.split("");
    if (rIdx >= 5 && rIdx <= 9) {
      const gRow = glyph[rIdx - 5];
      for (let gCol = 0; gCol < 5; gCol++) {
        if (gRow[gCol] === "#") {
          const c1 = startCol + gCol * 2;
          const c2 = c1 + 1;
          charsArr[c1] = "Q";
          tiersArr[c1] = "3";
          charsArr[c2] = "Q";
          tiersArr[c2] = "3";
        }
      }
    }
    return {
      chars: charsArr.join(""),
      tiers: tiersArr.join(""),
    };
  });

  logoCache.set(valid, grid);
  return grid;
}

function fromTheme(roles) {
  return {
    bg: roles.bg,
    titlebar: roles.surface,
    titlebarBorder: roles.surfaceBorder,
    chromeIcon: roles.muted,
    tabBg: roles.bg,
    tabAccent: roles.primary,
    tabText: roles.text,
    windowBorder: roles.border,
    promptPath: roles.bg === "#282a36" ? "#6c8ee0" : roles.primary,
    promptSymbol: roles.primary,
    command: roles.text,
    cursor: roles.primary,
    logoBase: roles.secondary,
    logoDim: roles.primaryDim,
    logoAccent: roles.primary,
    title: roles.text,
    divider: roles.border,
    label: roles.primary,
    separator: roles.text,
    value: roles.text,
  };
}

function defaults() {
  const draculaTheme = THEMES.find((t) => t.id === "dracula") || THEMES[0];
  return {
    terminalName: "Konsole",
    letter: "S",
    title: "Your Name",
    rows: [
      { id: "row-1", label: "Role", value: "Your title" },
      { id: "row-2", label: "Focus", value: "What you're building" },
      { id: "row-3", label: "Editor", value: "Your editor" },
      { id: "row-4", label: "Status", value: "Something playful" },
    ],
    themeId: "dracula",
    colors: fromTheme(draculaTheme.roles),
  };
}

function stripControl(str) {
  if (typeof str !== "string") return "";
  let out = "";
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if ((code >= 0x20 && code !== 0x7f) || code === 0x09) {
      out += str[i];
    }
  }
  return out;
}

function sanitize(raw) {
  const def = defaults();
  if (!raw || typeof raw !== "object") return def;

  const terminalName =
    stripControl(
      typeof raw.terminalName === "string" ? raw.terminalName : def.terminalName,
    )
      .trim()
      .slice(0, 24) || "Terminal";

  let letter = String(raw.letter || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  if (!letter || letter.length > 1) {
    letter = letter ? letter[0] : "S";
  }

  const title = stripControl(
    typeof raw.title === "string" ? raw.title : def.title,
  )
    .trim()
    .slice(0, 40);

  let rows = Array.isArray(raw.rows) ? raw.rows : def.rows;
  rows = rows
    .map((r, i) => {
      const id = r?.id
        ? String(r.id)
        : `row-${i + 1}-${Math.random().toString(36).slice(2, 7)}`;
      const label = stripControl(String(r?.label ?? ""))
        .trim()
        .slice(0, 14);
      const value = stripControl(String(r?.value ?? ""))
        .trim()
        .slice(0, 38);
      return { id, label, value };
    })
    .filter((r, idx, arr) => {
      if (!r.label && !r.value && arr.length > 1) return false;
      return true;
    })
    .slice(0, 12);

  if (rows.length === 0) {
    rows = [{ id: "row-1", label: "Role", value: "Your title" }];
  }

  const themeId = THEMES.some((t) => t.id === raw.themeId)
    ? raw.themeId
    : "custom";

  const colors = {};
  for (const k of Object.keys(def.colors)) {
    colors[k] = hex(raw.colors?.[k], def.colors[k]);
  }

  return {
    terminalName,
    letter,
    title,
    rows,
    themeId,
    colors,
  };
}

function renderLogoRow(row, y, colors) {
  const match = row.chars.match(/^(\s*)/);
  const leadingCount = match ? match[1].length : 0;
  if (leadingCount >= row.chars.length) return null;

  const startX = round(24 + leadingCount * 8.4);
  const chars = row.chars.slice(leadingCount);
  const tiers = row.tiers.slice(leadingCount);

  const runs = [];
  let curTier = tiers[0];
  let curText = chars[0];
  for (let i = 1; i < chars.length; i++) {
    if (tiers[i] === curTier) {
      curText += chars[i];
    } else {
      runs.push({ tier: curTier, text: curText });
      curTier = tiers[i];
      curText = chars[i];
    }
  }
  runs.push({ tier: curTier, text: curText });

  const tspans = runs
    .map((r) => {
      const escaped = escapeXml(r.text);
      if (r.tier === "1") {
        return `<tspan fill="${colors.logoBase}">${escaped}</tspan>`;
      }
      if (r.tier === "2") {
        return `<tspan fill="${colors.logoDim}">${escaped}</tspan>`;
      }
      if (r.tier === "3") {
        return `<tspan fill="${colors.logoAccent}" font-weight="700">${escaped}</tspan>`;
      }
      return `<tspan fill="${colors.text || "#f8f8f2"}">${escaped}</tspan>`;
    })
    .join("");

  return `<text x="${startX}" y="${y}" xml:space="preserve">${tspans}</text>`;
}

function generate(rawCfg) {
  const cfg = sanitize(rawCfg);
  const { colors } = cfg;

  const tabW = clamp(round(36 + cfg.terminalName.length * 7.6 + 40), 132, 300);
  const tabRight = 56 + tabW;

  const logoRows = buildLogo(cfg.letter);

  let xml = `<svg xmlns="http://www.w3.org/2000/svg" width="840" height="435" viewBox="0 0 840 435" font-family="'Fira Code','JetBrains Mono','DejaVu Sans Mono',monospace" font-size="14" role="img" aria-label="${escapeXml(cfg.terminalName)} terminal running fastfetch">`;
  xml += `<defs>`;
  xml += `<clipPath id="win"><rect width="840" height="435" rx="10"/></clipPath>`;
  xml += `<clipPath id="ty"><rect x="57.6" y="46" height="22" width="0"><animate attributeName="width" values="0.0;8.4;16.8;25.2;33.6;42.0;50.4;58.8;67.2;75.6" dur="0.81s" begin="0.7s" calcMode="discrete" fill="freeze"/></rect></clipPath>`;
  xml += `</defs>`;

  xml += `<g clip-path="url(#win)">`;
  xml += `<rect width="840" height="435" fill="${colors.bg}"/>`;
  xml += `<rect width="840" height="30" fill="${colors.titlebar}"/>`;
  xml += `<rect y="29" width="840" height="1" fill="${colors.titlebarBorder}"/>`;
  xml += `<path d="M24 15 h10 M29 10 v10" stroke="${colors.chromeIcon}" stroke-width="1.4" stroke-linecap="round"/>`;
  xml += `<rect x="56" y="0" width="${tabW}" height="30" fill="${colors.tabBg}"/>`;
  xml += `<rect x="56" y="27.5" width="${tabW}" height="2.5" fill="${colors.tabAccent}"/>`;
  xml += `<path d="M70 10.5 l4 3.2 -4 3.2" fill="none" stroke="${colors.chromeIcon}" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>`;
  xml += `<path d="M77 17.5 h5" stroke="${colors.chromeIcon}" stroke-width="1.4" stroke-linecap="round"/>`;
  xml += `<text x="92" y="19.5" xml:space="preserve" fill="${colors.tabText}" font-size="12.5">${escapeXml(cfg.terminalName)}</text>`;
  xml += `<path d="M${tabRight - 20} 11 l7 7 m0 -7 l-7 7" stroke="${colors.chromeIcon}" stroke-width="1.3" stroke-linecap="round"/>`;
  xml += `</g>`;

  xml += `<text x="24" y="62" xml:space="preserve"><tspan fill="${colors.promptPath}">~</tspan><tspan fill="${colors.promptSymbol}" font-weight="700"> $ </tspan></text>`;
  xml += `<text x="57.6" y="62" xml:space="preserve" fill="${colors.command}" clip-path="url(#ty)">fastfetch</text>`;
  xml += `<rect x="57.6" y="49" width="8.4" height="17" fill="${colors.cursor}"><animate attributeName="x" values="57.6;66.0;74.4;82.8;91.2;99.6;108.0;116.4;124.8;133.2" dur="0.81s" begin="0.7s" calcMode="discrete" fill="freeze"/><set attributeName="opacity" to="1" begin="0.7s"/><set attributeName="opacity" to="0" begin="1.75s" fill="freeze"/></rect>`;

  // 16 logo rows
  for (let i = 0; i < 16; i++) {
    const row = logoRows[i];
    const y = 92 + 19 * i;
    const beginTime = (1.80 + 0.06 * i).toFixed(2) + "s";
    const textXml = renderLogoRow(row, y, colors);
    if (textXml) {
      xml += `<g opacity="0"><set attributeName="opacity" to="1" begin="${beginTime}" fill="freeze"/>${textXml}</g>`;
    }
  }

  // Info block
  const N = cfg.rows.length;
  const totalLines = N + 2;
  const startRow = Math.floor((16 - totalLines) / 2);

  // Line 0: title
  const titleRow = startRow;
  const titleY = 92 + 19 * titleRow;
  const titleBegin = (1.80 + 0.06 * titleRow).toFixed(2) + "s";
  xml += `<g opacity="0"><set attributeName="opacity" to="1" begin="${titleBegin}" fill="freeze"/><text x="328.8" y="${titleY}" xml:space="preserve" fill="${colors.title}" font-weight="700">${escapeXml(cfg.title)}</text></g>`;

  // Line 1: divider dashes
  const divRow = startRow + 1;
  const divY = 92 + 19 * divRow;
  const divBegin = (1.80 + 0.06 * divRow).toFixed(2) + "s";
  const dashes = "-".repeat(cfg.title ? cfg.title.length : 0);
  xml += `<g opacity="0"><set attributeName="opacity" to="1" begin="${divBegin}" fill="freeze"/><text x="328.8" y="${divY}" xml:space="preserve" fill="${colors.divider}">${dashes}</text></g>`;

  // Info lines
  cfg.rows.forEach((r, idx) => {
    const rowIdx = startRow + 2 + idx;
    const y = 92 + 19 * rowIdx;
    const beginTime = (1.80 + 0.06 * rowIdx).toFixed(2) + "s";

    let label = r.label.slice(0, 14);
    let value = r.value;
    const sep = ": ";
    const avail = 56 - label.length - sep.length;
    if (value.length > avail) {
      value = value.slice(0, Math.max(0, avail - 1)) + "…";
    }

    xml += `<g opacity="0"><set attributeName="opacity" to="1" begin="${beginTime}" fill="freeze"/><text x="328.8" y="${y}" xml:space="preserve"><tspan fill="${colors.label}" font-weight="700">${escapeXml(label)}</tspan><tspan fill="${colors.separator}">: </tspan><tspan fill="${colors.value}">${escapeXml(value)}</tspan></text></g>`;
  });

  // Final prompt
  xml += `<g opacity="0"><set attributeName="opacity" to="1" begin="2.97s" fill="freeze"/><text x="24" y="409" xml:space="preserve"><tspan fill="${colors.promptPath}">~</tspan><tspan fill="${colors.promptSymbol}" font-weight="700"> $ </tspan></text><rect x="57.6" y="396" width="8.4" height="17" fill="${colors.cursor}"></rect></g>`;

  // Outer border
  xml += `<rect x="0.5" y="0.5" width="839" height="434" rx="10" fill="none" stroke="${colors.windowBorder}" stroke-opacity=".8"/>`;

  xml += `</svg>`;
  return xml;
}

function alt(cfg) {
  return `${cfg?.terminalName || "Konsole"} terminal running fastfetch`;
}

function Editor({ value, onChange, Section }) {
  const patch = (updates) => onChange({ ...value, ...updates });
  const patchColor = (key, val) =>
    onChange({
      ...value,
      themeId: "custom",
      colors: { ...value.colors, [key]: val },
    });

  const setRow = (idx, updates) => {
    const nextRows = value.rows.map((r, i) => (i === idx ? { ...r, ...updates } : r));
    patch({ rows: nextRows });
  };

  const removeRow = (idx) => {
    if (value.rows.length <= 1) return;
    patch({ rows: value.rows.filter((_, i) => i !== idx) });
  };

  const moveRow = (from, to) => {
    if (to < 0 || to >= value.rows.length) return;
    const next = [...value.rows];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    patch({ rows: next });
  };

  const addRow = () => {
    if (value.rows.length >= 12) return;
    const newId = `row-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`;
    patch({
      rows: [...value.rows, { id: newId, label: "Field", value: "Value" }],
    });
  };

  const onPickTheme = (tid) => {
    const theme = THEMES.find((t) => t.id === tid);
    if (!theme) return;
    patch({
      themeId: tid,
      colors: fromTheme(theme.roles),
    });
  };

  return (
    <div className="template-editor">
      <Section title="Terminal" defaultOpen summary={value.terminalName}>
        <div className="field">
          <span>Terminal presets</span>
          <div className="font-grid" style={{ marginBottom: "12px" }}>
            {TERMINAL_NAMES.map((name) => (
              <button
                key={name}
                type="button"
                className={`font-chip${value.terminalName === name ? " on" : ""}`}
                onClick={() => patch({ terminalName: name })}
              >
                {name}
              </button>
            ))}
          </div>
        </div>
        <label className="field">
          <span>Tab label — {value.terminalName.length}/24 chars</span>
          <input
            type="text"
            value={value.terminalName}
            maxLength={24}
            onChange={(e) => patch({ terminalName: e.target.value })}
            placeholder="Tab label"
          />
        </label>
      </Section>

      <Section title="Logo" defaultOpen summary={`Letter '${value.letter}'`}>
        <div className="field">
          <span>Logo letter (A–Z, 0–9)</span>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <input
              type="text"
              value={value.letter}
              maxLength={1}
              onChange={(e) => {
                const char = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
                patch({ letter: char || "S" });
              }}
              style={{
                width: "48px",
                textAlign: "center",
                fontSize: "18px",
                fontWeight: 700,
                fontFamily: "monospace",
              }}
            />
            <span style={{ fontSize: "12px", color: "var(--muted)" }}>
              Rendered in a 5×5 pixel glyph centered inside the hexagon
            </span>
          </div>
        </div>

        <ColorField
          label="Hexagon main tone"
          value={value.colors.logoBase}
          onChange={(v) => patchColor("logoBase", v)}
        />
        <ColorField
          label="Hexagon inner tone"
          value={value.colors.logoDim}
          onChange={(v) => patchColor("logoDim", v)}
        />
        <ColorField
          label="Letter accent tone"
          value={value.colors.logoAccent}
          onChange={(v) => patchColor("logoAccent", v)}
        />
      </Section>

      <Section
        title="Info"
        defaultOpen
        summary={`${value.rows.length} row${value.rows.length > 1 ? "s" : ""}`}
      >
        <label className="field">
          <span>Title line — {value.title.length}/40 chars</span>
          <input
            type="text"
            value={value.title}
            maxLength={40}
            onChange={(e) => patch({ title: e.target.value })}
            placeholder="Your Name"
          />
        </label>

        <div className="field">
          <span>Info rows ({value.rows.length}/12)</span>
          <div className="sentences" style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {value.rows.map((row, idx) => {
              const totalLen = row.label.length + 2 + row.value.length;
              return (
                <div
                  key={row.id}
                  className="sentence-item"
                  style={{
                    background: "var(--panel)",
                    border: "1px solid var(--border)",
                    borderRadius: "6px",
                    padding: "8px",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "6px" }}>
                    <div className="s-arrows" style={{ display: "flex", gap: "2px" }}>
                      <button
                        type="button"
                        onClick={() => moveRow(idx, idx - 1)}
                        disabled={idx === 0}
                        aria-label="Move row up"
                      >
                        ▲
                      </button>
                      <button
                        type="button"
                        onClick={() => moveRow(idx, idx + 1)}
                        disabled={idx === value.rows.length - 1}
                        aria-label="Move row down"
                      >
                        ▼
                      </button>
                    </div>
                    <span style={{ fontSize: "11px", color: "var(--muted)", flex: 1 }}>
                      Row {idx + 1} &middot; {totalLen}/56 chars
                    </span>
                    <button
                      type="button"
                      className="remove"
                      onClick={() => removeRow(idx)}
                      disabled={value.rows.length <= 1}
                      aria-label="Remove row"
                      style={{ opacity: value.rows.length <= 1 ? 0.3 : 1 }}
                    >
                      ✕
                    </button>
                  </div>
                  <div style={{ display: "flex", gap: "6px" }}>
                    <input
                      type="text"
                      value={row.label}
                      maxLength={14}
                      onChange={(e) => setRow(idx, { label: e.target.value })}
                      placeholder="Label"
                      style={{ width: "35%", minWidth: "80px" }}
                    />
                    <input
                      type="text"
                      value={row.value}
                      maxLength={38}
                      onChange={(e) => setRow(idx, { value: e.target.value })}
                      placeholder="Value"
                      style={{ flex: 1 }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <button
            type="button"
            className="add"
            onClick={addRow}
            disabled={value.rows.length >= 12}
            style={{ width: "100%", marginTop: "10px" }}
          >
            + Add row
          </button>
        </div>
      </Section>

      <Section title="Colours & Theme" defaultOpen summary={value.themeId}>
        <ThemePicker value={value.themeId} onPick={onPickTheme} />

        <div className="subgroup">
          <span style={{ fontSize: "12px", fontWeight: 700, color: "var(--muted)", display: "block", marginBottom: "12px" }}>
            Window Chrome
          </span>
          <ColorField
            label="Window background"
            value={value.colors.bg}
            onChange={(v) => {
              patchColor("bg", v);
              patchColor("tabBg", v);
            }}
          />
          <ColorField
            label="Window border"
            value={value.colors.windowBorder}
            onChange={(v) => patchColor("windowBorder", v)}
          />
          <ColorField
            label="Title bar fill"
            value={value.colors.titlebar}
            onChange={(v) => patchColor("titlebar", v)}
          />
          <ColorField
            label="Title bar border line"
            value={value.colors.titlebarBorder}
            onChange={(v) => patchColor("titlebarBorder", v)}
          />
          <ColorField
            label="Chrome icons (+, shell, close)"
            value={value.colors.chromeIcon}
            onChange={(v) => patchColor("chromeIcon", v)}
          />
          <ColorField
            label="Tab underline"
            value={value.colors.tabAccent}
            onChange={(v) => patchColor("tabAccent", v)}
          />
          <ColorField
            label="Tab label"
            value={value.colors.tabText}
            onChange={(v) => patchColor("tabText", v)}
          />
        </div>

        <div className="subgroup">
          <span style={{ fontSize: "12px", fontWeight: 700, color: "var(--muted)", display: "block", marginBottom: "12px" }}>
            Terminal Prompt
          </span>
          <ColorField
            label="Path (~)"
            value={value.colors.promptPath}
            onChange={(v) => patchColor("promptPath", v)}
          />
          <ColorField
            label="Prompt symbol ($)"
            value={value.colors.promptSymbol}
            onChange={(v) => patchColor("promptSymbol", v)}
          />
          <ColorField
            label="Typed command (fastfetch)"
            value={value.colors.command}
            onChange={(v) => patchColor("command", v)}
          />
          <ColorField
            label="Block cursor"
            value={value.colors.cursor}
            onChange={(v) => patchColor("cursor", v)}
          />
        </div>

        <div className="subgroup">
          <span style={{ fontSize: "12px", fontWeight: 700, color: "var(--muted)", display: "block", marginBottom: "12px" }}>
            Info & Text
          </span>
          <ColorField
            label="Name / Title"
            value={value.colors.title}
            onChange={(v) => patchColor("title", v)}
          />
          <ColorField
            label="Dashes divider"
            value={value.colors.divider}
            onChange={(v) => patchColor("divider", v)}
          />
          <ColorField
            label="Row labels"
            value={value.colors.label}
            onChange={(v) => patchColor("label", v)}
          />
          <ColorField
            label="Separator (: )"
            value={value.colors.separator}
            onChange={(v) => patchColor("separator", v)}
          />
          <ColorField
            label="Row values"
            value={value.colors.value}
            onChange={(v) => patchColor("value", v)}
          />
        </div>

        <button
          type="button"
          className="add"
          onClick={() => patch(defaults())}
          style={{ width: "100%", marginTop: "12px" }}
        >
          Reset to Dracula defaults
        </button>
      </Section>
    </div>
  );
}

const fastfetch = {
  id: "fastfetch",
  name: "Fastfetch Terminal",
  desc: "Animated Konsole window running fastfetch",
  defaults,
  sanitize,
  generate,
  alt,
  Editor,
};

export default fastfetch;
