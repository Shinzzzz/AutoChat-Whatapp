import { prisma } from "@autochat/db";
import { whatsappProvider } from "@autochat/channels";
import { ingestInbound, resolveConnectorConfig } from "@autochat/engine";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Meta subscription handshake. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const query = Object.fromEntries(url.searchParams.entries());
  const result = whatsappProvider.verifyWebhookChallenge(query, {
    verifyToken: process.env.WHATSAPP_VERIFY_TOKEN,
  });
  if (result.ok) {
    return new Response(result.challenge ?? "", { status: 200 });
  }
  return new Response("forbidden", { status: 403 });
}

/** Inbound messages + delivery receipts. */
export async function POST(req: Request) {
  const raw = await req.text();
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return new Response("bad request", { status: 400 });
  }

  const phoneNumberId = extractPhoneNumberId(payload);
  const connector = await findConnector(phoneNumberId);
  if (!connector) {
    // Nothing is configured to receive this; ack so Meta stops retrying.
    return new Response("ok", { status: 200 });
  }

  const config = resolveConnectorConfig("whatsapp", connector.encryptedConfig);
  const sig = req.headers.get("x-hub-signature-256") ?? undefined;
  if (!whatsappProvider.verifySignature(raw, sig, config)) {
    return new Response("invalid signature", { status: 401 });
  }

  const inbound = whatsappProvider.parseInbound(payload);
  for (const normalized of inbound) {
    await ingestInbound({
      workspaceId: connector.workspaceId,
      connectorId: connector.id,
      normalized,
    });
  }
  return new Response("ok", { status: 200 });
}

function extractPhoneNumberId(payload: unknown): string | undefined {
  const b = payload as {
    entry?: { changes?: { value?: { metadata?: { phone_number_id?: string } } }[] }[];
  };
  for (const e of b.entry ?? []) {
    for (const c of e.changes ?? []) {
      const id = c.value?.metadata?.phone_number_id;
      if (id) return id;
    }
  }
  return undefined;
}

/** Route to the connector whose resolved phoneNumberId matches; fall back to the
 *  single configured WhatsApp connector in dev. */
async function findConnector(phoneNumberId?: string) {
  const connectors = await prisma.channelConnector.findMany({
    where: { type: "whatsapp" },
  });
  if (phoneNumberId) {
    for (const c of connectors) {
      const cfg = resolveConnectorConfig("whatsapp", c.encryptedConfig);
      if (cfg.phoneNumberId === phoneNumberId) return c;
    }
  }
  return connectors.length === 1 ? connectors[0] : null;
}
