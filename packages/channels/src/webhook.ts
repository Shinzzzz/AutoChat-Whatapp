import {
  hmacSha256Hex,
  safeEqual,
  type NormalizedInbound,
  type OutboundMessage,
  type SendResult,
} from "@autochat/core";
import type { ChannelConfig, ChannelProvider, WebhookVerification } from "./types.js";

/**
 * Generic webhook channel for custom integrations ("others as well"). Inbound
 * payload: { from, name?, text, messageId? }. Signature: HMAC-SHA256 of the raw
 * body with the connector's shared secret, in the `x-autochat-signature` header.
 * Outbound: POST { to, text } to a configured URL (mock if none).
 */
export class WebhookProvider implements ChannelProvider {
  readonly type = "webhook" as const;

  verifyWebhookChallenge(query: Record<string, string | undefined>): WebhookVerification {
    return { ok: true, challenge: query["challenge"] };
  }

  verifySignature(
    rawBody: string,
    signatureHeader: string | undefined,
    config: ChannelConfig,
  ): boolean {
    if (!config.secret) return true;
    if (!signatureHeader) return false;
    return safeEqual(signatureHeader, hmacSha256Hex(config.secret, rawBody));
  }

  parseInbound(payload: unknown): NormalizedInbound[] {
    const b = payload as {
      from?: string;
      name?: string;
      text?: string;
      messageId?: string;
    };
    if (!b?.from || !b.text) return [];
    return [
      {
        channel: "webhook",
        externalContactId: b.from,
        contactName: b.name,
        contactPhone: /^\+?\d{6,}$/.test(b.from) ? b.from : undefined,
        contactEmail: b.from.includes("@") ? b.from : undefined,
        providerMessageId: b.messageId ?? `wh_${Date.now()}`,
        text: b.text,
        media: [],
        timestamp: Date.now(),
        raw: b,
      },
    ];
  }

  async send(
    to: string,
    message: OutboundMessage,
    config: ChannelConfig,
  ): Promise<SendResult> {
    if (!config.outboundUrl) {
      return { providerMessageId: `mock_wh_${Date.now()}`, status: "sent", mock: true };
    }
    try {
      const body = JSON.stringify({ to, text: message.text ?? "" });
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (config.secret) headers["x-autochat-signature"] = hmacSha256Hex(config.secret, body);
      const res = await fetch(config.outboundUrl, { method: "POST", headers, body });
      return res.ok
        ? { status: "sent" }
        : { status: "failed", error: `webhook ${res.status}` };
    } catch (err) {
      return { status: "failed", error: err instanceof Error ? err.message : String(err) };
    }
  }
}

export const webhookProvider = new WebhookProvider();
