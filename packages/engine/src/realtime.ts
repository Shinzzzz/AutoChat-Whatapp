import { getRedis } from "./redis.js";
import type { SocketEvent } from "@autochat/core";

export const REALTIME_CHANNEL = "autochat:events";

export interface RealtimeEnvelope {
  workspaceId: string;
  event: SocketEvent;
  payload: unknown;
}

/** Publish an event for all live dashboards of a workspace (via SSE bridge). */
export async function publishRealtime(
  workspaceId: string,
  event: SocketEvent,
  payload: unknown,
): Promise<void> {
  try {
    const env: RealtimeEnvelope = { workspaceId, event, payload };
    await getRedis().publish(REALTIME_CHANNEL, JSON.stringify(env));
  } catch (e) {
    // Realtime is best-effort; never fail the request because of it.
    console.error("[realtime] publish failed", (e as Error).message);
  }
}
