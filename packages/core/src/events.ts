/**
 * Realtime + queue event contracts. The web app and worker speak these names
 * over Redis (Socket.IO pub/sub + BullMQ). Keeping them here prevents drift.
 */

/** BullMQ queue names. */
export const QUEUES = {
  aiRun: "ai-run",
  outbound: "outbound-send",
  campaign: "campaign-drip",
  tracking: "tracking-poll",
  screenshot: "screenshot-import",
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

/** Job payloads. */
export interface AiRunJob {
  workspaceId: string;
  conversationId: string;
  /** The message that triggered this run (for idempotency/logging). */
  triggerMessageId: string;
}

export interface OutboundSendJob {
  workspaceId: string;
  conversationId: string;
  messageId: string;
}

export interface ScreenshotImportJob {
  workspaceId: string;
  importId: string;
}

/**
 * Socket.IO room naming: clients join `ws:<workspaceId>` and receive these
 * events. Payloads are intentionally small; the client refetches detail.
 */
export const socketRoom = (workspaceId: string) => `ws:${workspaceId}`;

export const SOCKET_EVENTS = {
  messageCreated: "message.created",
  conversationUpdated: "conversation.updated",
  connectorStatus: "connector.status",
  dashboardStats: "dashboard.stats",
} as const;

export type SocketEvent = (typeof SOCKET_EVENTS)[keyof typeof SOCKET_EVENTS];
