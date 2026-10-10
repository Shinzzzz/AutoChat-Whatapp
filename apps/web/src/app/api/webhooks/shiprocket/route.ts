import { prisma } from "@autochat/db";
import { SOCKET_EVENTS } from "@autochat/core";
import { parseShiprocketWebhook } from "@autochat/commerce";
import { publishRealtime } from "@autochat/engine";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Shiprocket tracking webhook: updates the shipment status. */
export async function POST(req: Request) {
  const raw = await req.text();
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return new Response("bad request", { status: 400 });
  }
  const { awb, status } = parseShiprocketWebhook(payload);
  if (awb && status) {
    const shipment = await prisma.shipment.findFirst({ where: { awb } });
    if (shipment) {
      await prisma.shipment.update({
        where: { id: shipment.id },
        data: { status, lastPolledAt: new Date() },
      });
      await publishRealtime(shipment.workspaceId, SOCKET_EVENTS.conversationUpdated, {
        orderId: shipment.orderId,
        shipmentStatus: status,
      });
    }
  }
  return new Response("ok", { status: 200 });
}
