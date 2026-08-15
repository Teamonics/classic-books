import { browser } from "$app/environment";

export type ThemeId = "light" | "sepia" | "dark" | "contrast";
export type FontId = "serif" | "sans" | "dyslexic";

export interface Settings {
  theme: ThemeId;
  font: FontId;
  fontSize: number; // rem multiplier applied to <html>
  measure: number; // ch, capped per PLAN (45–75)
  lineHeight: number;
}

const DEFAULTS: Settings = {
  theme: "sepia",
  font: "serif",
  fontSize: 1.0,
  measure: 66,
  lineHeight: 1.6,
};

export const LIMITS = {
  fontSize: { min: 0.8, max: 1.6, step: 0.05 },
  measure: { min: 45, max: 75, step: 1 },
  lineHeight: { min: 1.3, max: 2.0, step: 0.05 },
};

const KEY = "cb.v1.settings";

function load(): Settings {
  if (!browser) return { ...DEFAULTS };
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") };
  } catch {
    return { ...DEFAULTS };
  }
}

export const settings = $state<Settings>(load());

export function applySettings() {
  if (!browser) return;
  const root = document.documentElement;
  root.dataset.theme = settings.theme;
  root.style.fontSize = `${settings.fontSize}rem`;
  root.style.setProperty("--measure", `${settings.measure}ch`);
  root.style.setProperty("--line-height", String(settings.lineHeight));
  root.dataset.font = settings.font;
  localStorage.setItem(KEY, JSON.stringify(settings));
}
