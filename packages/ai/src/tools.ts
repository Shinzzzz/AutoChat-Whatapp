import { prisma } from "@autochat/db";
import type { CommerceProvider, OrderSpec } from "@autochat/commerce";

/** A tool definition in the shape the Anthropic Messages API expects. */
export interface ToolDef {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
    additionalProperties: boolean;
  };
}

export const TOOL_DEFS: ToolDef[] = [
  {
    name: "get_pricing",
    description:
      "Return the live price list (unit price, minimum order quantity, turnaround) for every configuration. Always use this instead of quoting a remembered price.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_catalog",
    description:
      "Return the configurable options the customer can choose (business model, size, material, water, 1L glass shapes).",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "upsert_contact",
    description:
      "Create or update the contact for this conversation with any details learned (name, phone, email, enquiry type). Call this as soon as you learn who you are talking to.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string" },
        phone: { type: "string" },
        email: { type: "string" },
        enquiryType: { type: "string", description: "e.g. vanity, ad_subsidized, venue_partner, general" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "create_quote",
    description:
      "Create a draft quote from a full configuration. The order enters 'awaiting review' for the team to price and confirm.",
    input_schema: {
      type: "object",
      properties: {
        model: { type: "string", enum: ["vanity", "ad_subsidized"] },
        size: { type: "string", enum: ["250ml", "500ml", "1l"] },
        material: { type: "string", enum: ["pet", "glass"] },
        water: { type: "string", enum: ["ro", "himalayan"] },
        shape: {
          type: "string",
          enum: ["round", "square", "peace", "zen", "pyramid"],
          description: "1L glass only",
        },
        quantity: { type: "integer", minimum: 1 },
      },
      required: ["model", "size", "material", "water", "quantity"],
      additionalProperties: false,
    },
  },
  {
    name: "get_order_status",
    description:
      "Look up the current stage and amount of an order. Omit orderId to use the customer's most recent order.",
    input_schema: {
      type: "object",
      properties: { orderId: { type: "string" } },
      additionalProperties: false,
    },
  },
  {
    name: "get_tracking_status",
    description:
      "Look up delivery/tracking status for an order. Omit orderId to use the customer's most recent order.",
    input_schema: {
      type: "object",
      properties: { orderId: { type: "string" } },
      additionalProperties: false,
    },
  },
  {
    name: "create_payment_link",
    description:
      "Generate a payment link for an order. Only use after the order is priced and the customer has accepted. Omit orderId to use the most recent order.",
    input_schema: {
      type: "object",
      properties: { orderId: { type: "string" } },
      additionalProperties: false,
    },
  },
  {
    name: "handoff_to_human",
    description:
      "Escalate this conversation to a human operator. Use for complaints, price negotiation, or anything outside your knowledge.",
    input_schema: {
      type: "object",
      properties: { reason: { type: "string" } },
      required: ["reason"],
      additionalProperties: false,
    },
  },
  {
    name: "schedule_followup",
    description: "Record a reminder to follow up with this contact later.",
    input_schema: {
      type: "object",
      properties: {
        note: { type: "string" },
        when: { type: "string", description: "ISO date/time or natural language" },
      },
      required: ["note"],
      additionalProperties: false,
    },
  },
];

export interface ToolContext {
  workspaceId: string;
  contactId: string;
  conversationId?: string;
  commerce: CommerceProvider;
  /** Mutated by tools to signal side effects back to the agent loop. */
  flags: {
    needsHuman: boolean;
    handoffReason?: string;
    followUps: { note: string; when?: string }[];
    paymentLink?: string;
  };
}

/** Execute a single tool call. Returns a JSON-serializable result for the model. */
export async function executeTool(
  name: string,
  input: Record<string, unknown>,
  ctx: ToolContext,
): Promise<unknown> {
  switch (name) {
    case "get_pricing": {
      const lines = await ctx.commerce.getPricing(ctx.workspaceId);
      return {
        currency: "INR",
        note: "Prices are indicative and set by the team; confirm in review.",
        pricing: lines.map((l) => ({
          model: l.model,
          size: l.size,
          material: l.material,
          water: l.water,
          shape: l.shape,
          unitPriceInr: l.unitPricePaise / 100,
          minQty: l.minQty,
          turnaroundDays: l.turnaroundDays,
        })),
      };
    }

    case "get_catalog":
      return ctx.commerce.getCatalog(ctx.workspaceId);

    case "upsert_contact": {
      const data: Record<string, unknown> = {};
      const contact = await prisma.contact.findUnique({ where: { id: ctx.contactId } });
      if (!contact) return { ok: false, error: "contact not found" };
      if (typeof input.name === "string" && input.name) data.name = input.name;
      if (typeof input.phone === "string" && input.phone) {
        data.phones = Array.from(new Set([...contact.phones, input.phone]));
      }
      if (typeof input.email === "string" && input.email) {
        data.emails = Array.from(new Set([...contact.emails, input.email]));
      }
      if (typeof input.enquiryType === "string" && input.enquiryType) {
        const cf = (contact.customFields as Record<string, unknown>) ?? {};
        data.customFields = { ...cf, enquiryType: input.enquiryType };
      }
      await prisma.contact.update({ where: { id: ctx.contactId }, data });
      return { ok: true };
    }

    case "create_quote": {
      const spec: OrderSpec = {
        model: String(input.model),
        size: String(input.size),
        material: String(input.material),
        water: String(input.water),
        shape: input.shape ? String(input.shape) : undefined,
        quantity: Number(input.quantity),
      };
      const draft = await ctx.commerce.createQuoteDraft({
        workspaceId: ctx.workspaceId,
        contactId: ctx.contactId,
        conversationId: ctx.conversationId,
        spec,
      });
      return draft;
    }

    case "get_order_status": {
      const status = await ctx.commerce.getOrderStatus(ctx.workspaceId, {
        orderId: input.orderId ? String(input.orderId) : undefined,
        contactId: ctx.contactId,
      });
      return status ?? { error: "no order found" };
    }

    case "get_tracking_status": {
      const orderId = input.orderId
        ? String(input.orderId)
        : (
            await prisma.order.findFirst({
              where: { workspaceId: ctx.workspaceId, contactId: ctx.contactId },
              orderBy: { createdAt: "desc" },
            })
          )?.id;
      if (!orderId) return { error: "no order found" };
      const status = await ctx.commerce.getTrackingStatus(ctx.workspaceId, orderId);
      return status ?? { error: "no order found" };
    }

    case "create_payment_link": {
      const orderId = input.orderId
        ? String(input.orderId)
        : (
            await prisma.order.findFirst({
              where: { workspaceId: ctx.workspaceId, contactId: ctx.contactId },
              orderBy: { createdAt: "desc" },
            })
          )?.id;
      if (!orderId) return { error: "no order found" };
      const link = await ctx.commerce.createPaymentLink(ctx.workspaceId, orderId);
      ctx.flags.paymentLink = link.url;
      return link;
    }

    case "handoff_to_human": {
      ctx.flags.needsHuman = true;
      ctx.flags.handoffReason = String(input.reason ?? "");
      return { ok: true, escalated: true };
    }

    case "schedule_followup": {
      ctx.flags.followUps.push({
        note: String(input.note ?? ""),
        when: input.when ? String(input.when) : undefined,
      });
      return { ok: true };
    }

    default:
      return { error: `unknown tool: ${name}` };
  }
}
