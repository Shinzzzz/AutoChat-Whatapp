import { prisma } from "@autochat/db";
import { emailProvider } from "@autochat/channels";
import { ingestInbound } from "@autochat/engine";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Inbound email via SES→SNS (handles the SNS subscription handshake too). */
export async function POST(req: Request) {
  const raw = await req.text();
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return new Response("bad request", { status: 400 });
  }

  // Confirm an SNS subscription on first contact.
  if (payload.Type === "SubscriptionConfirmation" && typeof payload.SubscribeURL === "string") {
    try {
      await fetch(payload.SubscribeURL);
    } catch {
      /* best effort */
    }
    return new Response("ok", { status: 200 });
  }

  const connector = await prisma.channelConnector.findFirst({ where: { type: "email" } });
  if (!connector) return new Response("ok", { status: 200 });

  for (const normalized of emailProvider.parseInbound(payload)) {
    await ingestInbound({ workspaceId: connector.workspaceId, connectorId: connector.id, normalized });
  }
  return new Response("ok", { status: 200 });
}
