/**
 * White-label theming. A workspace's brand settings become CSS custom
 * properties injected at the app root, so no brand is baked into the UI.
 */
export interface BrandTheme {
  brandName: string;
  logoUrl?: string | null;
  primaryColor: string;
  accentColor: string;
}

export const DEFAULT_THEME: BrandTheme = {
  brandName: "AutoChat",
  logoUrl: null,
  primaryColor: "#4f46e5",
  accentColor: "#06b6d4",
};

/** Convert a brand theme into a CSS custom-property map for :root. */
export function themeToCssVars(theme: BrandTheme): Record<string, string> {
  return {
    "--brand-primary": theme.primaryColor,
    "--brand-accent": theme.accentColor,
    "--brand-primary-contrast": pickContrast(theme.primaryColor),
  };
}

/** Serialize CSS vars into an inline style string for a <style>/<div> tag. */
export function cssVarsToString(vars: Record<string, string>): string {
  return Object.entries(vars)
    .map(([k, v]) => `${k}: ${v};`)
    .join(" ");
}

/** Choose black or white text for legibility on a hex background. */
export function pickContrast(hex: string): string {
  const c = hex.replace("#", "");
  if (c.length !== 6) return "#ffffff";
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  // Relative luminance (sRGB, simplified).
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? "#111827" : "#ffffff";
}
