import { signal, effect } from "@preact/signals";

export type ThemeMode = "light" | "dark" | "system";

export interface ColorSeed {
  name: string;
  hex: string;
}

export const PRESET_COLORS: ColorSeed[] = [
  { name: "Cyan Loco", hex: "#006689" },
  { name: "Emerald", hex: "#006b54" },
  { name: "Purple", hex: "#6b4ea2" },
  { name: "Amber", hex: "#825500" },
  { name: "Rose", hex: "#9b3749" },
];

const MODE_STORAGE_KEY = "loco_theme_mode";
const COLOR_STORAGE_KEY = "loco_theme_color";

const initialMode = (localStorage.getItem(MODE_STORAGE_KEY) as ThemeMode) || "system";
const initialColor = localStorage.getItem(COLOR_STORAGE_KEY) || PRESET_COLORS[0].hex;

export const themeModeSignal = signal<ThemeMode>(initialMode);
export const themeColorSignal = signal<string>(initialColor);

/**
 * Aplica as personalizações utilizando a API nativa do BeerCSS v5.
 */
function applyBeerTheme(mode: ThemeMode, colorHex: string) {
  if (typeof window === "undefined") return;

  const beerMode = mode === "system" ? "auto" : mode;

  // 1. Aplicação via API global do JS do BeerCSS
  if (typeof (window as any).ui === "function") {
    (window as any).ui("mode", beerMode);
    (window as any).ui("theme", colorHex);
    return;
  }

  // 2. Fallback declarativo via data-ui no HTML
  document.documentElement.setAttribute("data-ui", beerMode);
  document.documentElement.style.setProperty("--primary", colorHex);
}

// Reação em tempo real via Signals + Persistência local
effect(() => {
  const mode = themeModeSignal.value;
  const color = themeColorSignal.value;

  localStorage.setItem(MODE_STORAGE_KEY, mode);
  localStorage.setItem(COLOR_STORAGE_KEY, color);

  applyBeerTheme(mode, color);
});

export function setThemeMode(mode: ThemeMode) {
  themeModeSignal.value = mode;
}

export function setThemeColor(colorHex: string) {
  themeColorSignal.value = colorHex;
}