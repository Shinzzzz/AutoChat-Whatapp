import { prisma, Prisma } from "@autochat/db";
import { mockFlags } from "@autochat/core";
import { createRazorpayLink } from "../payments/razorpay.js";
import type {
  Catalog,
  CommerceProvider,
  OrderSpec,
  OrderStatus,
  PaymentLink,
  PriceLine,
  QuoteDraft,
  TrackingStatus,
} from "../types.js";
import { AQUAMEDIA_CATALOG } from "./catalog.js";

/**
 * AquaMedia commerce provider. Pricing comes from the PricingRule table (the
 * admin console), so GET /api/pricing and the AI's get_pricing tool always
 * reflect the team's current rates. Razorpay + Shiprocket are mocked until their
 * credentials are configured (full build in M2).
 */
export class AquaMediaProvider implements CommerceProvider {
  readonly key = "aquamedia";

  async getCatalog(): Promise<Catalog> {
    return AQUAMEDIA_CATALOG;
  }

  async getPricing(workspaceId: string): Promise<PriceLine[]> {
    const rows = await prisma.pricingRule.findMany({
      where: { workspaceId, active: true },
      orderBy: [{ model: "asc" }, { size: "asc" }],
    });
    return rows.map((r) => ({
      model: r.model,
      size: r.size,
      material: r.material,
      water: r.water,
      shape: r.shape ?? undefined,
      unitPricePaise: r.unitPricePaise,
      minQty: r.minQty,
      turnaroundDays: r.turnaroundDays,
    }));
  }

  async resolvePrice(
    workspaceId: string,
    spec: Omit<OrderSpec, "quantity">,
  ): Promise<PriceLine | null> {
    // Prefer the most specific active rule; fall back to the base (model,size).
    const rows = await prisma.pricingRule.findMany({
      where: { workspaceId, active: true, model: spec.model, size: spec.size },
    });
    if (rows.length === 0) return null;
    const score = (r: (typeof rows)[number]) =>
      (r.material === spec.material ? 1 : 0) +
      (r.water === spec.water ? 1 : 0) +
      (r.shape && r.shape === spec.shape ? 1 : 0);
    const best = [...rows].sort((a, b) => score(b) - score(a))[0]!;
    return {
      model: best.model,
      size: best.size,
      material: best.material,
      water: best.water,
      shape: best.shape ?? undefined,
      unitPricePaise: best.unitPricePaise,
      minQty: best.minQty,
      turnaroundDays: best.turnaroundDays,
    };
  }

  async createQuoteDraft(args: {
    workspaceId: string;
    contactId: string;
    conversationId?: string;
    spec: OrderSpec;
  }): Promise<QuoteDraft> {
    const { workspaceId, contactId, conversationId, spec } = args;
    const price = await this.resolvePrice(workspaceId, spec);
    const unit = price?.unitPricePaise ?? 0;
    const subtotal = unit * spec.quantity;

    const order = await prisma.order.create({
      data: {
        workspaceId,
        contactId,
        conversationId,
        config: spec as unknown as Prisma.InputJsonObject,
        quantity: spec.quantity,
        subtotalPaise: subtotal,
        totalPaise: subtotal,
        stage: "awaiting_review",
      },
    });
    const quote = await prisma.quote.create({
      data: {
        workspaceId,
        contactId,
        orderId: order.id,
        config: spec as unknown as Prisma.InputJsonObject,
        amountPaise: subtotal,
        status: "draft",
      },
    });
    // Advance the contact to the "quoted" stage.
    await prisma.contact.update({
      where: { id: contactId },
      data: { stage: "quoted" },
    });

    const belowMin = price ? spec.quantity < price.minQty : false;
    const message = price
      ? `Drafted an indicative quote for ${spec.quantity} × ${spec.size} ${spec.material} (${spec.model}): approximately ₹${(subtotal / 100).toFixed(0)} at ₹${(unit / 100).toFixed(2)}/bottle. ${belowMin ? `Note: minimum order is ${price.minQty} bottles. ` : ""}Our team will review and send a final priced quotation.`
      : `Captured your configuration. Our team will review and send a priced quotation.`;

    return {
      quoteId: quote.id,
      orderId: order.id,
      stage: "awaiting_review",
      spec,
      unitPricePaise: unit,
      subtotalPaise: subtotal,
      indicative: true,
      message,
    };
  }

  async getOrderStatus(
    workspaceId: string,
    ref: { orderId?: string; contactId?: string },
  ): Promise<OrderStatus | null> {
    const order = ref.orderId
      ? await prisma.order.findFirst({
          where: { id: ref.orderId, workspaceId },
        })
      : ref.contactId
        ? await prisma.order.findFirst({
            where: { workspaceId, contactId: ref.contactId },
            orderBy: { createdAt: "desc" },
          })
        : null;
    if (!order) return null;
    const paid = !!order.razorpayPaymentId;
    return {
      orderId: order.id,
      stage: order.stage,
      quantity: order.quantity,
      totalPaise: order.totalPaise,
      currency: order.currency,
      paid,
    };
  }

  async getTrackingStatus(
    workspaceId: string,
    orderId: string,
  ): Promise<TrackingStatus | null> {
    const order = await prisma.order.findFirst({
      where: { id: orderId, workspaceId },
      include: { shipment: true },
    });
    if (!order) return null;

    if (order.shipment) {
      return {
        orderId,
        stage: order.stage,
        awb: order.shipment.awb ?? undefined,
        courier: order.shipment.courier ?? undefined,
        status: order.shipment.status,
        trackingUrl: order.shipment.trackingUrl ?? undefined,
      };
    }

    // No shipment yet — report from the order stage (mock in M1).
    return {
      orderId,
      stage: order.stage,
      status:
        order.stage === "dispatched"
          ? "In transit"
          : order.stage === "delivered"
            ? "Delivered"
            : "Not yet dispatched",
      mock: mockFlags().shiprocket,
    };
  }

  async createPaymentLink(
    workspaceId: string,
    orderId: string,
  ): Promise<PaymentLink> {
    const order = await prisma.order.findFirstOrThrow({
      where: { id: orderId, workspaceId },
      include: { contact: true, workspace: true },
    });
    const amountPaise = order.totalPaise || order.subtotalPaise;
    const link = await createRazorpayLink({
      amountPaise,
      description: `${order.workspace.brandName} order ${order.id.slice(-6).toUpperCase()}`,
      referenceId: order.id,
      customerName: order.contact.name ?? undefined,
      customerContact: order.contact.phones[0],
      customerEmail: order.contact.emails[0],
      callbackUrl: `${(process.env.PUBLIC_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "")}/pay/callback`,
    });

    await prisma.order.update({
      where: { id: orderId },
      data: { razorpayLinkId: link.linkId },
    });
    await prisma.payment.create({
      data: {
        workspaceId,
        orderId,
        provider: "razorpay",
        providerRefId: link.linkId,
        amountPaise,
        status: "created",
      },
    });
    return { url: link.url, linkId: link.linkId, amountPaise, mock: link.mock };
  }
}

export const aquamediaProvider = new AquaMediaProvider();
