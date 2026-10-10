import type { OrderStage } from "@autochat/core";

/**
 * Pluggable commerce layer. Resellers plug their own storefront (Shopify, Woo,
 * custom) by implementing CommerceProvider; AquaMedia is the first impl.
 */

export interface CatalogOption {
  key: string;
  label: string;
  /** Optional nested options (e.g. 1L glass shapes under the "1l"+"glass" combo). */
  requires?: Record<string, string>;
}

export interface CatalogDimension {
  key: string; // "model" | "size" | "material" | "water" | "shape"
  label: string;
  options: CatalogOption[];
}

export interface Catalog {
  dimensions: CatalogDimension[];
  currency: string;
  notes: string;
}

/** A single pricing row resolved for a spec. */
export interface PriceLine {
  model: string;
  size: string;
  material: string;
  water: string;
  shape?: string;
  unitPricePaise: number;
  minQty: number;
  turnaroundDays: number;
}

export interface OrderSpec {
  model: string;
  size: string;
  material: string;
  water: string;
  shape?: string;
  quantity: number;
}

export interface QuoteDraft {
  quoteId: string;
  orderId: string;
  stage: OrderStage;
  spec: OrderSpec;
  unitPricePaise: number;
  subtotalPaise: number;
  /** Indicative only — the team confirms the final price in review. */
  indicative: boolean;
  message: string;
}

export interface OrderStatus {
  orderId: string;
  stage: OrderStage;
  quantity: number;
  totalPaise: number;
  currency: string;
  paid: boolean;
}

export interface TrackingStatus {
  orderId: string;
  stage: OrderStage;
  awb?: string;
  courier?: string;
  status: string;
  trackingUrl?: string;
  mock?: boolean;
}

export interface PaymentLink {
  url: string;
  linkId: string;
  amountPaise: number;
  mock?: boolean;
}

export interface CommerceProvider {
  readonly key: string;
  getCatalog(workspaceId: string): Promise<Catalog>;
  /** Live pricing — never hard-coded in AI answers. */
  getPricing(workspaceId: string): Promise<PriceLine[]>;
  resolvePrice(
    workspaceId: string,
    spec: Omit<OrderSpec, "quantity">,
  ): Promise<PriceLine | null>;
  /** Creates an order in `awaiting_review` with an attached draft quote. */
  createQuoteDraft(args: {
    workspaceId: string;
    contactId: string;
    conversationId?: string;
    spec: OrderSpec;
  }): Promise<QuoteDraft>;
  getOrderStatus(
    workspaceId: string,
    ref: { orderId?: string; contactId?: string },
  ): Promise<OrderStatus | null>;
  getTrackingStatus(
    workspaceId: string,
    orderId: string,
  ): Promise<TrackingStatus | null>;
  createPaymentLink(
    workspaceId: string,
    orderId: string,
  ): Promise<PaymentLink>;
}
