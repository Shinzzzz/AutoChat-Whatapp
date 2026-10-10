import { describe, it, expect } from "vitest";
import { themeToCssVars, pickContrast, DEFAULT_THEME } from "./index.js";

describe("theming", () => {
  it("maps brand colors to CSS vars", () => {
    const vars = themeToCssVars(DEFAULT_THEME);
    expect(vars["--brand-primary"]).toBe("#4f46e5");
    expect(vars["--brand-accent"]).toBe("#06b6d4");
  });

  it("picks legible contrast colors", () => {
    expect(pickContrast("#ffffff")).toBe("#111827");
    expect(pickContrast("#000000")).toBe("#ffffff");
  });
});
