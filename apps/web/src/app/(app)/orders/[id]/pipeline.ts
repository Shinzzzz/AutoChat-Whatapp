import type { OrderStage } from "@autochat/core";

/** Local stage labels for the order detail pipeline (keeps the page independent
 *  of the commerce package's heavier server-only exports). */
export const ORDER_STAGES_LABELS: { key: OrderStage; label: string }[] = [
  { key: "awaiting_review", label: "Review" },
  { key: "awaiting_acceptance", label: "Acceptance" },
  { key: "approved", label: "Approved" },
  { key: "design_review", label: "Design" },
  { key: "in_production", label: "Production" },
  { key: "dispatched", label: "Dispatched" },
  { key: "delivered", label: "Delivered" },
];

const FULL: Record<OrderStage, string> = {
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
  return FULL[stage];
}
