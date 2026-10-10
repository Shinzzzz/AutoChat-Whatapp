import {
  getEnv,
  mockFlags,
  type NormalizedInbound,
  type OutboundMessage,
  type SendResult,
} from "@autochat/core";
import type { ChannelConfig, ChannelProvider, WebhookVerification } from "./types.js";

/**
 * Email channel. Outbound via AWS SES v2; inbound via an SES→SNS notification
 * posted to our webhook (or a plain JSON {from,name?,subject?,text,messageId}).
 * Mock send when SES is unconfigured.
 */
export class EmailProvider implements ChannelProvider {
  readonly type = "email" as const;

  verifyWebhookChallenge(): WebhookVerification {
    return { ok: true };
  }

  verifySignature(): boolean {
    // SNS messages are verified by subscription confirmation + topic ARN in the route.
    return true;
  }

  parseInbound(payload: unknown): NormalizedInbound[] {
    let body = payload as Record<string, unknown>;
    // Unwrap an SNS envelope if present.
    if (body?.Type === "Notification" && typeof body.Message === "string") {
      try {
        body = JSON.parse(body.Message) as Record<string, unknown>;
      } catch {
        return [];
      }
    }
    const from = (body.from ?? body.source) as string | undefined;
    if (!from) return [];
    return [
      {
        channel: "email",
        externalContactId: from,
        contactEmail: from,
        contactName: (body.name as string) ?? undefined,
        providerMessageId: (body.messageId as string) ?? `email_${Date.now()}`,
        text:
          (body.text as string) ??
          [(body.subject as string) ? `Subject: ${body.subject}` : "", body.body as string]
            .filter(Boolean)
            .join("\n"),
        media: [],
        timestamp: Date.now(),
        raw: body,
      },
    ];
  }

  async send(
    to: string,
    message: OutboundMessage,
    config: ChannelConfig,
  ): Promise<SendResult> {
    const env = getEnv();
    const from = config.fromEmail ?? env.SES_FROM_EMAIL;
    if (mockFlags(env).email || !from) {
      return { providerMessageId: `mock_email_${Date.now()}`, status: "sent", mock: true };
    }
    try {
      const { SESv2Client, SendEmailCommand } = await import("@aws-sdk/client-sesv2");
      const client = new SESv2Client({ region: env.AWS_REGION });
      const res = await client.send(
        new SendEmailCommand({
          FromEmailAddress: from,
          Destination: { ToAddresses: [to] },
          Content: {
            Simple: {
              Subject: { Data: config.subject ?? "Re: your enquiry" },
              Body: { Text: { Data: message.text ?? "" } },
            },
          },
        }),
      );
      return { providerMessageId: res.MessageId, status: "sent" };
    } catch (err) {
      return { status: "failed", error: err instanceof Error ? err.message : String(err) };
    }
  }
}

export const emailProvider = new EmailProvider();
