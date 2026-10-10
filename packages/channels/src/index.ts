import type { ChannelType } from "@autochat/core";
import type { ChannelProvider } from "./types.js";
import { whatsappProvider } from "./whatsapp.js";

export * from "./types.js";
export * from "./whatsapp.js";

/** Registry of implemented channel providers. */
const REGISTRY: Partial<Record<ChannelType, ChannelProvider>> = {
  whatsapp: whatsappProvider,
  // instagram, email, webhook, voice land in later milestones.
};

export function getChannelProvider(type: ChannelType): ChannelProvider {
  const p = REGISTRY[type];
  if (!p) throw new Error(`No channel provider implemented for "${type}"`);
  return p;
}

export function hasChannelProvider(type: ChannelType): boolean {
  return Boolean(REGISTRY[type]);
}
