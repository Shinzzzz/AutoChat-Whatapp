import { prisma } from "@autochat/db";
import { instagramProvider } from "@autochat/channels";
import { ingestInbound, resolveConnectorConfig } from "@autochat/engine";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const query = Object.fromEntries(url.searchParams.entries());
  // Verify against any configured instagram connector's token (or the env default).
  const connectors = await prisma.channelConnector.findMany({ where: { type: "instagram" } });
  for (const c of connectors) {
    const cfg = resolveConnectorConfig("instagram", c.encryptedConfig);
    const r = instagramProvider.verifyWebhookChallenge(query, cfg);
    if (r.ok) return new Response(r.challenge ?? "", { status: 200 });
  }
  const r = instagramProvider.verifyWebhookChallenge(query, {
    verifyToken: process.env.WHATSAPP_VERIFY_TOKEN,
  });
  return r.ok ? new Response(r.challenge ?? "", { status: 200 }) : new Response("forbidden", { status: 403 });
}

export async function POST(req: Request) {
  const raw = await req.text();
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return new Response("bad request", { status: 400 });
  }
  const connectors = await prisma.channelConnector.findMany({ where: { type: "instagram" } });
  const connector = connectors.length === 1 ? connectors[0] : connectors[0];
  if (!connector) return new Response("ok", { status: 200 });

  const config = resolveConnectorConfig("instagram", connector.encryptedConfig);
  const sig = req.headers.get("x-hub-signature-256") ?? undefined;
  if (!instagramProvider.verifySignature(raw, sig, config)) {
    return new Response("invalid signature", { status: 401 });
  }
  for (const normalized of instagramProvider.parseInbound(payload)) {
    await ingestInbound({ workspaceId: connector.workspaceId, connectorId: connector.id, normalized });
  }
  return new Response("ok", { status: 200 });
}
