import { describe, it, expect } from "vitest";
import { instagramProvider } from "./instagram.js";
import { webhookProvider } from "./webhook.js";
import { emailProvider } from "./email.js";
import { hmacSha256Hex } from "@autochat/core";

describe("InstagramProvider.parseInbound", () => {
  it("normalizes an IG DM", () => {
    const body = {
      object: "instagram",
      entry: [
        {
          id: "IG_ID",
          messaging: [
            { sender: { id: "user-123" }, recipient: { id: "IG_ID" }, timestamp: 1700000000000, message: { mid: "m1", text: "do you ship to Pune?" } },
          ],
        },
      ],
    };
    const [m] = instagramProvider.parseInbound(body);
    expect(m!.channel).toBe("instagram");
    expect(m!.externalContactId).toBe("user-123");
    expect(m!.text).toContain("Pune");
    expect(m!.providerMessageId).toBe("m1");
  });
  it("ignores non-instagram payloads", () => {
    expect(instagramProvider.parseInbound({ object: "page" })).toHaveLength(0);
  });
});

describe("WebhookProvider", () => {
  it("parses a generic inbound and detects phone", () => {
    const [m] = webhookProvider.parseInbound({ from: "+919812345678", name: "Asha", text: "price?" });
    expect(m!.channel).toBe("webhook");
    expect(m!.contactPhone).toBe("+919812345678");
    expect(m!.text).toBe("price?");
  });
  it("verifies the HMAC signature", () => {
    const body = JSON.stringify({ from: "x", text: "y" });
    const sig = hmacSha256Hex("sek", body);
    expect(webhookProvider.verifySignature(body, sig, { secret: "sek" })).toBe(true);
    expect(webhookProvider.verifySignature(body, "bad", { secret: "sek" })).toBe(false);
  });
});

describe("EmailProvider.parseInbound", () => {
  it("parses a direct JSON email", () => {
    const [m] = emailProvider.parseInbound({ from: "lead@acme.com", subject: "Bulk order", text: "need 10000 bottles" });
    expect(m!.channel).toBe("email");
    expect(m!.contactEmail).toBe("lead@acme.com");
    expect(m!.text).toContain("10000");
  });
  it("unwraps an SNS notification envelope", () => {
    const inner = JSON.stringify({ from: "x@y.com", text: "hello" });
    const [m] = emailProvider.parseInbound({ Type: "Notification", Message: inner });
    expect(m!.contactEmail).toBe("x@y.com");
  });
  it("mock send returns a mock id", async () => {
    const r = await emailProvider.send("x@y.com", { text: "hi" }, {});
    expect(r.mock).toBe(true);
  });
});
