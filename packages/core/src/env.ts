import { z } from "zod";

/**
 * Central environment schema. Integration credentials are all optional: when a
 * credential is missing the corresponding integration falls back to MOCK mode
 * (see `isMock`), so the app boots and the end-to-end flow is demonstrable
 * before any real account is wired up.
 */
const EnvSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PUBLIC_BASE_URL: z.string().url().default("http://localhost:3000"),

  DATABASE_URL: z.string().min(1).optional(),
  REDIS_URL: z.string().min(1).default("redis://localhost:6379"),

  AUTH_SECRET: z.string().min(16).default("dev-only-insecure-secret-change-me"),
  APP_ENCRYPTION_KEY: z.string().optional(),

  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().optional(),

  WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
  WHATSAPP_ACCESS_TOKEN: z.string().optional(),
  WHATSAPP_VERIFY_TOKEN: z.string().default("autochat-verify"),
  WHATSAPP_APP_SECRET: z.string().optional(),

  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional(),

  SHIPROCKET_EMAIL: z.string().optional(),
  SHIPROCKET_PASSWORD: z.string().optional(),

  AWS_REGION: z.string().default("ap-south-1"),
  S3_BUCKET: z.string().optional(),
  SES_FROM_EMAIL: z.string().optional(),
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | null = null;

/** Parse + cache process.env. Throws only on malformed (not missing) values. */
export function getEnv(): Env {
  if (cached) return cached;
  cached = EnvSchema.parse(process.env);
  return cached;
}

/** Test seam: reset the cache (used by unit tests). */
export function resetEnvCache(): void {
  cached = null;
}

export const isProd = (): boolean => getEnv().NODE_ENV === "production";

/** Whether a given integration should run in mock mode (no real credentials). */
export const mockFlags = (env: Env = getEnv()) => ({
  ai: !env.ANTHROPIC_API_KEY,
  whatsapp: !(env.WHATSAPP_PHONE_NUMBER_ID && env.WHATSAPP_ACCESS_TOKEN),
  razorpay: !(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET),
  shiprocket: !(env.SHIPROCKET_EMAIL && env.SHIPROCKET_PASSWORD),
  storage: !env.S3_BUCKET,
});
