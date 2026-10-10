import { prisma } from "@autochat/db";
import { SOCKET_EVENTS } from "@autochat/core";
import { verifyRazorpayWebhook, parseRazorpayWebhook, markOrderPaid } from "@autochat/commerce";
import { publishRealtime } from "@autochat/engine";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Razorpay payment-link webhook: marks the order paid + issues the invoice. */
export async function POST(req: Request) {
  const raw = await req.text();
  const sig = req.headers.get("x-razorpay-signature") ?? undefined;
  if (!verifyRazorpayWebhook(raw, sig)) {
    return new Response("invalid signature", { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return new Response("bad request", { status: 400 });
  }
  const evt = parseRazorpayWebhook(payload);

  // Resolve the order by the payment link id we stored.
  if (evt.linkId && (evt.status === "paid" || evt.event.includes("paid"))) {
    const order = await prisma.order.findFirst({ where: { razorpayLinkId: evt.linkId } });
    if (order) {
      await markOrderPaid(order.workspaceId, order.id, evt.paymentId ?? evt.linkId);
      await publishRealtime(order.workspaceId, SOCKET_EVENTS.conversationUpdated, {
        orderId: order.id,
        paid: true,
      });
    }
  }
  return new Response("ok", { status: 200 });
}
