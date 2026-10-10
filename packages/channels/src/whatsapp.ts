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

/** Whether this config has enough to talk to the real Graph API. */
function isLive(config: ChannelConfig): boolean {
  return Boolean(config.phoneNumberId && config.accessToken);
}

export class WhatsAppProvider implements ChannelProvider {
  readonly type = "whatsapp" as const;

  verifyWebhookChallenge(
    query: Record<string, string | undefined>,
    config: ChannelConfig,
  ): WebhookVerification {
    const mode = query["hub.mode"];
    const token = query["hub.verify_token"];
    const challenge = query["hub.challenge"];
    const expected = config.verifyToken ?? "autochat-verify";
    if (mode === "subscribe" && token && safeEqual(token, expected)) {
      return { ok: true, challenge };
    }
    return { ok: false };
  }

  verifySignature(
    rawBody: string,
    signatureHeader: string | undefined,
    config: ChannelConfig,
  ): boolean {
    // If no app secret is configured (mock/dev), accept.
    if (!config.appSecret) return true;
    if (!signatureHeader) return false;
    const expected = `sha256=${hmacSha256Hex(config.appSecret, rawBody)}`;
    return safeEqual(signatureHeader, expected);
  }

  parseInbound(payload: unknown): NormalizedInbound[] {
    const out: NormalizedInbound[] = [];
    const body = payload as WaWebhookBody;
    if (!body || body.object !== "whatsapp_business_account") return out;

    for (const entry of body.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const value = change.value;
        if (!value?.messages) continue;
        const contactName = value.contacts?.[0]?.profile?.name;
        for (const msg of value.messages) {
          const media: MediaRef[] = [];
          let text: string | undefined;
          switch (msg.type) {
            case "text":
              text = msg.text?.body;
              break;
            case "image":
              if (msg.image)
                media.push({
                  type: "image",
                  url: "", // resolved later via the media id + Graph API
                  storageKey: msg.image.id,
                  mimeType: msg.image.mime_type,
                  caption: msg.image.caption,
                });
              text = msg.image?.caption;
              break;
            case "audio":
              if (msg.audio)
                media.push({
                  type: "audio",
                  url: "",
                  storageKey: msg.audio.id,
                  mimeType: msg.audio.mime_type,
                });
              break;
            case "document":
              if (msg.document)
                media.push({
                  type: "file",
                  url: "",
                  storageKey: msg.document.id,
                  mimeType: msg.document.mime_type,
                  caption: msg.document.filename,
                });
              break;
            default:
              text = `[unsupported message type: ${msg.type}]`;
          }

          out.push({
            channel: "whatsapp",
            externalContactId: msg.from,
            contactName,
            contactPhone: `+${msg.from.replace(/^\+/, "")}`,
            providerMessageId: msg.id,
            text,
            media,
            timestamp: Number(msg.timestamp) * 1000 || Date.now(),
            raw: msg,
          });
        }
      }
    }
    return out;
  }

  async send(
    to: string,
    message: OutboundMessage,
    config: ChannelConfig,
  ): Promise<SendResult> {
    if (!isLive(config)) {
      // Mock mode: pretend the send succeeded so flows are demonstrable.
      return {
        providerMessageId: `mock_wamid_${Date.now()}`,
        status: "sent",
        mock: true,
      };
    }

    const url = `https://graph.facebook.com/${GRAPH_VERSION}/${config.phoneNumberId}/messages`;
    const payload = buildOutboundPayload(to, message);

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const errText = await res.text();
        return { status: "failed", error: `WhatsApp API ${res.status}: ${errText}` };
      }
      const data = (await res.json()) as {
        messages?: { id: string }[];
      };
      return {
        providerMessageId: data.messages?.[0]?.id,
        status: "sent",
      };
    } catch (err) {
      return {
        status: "failed",
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}

function buildOutboundPayload(to: string, message: OutboundMessage) {
  const recipient = to.replace(/^\+/, "");
  if (message.template) {
    return {
      messaging_product: "whatsapp",
      to: recipient,
      type: "template",
      template: {
        name: message.template.name,
        language: { code: message.template.language },
        ...(message.template.variables?.length
          ? {
              components: [
                {
                  type: "body",
                  parameters: message.template.variables.map((v) => ({
                    type: "text",
                    text: v,
                  })),
                },
              ],
            }
          : {}),
      },
    };
  }
  const firstMedia = message.media?.[0];
  if (firstMedia && firstMedia.type === "image") {
    return {
      messaging_product: "whatsapp",
      to: recipient,
      type: "image",
      image: { link: firstMedia.url, caption: message.text ?? firstMedia.caption },
    };
  }
  return {
    messaging_product: "whatsapp",
    to: recipient,
    type: "text",
    text: { preview_url: true, body: message.text ?? "" },
  };
}

// ── Minimal typing of the WhatsApp Cloud API webhook payload ──
interface WaWebhookBody {
  object?: string;
  entry?: {
    id: string;
    changes?: {
      field?: string;
      value?: {
        messaging_product?: string;
        metadata?: { phone_number_id?: string };
        contacts?: { profile?: { name?: string }; wa_id?: string }[];
        messages?: WaMessage[];
      };
    }[];
  }[];
}

interface WaMessage {
  from: string;
  id: string;
  timestamp: string;
  type: string;
  text?: { body?: string };
  image?: { id: string; mime_type?: string; caption?: string };
  audio?: { id: string; mime_type?: string };
  document?: { id: string; mime_type?: string; filename?: string };
}

export const whatsappProvider = new WhatsAppProvider();
