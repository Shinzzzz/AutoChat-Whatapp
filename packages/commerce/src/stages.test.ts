import { describe, it, expect } from "vitest";
import { canTransition, nextStage, isTerminal, stageLabel } from "./stages.js";

describe("order stage machine", () => {
  it("advances one step forward", () => {
    expect(nextStage("awaiting_review")).toBe("awaiting_acceptance");
    expect(nextStage("dispatched")).toBe("delivered");
    expect(nextStage("delivered")).toBeNull();
  });

  it("allows only single-step forward transitions", () => {
    expect(canTransition("awaiting_review", "awaiting_acceptance")).toBe(true);
    expect(canTransition("awaiting_review", "in_production")).toBe(false);
    expect(canTransition("approved", "awaiting_review")).toBe(false);
  });

  it("allows cancel from any non-terminal stage", () => {
    expect(canTransition("in_production", "cancelled")).toBe(true);
    expect(canTransition("delivered", "cancelled")).toBe(false);
    expect(canTransition("cancelled", "cancelled")).toBe(false);
  });

  it("knows terminal stages", () => {
    expect(isTerminal("delivered")).toBe(true);
    expect(isTerminal("cancelled")).toBe(true);
    expect(isTerminal("approved")).toBe(false);
  });

  it("labels stages", () => {
    expect(stageLabel("in_production")).toBe("In production");
  });
});
