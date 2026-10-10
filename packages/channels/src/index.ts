import type { ChannelType } from "@autochat/core";
import type { ChannelProvider } from "./types.js";
import { whatsappProvider } from "./whatsapp.js";
import { instagramProvider } from "./instagram.js";
import { emailProvider } from "./email.js";
import { webhookProvider } from "./webhook.js";

export * from "./types.js";
export * from "./whatsapp.js";
export * from "./instagram.js";
export * from "./email.js";
export * from "./webhook.js";

/** Registry of implemented channel providers. */
const REGISTRY: Partial<Record<ChannelType, ChannelProvider>> = {
  whatsapp: whatsappProvider,
  instagram: instagramProvider,
  email: emailProvider,
  webhook: webhookProvider,
  // voice lands in M5.
};

export function getChannelProvider(type: ChannelType): ChannelProvider {
  const p = REGISTRY[type];
  if (!p) throw new Error(`No channel provider implemented for "${type}"`);
  return p;
}

export function hasChannelProvider(type: ChannelType): boolean {
  return Boolean(REGISTRY[type]);
}
