import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  createHmac,
  timingSafeEqual,
} from "node:crypto";
import { getEnv } from "./env.js";

/**
 * AES-256-GCM encryption for per-workspace connector credentials at rest.
 * Ciphertext format (base64): [12-byte iv][16-byte authTag][ciphertext].
 *
 * The master key is APP_ENCRYPTION_KEY (64 hex chars). In development a derived
 * fallback key is used so the app boots, but that is NOT safe for production.
 */
const ALGO = "aes-256-gcm";
const IV_LEN = 12;
const TAG_LEN = 16;

function masterKey(): Buffer {
  const hex = getEnv().APP_ENCRYPTION_KEY;
  if (hex && /^[0-9a-fA-F]{64}$/.test(hex)) {
    return Buffer.from(hex, "hex");
  }
  if (getEnv().NODE_ENV === "production") {
    throw new Error(
      "APP_ENCRYPTION_KEY must be 64 hex chars (32 bytes) in production",
    );
  }
  // Dev fallback: deterministic 32-byte key derived from AUTH_SECRET.
  return createHmac("sha256", "autochat-dev-kdf")
    .update(getEnv().AUTH_SECRET)
    .digest();
}

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, masterKey(), iv);
  const enc = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

export function decryptSecret(payload: string): string {
  const buf = Buffer.from(payload, "base64");
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const enc = buf.subarray(IV_LEN + TAG_LEN);
  const decipher = createDecipheriv(ALGO, masterKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString(
    "utf8",
  );
}

/** Constant-time comparison of two strings (for webhook signature checks). */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/** HMAC-SHA256 hex digest (used by WhatsApp/Razorpay webhook verification). */
export function hmacSha256Hex(secret: string, body: string): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}
