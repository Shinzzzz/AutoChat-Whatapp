import type {
  ChannelType,
  NormalizedInbound,
  OutboundMessage,
  SendResult,
} from "@autochat/core";

/** Per-connector credentials/config (decrypted at the call site). */
export type ChannelConfig = Record<string, string | undefined>;

export interface WebhookVerification {
  ok: boolean;
  /** For GET verification handshakes (e.g. Meta hub.challenge echo). */
  challenge?: string;
}

/**
 * A ChannelProvider adapts one messaging channel to AutoChat's normalized model.
 * Implementations are pure/stateless; credentials are passed in per call.
 */
export interface ChannelProvider {
  readonly type: ChannelType;

  /** Verify a GET subscription handshake (query params). */
  verifyWebhookChallenge(
    query: Record<string, string | undefined>,
    config: ChannelConfig,
  ): WebhookVerification;

  /** Verify an inbound POST's signature against the raw body. */
  verifySignature(
    rawBody: string,
    signatureHeader: string | undefined,
    config: ChannelConfig,
  ): boolean;

  /** Turn a provider webhook payload into normalized inbound messages. */
  parseInbound(payload: unknown): NormalizedInbound[];

  /** Send a reply out through the channel. Falls back to mock if unconfigured. */
  send(
    to: string,
    message: OutboundMessage,
    config: ChannelConfig,
  ): Promise<SendResult>;
}
