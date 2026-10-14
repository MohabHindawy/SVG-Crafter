import fastfetch from "./fastfetch";

export const TEMPLATES = [fastfetch];
export const getTemplate = (id) => TEMPLATES.find((t) => t.id === id) || null;
export const defaultTemplateState = () => ({
  active: null,
  configs: Object.fromEntries(TEMPLATES.map((t) => [t.id, t.defaults()])),
});

export function sanitizeTemplateState(raw) {
  const configs = {};
  for (const t of TEMPLATES) {
    configs[t.id] = t.sanitize(raw?.configs?.[t.id]);
  }
  const active = getTemplate(raw?.active) ? raw.active : null;
  return { active, configs };
}
