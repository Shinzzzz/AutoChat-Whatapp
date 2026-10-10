import { prisma } from "@autochat/db";
import { putObject } from "@autochat/core/storage";
import { randomId, type OrderStage } from "@autochat/core";
import { computeTotals, DEFAULT_GST_PERCENT } from "./invoice.js";
import { renderDocumentPdf } from "./pdf.js";
import { canTransition, nextStage, stageLabel } from "./stages.js";
import { createShipment, getTracking } from "./shipping/shiprocket.js";

function lineLabel(config: Record<string, unknown>, qty: number): string {
  const parts = [config.model, config.size, config.material, config.water, config.shape]
    .filter(Boolean)
    .join(" ");
  return `${qty.toLocaleString("en-IN")} × ${parts}`;
}

async function loadOrder(workspaceId: string, orderId: string) {
  return prisma.order.findFirstOrThrow({
    where: { id: orderId, workspaceId },
    include: { contact: true, workspace: true, quote: true, shipment: true },
  });
}

/** Team prices a draft quote: compute GST totals, generate the quotation PDF,
 *  move the order to `awaiting_acceptance`. */
export async function priceQuote(
  workspaceId: string,
  orderId: string,
  opts: { unitPriceInr?: number; gstPercent?: number } = {},
): Promise<void> {
  const order = await loadOrder(workspaceId, orderId);
  const qty = order.quantity || 1;
  const unitPaise = opts.unitPriceInr != null
    ? Math.round(opts.unitPriceInr * 100)
    : Math.round(order.subtotalPaise / qty) || 0;
  const totals = computeTotals(unitPaise, qty, opts.gstPercent ?? DEFAULT_GST_PERCENT);

  const number = `Q-${order.id.slice(-6).toUpperCase()}`;
  const pdf = await renderDocumentPdf({
    kind: "Quotation",
    number,
    date: new Date(),
    brandName: order.workspace.brandName,
    customerName: order.contact.name ?? order.contact.phones[0] ?? "Customer",
    customerContact: order.contact.phones[0],
    lineLabel: lineLabel(order.config as Record<string, unknown>, qty),
    quantity: qty,
    unitPricePaise: unitPaise,
    totals,
    note: "Prices valid for 14 days. GST as applicable.",
  });
  const url = await putObject(
    `ws/${workspaceId}/quotations/${number}-${randomId("q", 6)}.pdf`,
    pdf,
    "application/pdf",
  );

  await prisma.order.update({
    where: { id: orderId },
    data: {
      subtotalPaise: totals.subtotalPaise,
      taxPaise: totals.taxPaise,
      totalPaise: totals.totalPaise,
      quotationUrl: url,
      stage: "awaiting_acceptance",
    },
  });
  if (order.quote) {
    await prisma.quote.update({
      where: { id: order.quote.id },
      data: {
        amountPaise: totals.totalPaise,
        status: "sent",
        pdfUrl: url,
        validUntil: new Date(Date.now() + 14 * 24 * 3600 * 1000),
      },
    });
  }
  await audit(workspaceId, "quote.priced", orderId, { totalPaise: totals.totalPaise });
}

/** Customer accepts the priced quote. */
export async function acceptQuote(workspaceId: string, orderId: string): Promise<void> {
  const order = await loadOrder(workspaceId, orderId);
  if (order.quote) {
    await prisma.quote.update({ where: { id: order.quote.id }, data: { status: "accepted" } });
  }
  if (order.stage === "awaiting_acceptance") {
    await prisma.order.update({ where: { id: orderId }, data: { stage: "approved" } });
  }
  await prisma.contact.update({ where: { id: order.contactId }, data: { stage: "customer" } });
  await audit(workspaceId, "quote.accepted", orderId, {});
}

/** Advance one stage along the pipeline; creates a shipment when reaching dispatch. */
export async function advanceOrderStage(workspaceId: string, orderId: string): Promise<OrderStage | null> {
  const order = await loadOrder(workspaceId, orderId);
  const next = nextStage(order.stage);
  if (!next) return null;
  if (next === "dispatched" && !order.shipment) {
    await createOrderShipment(workspaceId, orderId);
  }
  await prisma.order.update({ where: { id: orderId }, data: { stage: next } });
  await audit(workspaceId, "order.stage_changed", orderId, { stage: next });
  return next;
}

export async function setOrderStage(
  workspaceId: string,
  orderId: string,
  stage: OrderStage,
): Promise<boolean> {
  const order = await loadOrder(workspaceId, orderId);
  if (!canTransition(order.stage, stage)) return false;
  await prisma.order.update({ where: { id: orderId }, data: { stage } });
  await audit(workspaceId, "order.stage_changed", orderId, { stage, label: stageLabel(stage) });
  return true;
}

export async function cancelOrder(workspaceId: string, orderId: string): Promise<boolean> {
  return setOrderStage(workspaceId, orderId, "cancelled");
}

/** Create a Shiprocket shipment for an order (mock when unconfigured). */
export async function createOrderShipment(workspaceId: string, orderId: string): Promise<void> {
  const order = await loadOrder(workspaceId, orderId);
  const ship = await createShipment({
    orderId,
    customerName: order.contact.name ?? "Customer",
    customerPhone: order.contact.phones[0],
    quantity: order.quantity,
    amountInr: Math.round(order.totalPaise / 100),
  });
  await prisma.shipment.upsert({
    where: { orderId },
    update: { awb: ship.awb, courier: ship.courier, status: ship.status, trackingUrl: ship.trackingUrl },
    create: {
      workspaceId,
      orderId,
      awb: ship.awb,
      courier: ship.courier,
      status: ship.status,
      trackingUrl: ship.trackingUrl,
    },
  });
  await audit(workspaceId, "shipment.created", orderId, { awb: ship.awb });
}

/** Refresh tracking for an order's shipment. */
export async function refreshTracking(workspaceId: string, orderId: string): Promise<void> {
  const shipment = await prisma.shipment.findFirst({ where: { workspaceId, orderId } });
  if (!shipment?.awb) return;
  const t = await getTracking(shipment.awb);
  await prisma.shipment.update({
    where: { id: shipment.id },
    data: { status: t.status, trackingUrl: t.trackingUrl ?? shipment.trackingUrl, lastPolledAt: new Date() },
  });
}

/** Mark an order paid and generate its GST invoice. */
export async function markOrderPaid(
  workspaceId: string,
  orderId: string,
  paymentRef: string,
): Promise<void> {
  const order = await loadOrder(workspaceId, orderId);
  const qty = order.quantity || 1;
  const totals = {
    subtotalPaise: order.subtotalPaise,
    taxPaise: order.taxPaise,
    totalPaise: order.totalPaise,
    gstPercent: order.subtotalPaise ? Math.round((order.taxPaise / order.subtotalPaise) * 100) : DEFAULT_GST_PERCENT,
  };
  const number = `INV-${order.id.slice(-6).toUpperCase()}`;
  const pdf = await renderDocumentPdf({
    kind: "Tax Invoice",
    number,
    date: new Date(),
    brandName: order.workspace.brandName,
    customerName: order.contact.name ?? order.contact.phones[0] ?? "Customer",
    customerContact: order.contact.phones[0],
    lineLabel: lineLabel(order.config as Record<string, unknown>, qty),
    quantity: qty,
    unitPricePaise: qty ? Math.round(order.subtotalPaise / qty) : 0,
    totals,
    note: `Paid via Razorpay (${paymentRef}).`,
  });
  const url = await putObject(
    `ws/${workspaceId}/invoices/${number}-${randomId("i", 6)}.pdf`,
    pdf,
    "application/pdf",
  );
  await prisma.order.update({
    where: { id: orderId },
    data: { razorpayPaymentId: paymentRef, invoiceUrl: url },
  });
  await prisma.payment.updateMany({
    where: { orderId, workspaceId },
    data: { status: "paid", providerRefId: paymentRef },
  });
  await audit(workspaceId, "order.paid", orderId, { paymentRef });
}

async function audit(workspaceId: string, action: string, orderId: string, meta: object) {
  await prisma.auditEvent.create({
    data: { workspaceId, actor: "system", action, entityType: "order", entityId: orderId, meta },
  });
}
