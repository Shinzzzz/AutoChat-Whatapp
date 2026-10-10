import { randomBytes } from "node:crypto";

/**
 * Short, URL-safe, sortable-ish ids with a type prefix (e.g. `msg_a1b2c3...`).
 * Not a dependency on any library; good enough for internal identifiers while
 * primary keys remain cuid/uuid in Prisma.
 */
const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";

export function randomId(prefix: string, size = 16): string {
  const bytes = randomBytes(size);
  let out = "";
  for (let i = 0; i < size; i++) {
    out += ALPHABET[bytes[i]! % ALPHABET.length];
  }
  return `${prefix}_${out}`;
}

/** Normalize an Indian phone number to E.164 best-effort (+91...). */
export function normalizePhone(input: string): string {
  const digits = input.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) return digits;
  const bare = digits.replace(/^0+/, "");
  if (bare.length === 10) return `+91${bare}`;
  if (bare.length === 12 && bare.startsWith("91")) return `+${bare}`;
  return `+${bare}`;
}
