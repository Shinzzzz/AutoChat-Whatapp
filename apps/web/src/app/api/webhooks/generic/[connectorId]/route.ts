import { prisma } from "@autochat/db";
import { webhookProvider } from "@autochat/channels";
import { ingestInbound, resolveConnectorConfig } from "@autochat/engine";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Generic inbound webhook for custom integrations, scoped to a connector id. */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ connectorId: string }> },
) {
  const { connectorId } = await params;
  const connector = await prisma.channelConnector.findFirst({
    where: { id: connectorId, type: "webhook" },
  });
  if (!connector) return new Response("not found", { status: 404 });

  const raw = await req.text();
  const config = resolveConnectorConfig("webhook", connector.encryptedConfig);
  const sig = req.headers.get("x-autochat-signature") ?? undefined;
  if (!webhookProvider.verifySignature(raw, sig, config)) {
    return new Response("invalid signature", { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return new Response("bad request", { status: 400 });
  }
  for (const normalized of webhookProvider.parseInbound(payload)) {
    await ingestInbound({ workspaceId: connector.workspaceId, connectorId: connector.id, normalized });
  }
  return new Response("ok", { status: 200 });
}
