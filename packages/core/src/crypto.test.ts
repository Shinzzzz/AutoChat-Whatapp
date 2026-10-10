import { describe, it, expect, beforeEach } from "vitest";
import { encryptSecret, decryptSecret, safeEqual, hmacSha256Hex } from "./crypto.js";
import { normalizePhone } from "./ids.js";
import { resetEnvCache } from "./env.js";

beforeEach(() => {
  process.env.NODE_ENV = "test";
  process.env.APP_ENCRYPTION_KEY =
    "1111111111111111111111111111111111111111111111111111111111111111";
  resetEnvCache();
});

describe("crypto", () => {
  it("round-trips a secret", () => {
    const secret = "whatsapp-access-token-xyz";
    const enc = encryptSecret(secret);
    expect(enc).not.toContain(secret);
    expect(decryptSecret(enc)).toBe(secret);
  });

  it("produces different ciphertext each time (random IV)", () => {
    expect(encryptSecret("a")).not.toBe(encryptSecret("a"));
  });

  it("safeEqual compares correctly", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
  });

  it("hmac is stable", () => {
    expect(hmacSha256Hex("s", "body")).toBe(hmacSha256Hex("s", "body"));
  });
});

describe("normalizePhone", () => {
  it("adds +91 to a 10-digit number", () => {
    expect(normalizePhone("83848 03408")).toBe("+918384803408");
  });
  it("keeps an existing +country code", () => {
    expect(normalizePhone("+1 415 555 0000")).toBe("+14155550000");
  });
  it("handles 91-prefixed 12-digit", () => {
    expect(normalizePhone("918384803408")).toBe("+918384803408");
  });
});
