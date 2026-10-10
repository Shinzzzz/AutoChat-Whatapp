/**
 * Channel-agnostic domain types shared across packages. These mirror the Prisma
 * enums/models but live here so non-db packages (channels, ai, commerce) don't
 * need to import the generated Prisma client.
 */

export type ChannelType =
  | "whatsapp"
  | "instagram"
  | "email"
  | "webhook"
  | "voice"; // voice ships in a later milestone

export type ConnectorStatus =
  | "connected"
  | "disconnected"
  | "error"
  | "token_expiring"
  | "coming_soon";

export type MessageDirection = "inbound" | "outbound";

/** Who authored a message within a conversation. */
export type MessageSender = "contact" | "ai" | "human" | "system";

export type MessageContentType = "text" | "image" | "file" | "audio" | "video";

export type DeliveryStatus =
  | "pending"
  | "sent"
  | "delivered"
  | "read"
  | "failed";

export type ConversationStatus =
  | "open" // waiting / in progress
  | "ai_handling" // the AI is actively driving
  | "needs_human" // escalated, waiting for an operator
  | "snoozed"
  | "closed";

/** CRM pipeline stages for a contact/lead. */
export type ContactStage =
  | "lead"
  | "qualified"
  | "quoted"
  | "customer"
  | "repeat"
  | "lost";

/** AquaMedia order lifecycle. */
export type OrderStage =
  | "awaiting_review"
  | "awaiting_acceptance"
  | "approved"
  | "design_review"
  | "in_production"
  | "dispatched"
  | "delivered"
  | "cancelled";

export const ORDER_STAGES: OrderStage[] = [
  "awaiting_review",
  "awaiting_acceptance",
  "approved",
  "design_review",
  "in_production",
  "dispatched",
  "delivered",
];

/** A media attachment on a message, stored by reference (S3 key or local path). */
export interface MediaRef {
  type: MessageContentType;
  url: string; // signed/public URL for display
  storageKey?: string; // backing object key
  mimeType?: string;
  caption?: string;
}

/**
 * The normalized inbound message every ChannelProvider produces from its
 * provider-specific webhook payload.
 */
export interface NormalizedInbound {
  channel: ChannelType;
  /** Stable per-channel identity of the sender (phone e164, IG id, email...). */
  externalContactId: string;
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
  contactHandle?: string;
  /** Provider's message id, for dedupe + delivery receipts. */
  providerMessageId: string;
  text?: string;
  media: MediaRef[];
  /** Epoch ms when the sender sent it. */
  timestamp: number;
  /** Raw payload kept for debugging/audit. */
  raw?: unknown;
}

/** What a ChannelProvider needs in order to send a reply out. */
export interface OutboundMessage {
  text?: string;
  media?: MediaRef[];
  /** For WhatsApp outside the 24h window: an approved template. */
  template?: { name: string; language: string; variables?: string[] };
}

export interface SendResult {
  providerMessageId?: string;
  status: DeliveryStatus;
  error?: string;
  mock?: boolean;
}
