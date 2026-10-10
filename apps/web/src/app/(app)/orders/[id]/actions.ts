"use server";

import { revalidatePath } from "next/cache";
import {
  priceQuote,
  acceptQuote,
  advanceOrderStage,
  cancelOrder,
  createOrderShipment,
  refreshTracking,
  markOrderPaid,
  getCommerceProvider,
} from "@autochat/commerce";
import { requireSession } from "../../../../lib/session.js";

function rev(id: string) {
  revalidatePath(`/orders/${id}`);
  revalidatePath("/orders");
  revalidatePath("/dashboard");
}

export async function priceQuoteAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const id = String(formData.get("orderId"));
  const unitPriceInr = formData.get("unitPriceInr") ? Number(formData.get("unitPriceInr")) : undefined;
  const gstPercent = formData.get("gstPercent") ? Number(formData.get("gstPercent")) : undefined;
  await priceQuote(session.workspaceId, id, { unitPriceInr, gstPercent });
  rev(id);
}

export async function acceptQuoteAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const id = String(formData.get("orderId"));
  await acceptQuote(session.workspaceId, id);
  rev(id);
}

export async function advanceStageAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const id = String(formData.get("orderId"));
  await advanceOrderStage(session.workspaceId, id);
  rev(id);
}

export async function cancelOrderAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const id = String(formData.get("orderId"));
  await cancelOrder(session.workspaceId, id);
  rev(id);
}

export async function paymentLinkAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const id = String(formData.get("orderId"));
  await getCommerceProvider(session.workspaceId).createPaymentLink(session.workspaceId, id);
  rev(id);
}

export async function createShipmentAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const id = String(formData.get("orderId"));
  await createOrderShipment(session.workspaceId, id);
  rev(id);
}

export async function refreshTrackingAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const id = String(formData.get("orderId"));
  await refreshTracking(session.workspaceId, id);
  rev(id);
}

/** Dev-only: simulate a successful payment (what the Razorpay webhook would do). */
export async function simulatePaidAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const id = String(formData.get("orderId"));
  await markOrderPaid(session.workspaceId, id, `sim_${Date.now()}`);
  rev(id);
}
