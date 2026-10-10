import { ORDER_STAGES, type OrderStage } from "@autochat/core";

/**
 * Order stage state machine. Open orders advance forward through ORDER_STAGES
 * and can be cancelled from any non-terminal stage.
 */
const TERMINAL: OrderStage[] = ["delivered", "cancelled"];

export function isTerminal(stage: OrderStage): boolean {
  return TERMINAL.includes(stage);
}

export function nextStage(stage: OrderStage): OrderStage | null {
  const i = ORDER_STAGES.indexOf(stage);
  if (i < 0 || i >= ORDER_STAGES.length - 1) return null;
  return ORDER_STAGES[i + 1] ?? null;
}

export function canTransition(from: OrderStage, to: OrderStage): boolean {
  if (from === to) return false;
  if (to === "cancelled") return !isTerminal(from);
  if (isTerminal(from)) return false;
  const fi = ORDER_STAGES.indexOf(from);
  const ti = ORDER_STAGES.indexOf(to);
  if (fi < 0 || ti < 0) return false;
  return ti === fi + 1; // only single-step forward moves
}

const STAGE_LABELS: Record<OrderStage, string> = {
  awaiting_review: "Awaiting review",
  awaiting_acceptance: "Awaiting acceptance",
  approved: "Approved",
  design_review: "Design review",
  in_production: "In production",
  dispatched: "Dispatched",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

export function stageLabel(stage: OrderStage): string {
  return STAGE_LABELS[stage];
}
