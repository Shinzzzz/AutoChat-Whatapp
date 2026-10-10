import { describe, it, expect } from "vitest";
import { whatsappProvider } from "./whatsapp.js";
import { hmacSha256Hex } from "@autochat/core";

const sampleBody = {
  object: "whatsapp_business_account",
  entry: [
    {
      id: "WABA_ID",
      changes: [
        {
          field: "messages",
          value: {
            messaging_product: "whatsapp",
            metadata: { phone_number_id: "PN_ID" },
            contacts: [{ profile: { name: "Ravi Shah" }, wa_id: "918384803408" }],
            messages: [
              {
                from: "918384803408",
                id: "wamid.ABC123",
                timestamp: "1700000000",
                type: "text",
                text: { body: "I want 1000 branded 500ml glass bottles" },
              },
            ],
          },
        },
      ],
    },
  ],
};

describe("WhatsAppProvider.parseInbound", () => {
  it("normalizes a text message", () => {
    const msgs = whatsappProvider.parseInbound(sampleBody);
    expect(msgs).toHaveLength(1);
    const m = msgs[0]!;
    expect(m.channel).toBe("whatsapp");
    expect(m.contactName).toBe("Ravi Shah");
    expect(m.contactPhone).toBe("+918384803408");
    expect(m.text).toContain("500ml glass");
    expect(m.providerMessageId).toBe("wamid.ABC123");
    expect(m.timestamp).toBe(1700000000 * 1000);
  });

  it("ignores non-whatsapp payloads", () => {
    expect(whatsappProvider.parseInbound({ object: "page" })).toHaveLength(0);
  });

  it("extracts image media with a storage id", () => {
    const body = {
      object: "whatsapp_business_account",
      entry: [
        {
          id: "x",
          changes: [
            {
              field: "messages",
              value: {
                messages: [
                  {
                    from: "911111111111",
                    id: "wamid.IMG",
                    timestamp: "1700000001",
                    type: "image",
                    image: { id: "media-123", mime_type: "image/jpeg", caption: "see this" },
                  },
                ],
              },
            },
          ],
        },
      ],
    };
    const [m] = whatsappProvider.parseInbound(body);
    expect(m!.media[0]).toMatchObject({ type: "image", storageKey: "media-123" });
    expect(m!.text).toBe("see this");
  });
});

describe("WhatsAppProvider.verifyWebhookChallenge", () => {
  it("echoes the challenge when the verify token matches", () => {
    const res = whatsappProvider.verifyWebhookChallenge(
      { "hub.mode": "subscribe", "hub.verify_token": "tok", "hub.challenge": "42" },
      { verifyToken: "tok" },
    );
    expect(res.ok).toBe(true);
    expect(res.challenge).toBe("42");
  });

  it("rejects a wrong token", () => {
    const res = whatsappProvider.verifyWebhookChallenge(
      { "hub.mode": "subscribe", "hub.verify_token": "nope", "hub.challenge": "42" },
      { verifyToken: "tok" },
    );
    expect(res.ok).toBe(false);
  });
});

describe("WhatsAppProvider.verifySignature", () => {
  it("accepts a correct sha256 signature", () => {
    const body = JSON.stringify(sampleBody);
    const sig = `sha256=${hmacSha256Hex("secret", body)}`;
    expect(whatsappProvider.verifySignature(body, sig, { appSecret: "secret" })).toBe(true);
  });
  it("rejects a bad signature", () => {
    expect(
      whatsappProvider.verifySignature("{}", "sha256=deadbeef", { appSecret: "secret" }),
    ).toBe(false);
  });
  it("accepts when no app secret is configured (dev/mock)", () => {
    expect(whatsappProvider.verifySignature("{}", undefined, {})).toBe(true);
  });
});

describe("WhatsAppProvider.send (mock mode)", () => {
  it("returns a mock message id when unconfigured", async () => {
    const res = await whatsappProvider.send("+918384803408", { text: "hi" }, {});
    expect(res.mock).toBe(true);
    expect(res.status).toBe("sent");
    expect(res.providerMessageId).toMatch(/^mock_wamid_/);
  });
});
