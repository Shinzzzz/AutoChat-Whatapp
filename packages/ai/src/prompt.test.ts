import { describe, it, expect } from "vitest";
import { buildSystemPrompt } from "./prompt.js";
import { resolveModel, DEFAULT_MODEL } from "./model.js";

describe("buildSystemPrompt", () => {
  it("includes the brand name, knowledge and the never-hardcode-price rule", () => {
    const p = buildSystemPrompt({
      brandName: "AquaMedia",
      persona: "Friendly and crisp.",
      knowledge: "Bottled water business facts.",
      autonomy: "full_auto",
    });
    expect(p).toContain("AquaMedia");
    expect(p).toContain("Bottled water business facts.");
    expect(p).toMatch(/NEVER quote a price/i);
    expect(p).toContain("handoff_to_human");
  });

  it("reflects the autonomy level", () => {
    const assist = buildSystemPrompt({
      brandName: "X",
      persona: "",
      knowledge: "",
      autonomy: "assist",
    });
    expect(assist).toMatch(/a human will review/i);
  });
});

describe("resolveModel", () => {
  it("prefers the workspace override", () => {
    expect(resolveModel("claude-sonnet-5-5")).toBe("claude-sonnet-5-5");
  });
  it("falls back to the default", () => {
    delete process.env.ANTHROPIC_MODEL;
    expect(resolveModel(null)).toBe(DEFAULT_MODEL);
  });
});
