import { prisma } from "@autochat/db";
import { randomId, normalizePhone, type NormalizedInbound } from "@autochat/core";
import { ingestInbound } from "@autochat/engine";
import { apiSession, json, unauthorized } from "../../../../lib/api.js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Dev helper: simulate an inbound WhatsApp message so the full pipeline
 * (ingest → AI → reply) can be demonstrated without a live number. Signed-in
 * users only; the inbox updates in real time as the AI responds.
 */
export async function POST(req: Request) {
  const session = await apiSession();
  if (!session) return unauthorized();

  const body = (await req.json().catch(() => ({}))) as {
    text?: string;
    phone?: string;
    name?: string;
  };
  const text = (body.text ?? "").trim();
  if (!text) return json({ error: "text required" }, 400);

  const phone = normalizePhone(body.phone || "+918384803408");
  const connector = await prisma.channelConnector.findFirst({
    where: { workspaceId: session.workspaceId, type: "whatsapp" },
  });

  const normalized: NormalizedInbound = {
    channel: "whatsapp",
    externalContactId: phone.replace("+", ""),
    contactName: body.name || "Test Customer",
    contactPhone: phone,
    providerMessageId: randomId("sim"),
    text,
    media: [],
    timestamp: Date.now(),
  };

  const result = await ingestInbound({
    workspaceId: session.workspaceId,
    connectorId: connector?.id,
    normalized,
  });
  return json({ ok: true, conversationId: result?.conversationId });
}
