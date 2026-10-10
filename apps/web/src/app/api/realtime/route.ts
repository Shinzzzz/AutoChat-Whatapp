import { newRedis, REALTIME_CHANNEL, type RealtimeEnvelope } from "@autochat/engine";
import { apiSession } from "../../../lib/api.js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Server-Sent Events stream of realtime events for the signed-in workspace.
 * The pipeline publishes envelopes to a Redis channel; we relay the ones for
 * this workspace to the browser. (Chosen over websockets so the app deploys as
 * a standard Next server with no custom server process.)
 */
export async function GET() {
  const session = await apiSession();
  if (!session) return new Response("unauthorized", { status: 401 });

  const sub = newRedis();
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: string) => controller.enqueue(encoder.encode(data));
      send(`: connected\n\n`);

      const heartbeat = setInterval(() => {
        try {
          send(`: ping\n\n`);
        } catch {
          /* closed */
        }
      }, 25000);

      sub.on("message", (_channel, raw) => {
        try {
          const env = JSON.parse(raw) as RealtimeEnvelope;
          if (env.workspaceId !== session.workspaceId) return;
          send(`event: ${env.event}\ndata: ${JSON.stringify(env.payload)}\n\n`);
        } catch {
          /* ignore malformed */
        }
      });
      await sub.subscribe(REALTIME_CHANNEL);

      // Clean up when the client disconnects.
      (controller as unknown as { _cleanup?: () => void })._cleanup = () => {
        clearInterval(heartbeat);
        sub.quit().catch(() => {});
      };
    },
    cancel() {
      sub.quit().catch(() => {});
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  });
}
