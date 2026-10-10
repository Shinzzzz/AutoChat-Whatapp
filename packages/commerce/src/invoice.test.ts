import { describe, it, expect } from "vitest";
import { computeTotals, DEFAULT_GST_PERCENT } from "./invoice.js";

describe("computeTotals", () => {
  it("applies default 18% GST", () => {
    const t = computeTotals(1000, 1000); // ₹10 × 1000 = ₹10,000
    expect(t.subtotalPaise).toBe(1_000_000);
    expect(t.taxPaise).toBe(180_000);
    expect(t.totalPaise).toBe(1_180_000);
    expect(t.gstPercent).toBe(DEFAULT_GST_PERCENT);
  });

  it("supports a custom GST rate", () => {
    const t = computeTotals(1200, 500, 12);
    expect(t.subtotalPaise).toBe(600_000);
    expect(t.taxPaise).toBe(72_000);
    expect(t.totalPaise).toBe(672_000);
  });

  it("rounds tax to whole paise", () => {
    const t = computeTotals(333, 7, 18); // subtotal 2331 → tax 419.58 → 420
    expect(t.subtotalPaise).toBe(2331);
    expect(t.taxPaise).toBe(420);
    expect(t.totalPaise).toBe(2751);
  });
});
