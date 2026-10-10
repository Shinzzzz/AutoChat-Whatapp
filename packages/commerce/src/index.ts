export * from "./types.js";
export * from "./stages.js";
export * from "./aquamedia/catalog.js";
export * from "./aquamedia/provider.js";

import { aquamediaProvider } from "./aquamedia/provider.js";
import type { CommerceProvider } from "./types.js";

/**
 * Resolve the commerce provider for a workspace. Today every workspace uses the
 * AquaMedia provider; this is the seam where a reseller's Shopify/Woo provider
 * would be selected from workspace config.
 */
export function getCommerceProvider(_workspaceId: string): CommerceProvider {
  return aquamediaProvider;
}
