import {
  hmacSha256Hex,
  safeEqual,
  type NormalizedInbound,
  type OutboundMessage,
  type SendResult,
  type MediaRef,
} from "@autochat/core";
import type { ChannelConfig, ChannelProvider, WebhookVerification } from "./types.js";

const GRAPH_VERSION = "v21.0";

/** Instagram Messaging (Meta). Same webhook handshake + signature scheme as WhatsApp. */
export class InstagramProvider implements ChannelProvider {
  readonly type = "instagram" as const;

  verifyWebhookChallenge(
    query: Record<string, string | undefined>,
    config: ChannelConfig,
  ): WebhookVerification {
    const expected = config.verifyToken ?? "autochat-verify";
    if (
      query["hub.mode"] === "subscribe" &&
      query["hub.verify_token"] &&
      safeEqual(query["hub.verify_token"], expected)
    ) {
      return { ok: true, challenge: query["hub.challenge"] };
    }
    return { ok: false };
  }

  verifySignature(
    rawBody: string,
    signatureHeader: string | undefined,
    config: ChannelConfig,
  ): boolean {
    if (!config.appSecret) return true;
    if (!signatureHeader) return false;
    return safeEqual(signatureHeader, `sha256=${hmacSha256Hex(config.appSecret, rawBody)}`);
  }

  parseInbound(payload: unknown): NormalizedInbound[] {
    const out: NormalizedInbound[] = [];
    const body = payload as IgWebhookBody;
    if (!body || body.object !== "instagram") return out;
    for (const entry of body.entry ?? []) {
      for (const m of entry.messaging ?? []) {
        if (!m.message) continue;
        const media: MediaRef[] = (m.message.attachments ?? [])
          .filter((a) => a.type === "image" && a.payload?.url)
          .map((a) => ({ type: "image" as const, url: a.payload!.url! }));
        out.push({
          channel: "instagram",
          externalContactId: m.sender.id,
          contactHandle: m.sender.id,
          providerMessageId: m.message.mid,
          text: m.message.text,
          media,
          timestamp: m.timestamp || Date.now(),
          raw: m,
        });
      }
    }
    return out;
  }

  async send(
    to: string,
    message: OutboundMessage,
    config: ChannelConfig,
  ): Promise<SendResult> {
    if (!(config.igId && config.accessToken)) {
      return { providerMessageId: `mock_ig_${Date.now()}`, status: "sent", mock: true };
    }
    try {
      const res = await fetch(
        `https://graph.facebook.com/${GRAPH_VERSION}/${config.igId}/messages`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${config.accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ recipient: { id: to }, message: { text: message.text ?? "" } }),
        },
      );
      if (!res.ok) return { status: "failed", error: `IG API ${res.status}: ${await res.text()}` };
      const data = (await res.json()) as { message_id?: string };
      return { providerMessageId: data.message_id, status: "sent" };
    } catch (err) {
      return { status: "failed", error: err instanceof Error ? err.message : String(err) };
    }
  }
}

interface IgWebhookBody {
  object?: string;
  entry?: {
    id: string;
    messaging?: {
      sender: { id: string };
      recipient?: { id: string };
      timestamp?: number;
      message?: {
        mid: string;
        text?: string;
        attachments?: { type?: string; payload?: { url?: string } }[];
      };
    }[];
  }[];
}

export const instagramProvider = new InstagramProvider();
