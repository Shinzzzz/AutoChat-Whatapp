import { getEnv, mockFlags, hmacSha256Hex, safeEqual } from "@autochat/core";

export interface CreateLinkArgs {
  amountPaise: number;
  description: string;
  referenceId: string;
  customerName?: string;
  customerContact?: string;
  customerEmail?: string;
  callbackUrl?: string;
}

export interface PaymentLinkResult {
  url: string;
  linkId: string;
  mock: boolean;
}

export interface RazorpayWebhookEvent {
  event: string;
  linkId?: string;
  paymentId?: string;
  status?: string;
  amountPaise?: number;
}

/**
 * Razorpay Payment Links. Live when RAZORPAY_KEY_ID/SECRET are present; otherwise
 * returns a mock link so the flow is demonstrable.
 */
export async function createRazorpayLink(
  args: CreateLinkArgs,
): Promise<PaymentLinkResult> {
  const env = getEnv();
  if (mockFlags(env).razorpay) {
    return {
      url: `${env.PUBLIC_BASE_URL.replace(/\/$/, "")}/pay/mock/${args.referenceId}`,
      linkId: `mock_plink_${args.referenceId}`,
      mock: true,
    };
  }

  const auth = Buffer.from(
    `${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`,
  ).toString("base64");
  const res = await fetch("https://api.razorpay.com/v1/payment_links", {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      amount: args.amountPaise,
      currency: "INR",
      description: args.description,
      reference_id: args.referenceId,
      customer: {
        name: args.customerName,
        contact: args.customerContact,
        email: args.customerEmail,
      },
      notify: { sms: !!args.customerContact, email: !!args.customerEmail },
      reminder_enable: true,
      callback_url: args.callbackUrl,
      callback_method: args.callbackUrl ? "get" : undefined,
    }),
  });
  if (!res.ok) {
    throw new Error(`Razorpay create link failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as { id: string; short_url: string };
  return { url: data.short_url, linkId: data.id, mock: false };
}

/** Verify the X-Razorpay-Signature header over the raw webhook body. */
export function verifyRazorpayWebhook(
  rawBody: string,
  signature: string | undefined,
): boolean {
  const secret = getEnv().RAZORPAY_WEBHOOK_SECRET;
  if (!secret) return true; // mock/dev: accept
  if (!signature) return false;
  return safeEqual(signature, hmacSha256Hex(secret, rawBody));
}

export function parseRazorpayWebhook(payload: unknown): RazorpayWebhookEvent {
  const b = payload as {
    event?: string;
    payload?: {
      payment_link?: { entity?: { id?: string; status?: string; amount?: number } };
      payment?: { entity?: { id?: string } };
    };
  };
  const link = b.payload?.payment_link?.entity;
  const payment = b.payload?.payment?.entity;
  return {
    event: b.event ?? "",
    linkId: link?.id,
    paymentId: payment?.id,
    status: link?.status,
    amountPaise: link?.amount,
  };
}
