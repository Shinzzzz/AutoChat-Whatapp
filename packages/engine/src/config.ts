import { decryptSecret, getEnv, type ChannelType } from "@autochat/core";
import type { ChannelConfig } from "@autochat/channels";

/**
 * Resolve the runtime credentials for a connector: decrypted per-connector
 * config layered over environment defaults (so a single-tenant dev setup works
 * from .env, while production stores per-workspace creds encrypted in the DB).
 */
export function resolveConnectorConfig(
  type: ChannelType,
  encryptedConfig: string | null | undefined,
): ChannelConfig {
  const env = getEnv();
  let fromDb: ChannelConfig = {};
  if (encryptedConfig) {
    try {
      fromDb = JSON.parse(decryptSecret(encryptedConfig)) as ChannelConfig;
    } catch {
      fromDb = {};
    }
  }
  if (type === "whatsapp") {
    return {
      phoneNumberId: fromDb.phoneNumberId ?? env.WHATSAPP_PHONE_NUMBER_ID,
      accessToken: fromDb.accessToken ?? env.WHATSAPP_ACCESS_TOKEN,
      verifyToken: fromDb.verifyToken ?? env.WHATSAPP_VERIFY_TOKEN,
      appSecret: fromDb.appSecret ?? env.WHATSAPP_APP_SECRET,
    };
  }
  return fromDb;
}
