import { executeTool, type ToolContext } from "./tools.js";
import type { AgentTurnInput, AgentTurnResult, ToolInvocation } from "./agent.js";

/**
 * Deterministic keyword-driven agent used when ANTHROPIC_API_KEY is absent.
 * It exercises the real tools so the whole flow (pricing → quote → payment →
 * tracking → handoff) is demonstrable without an API key.
 */
export async function runMockAgent(
  input: AgentTurnInput,
  ctx: ToolContext,
): Promise<AgentTurnResult> {
  const invocations: ToolInvocation[] = [];
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const result = await executeTool(name, args, ctx);
    invocations.push({ name, input: args, result });
    return result;
  };

  const lastUser = [...input.history].reverse().find((h) => h.role === "user");
  const text = (lastUser?.text ?? "").toLowerCase();

  let reply: string;

  if (/(track|where.*(order|delivery)|delivery status|status of)/.test(text)) {
    const status = (await call("get_tracking_status")) as {
      status?: string;
      error?: string;
      trackingUrl?: string;
    };
    reply = status.error
      ? "I couldn't find an order on your number yet. Could you share your order id?"
      : `Your order is currently: ${status.status}.${status.trackingUrl ? ` Track it here: ${status.trackingUrl}` : ""}`;
  } else if (/(pay|payment|invoice|link to pay)/.test(text)) {
    const link = (await call("create_payment_link")) as {
      url?: string;
      error?: string;
    };
    reply = link.error
      ? "I don't see a confirmed order to pay for yet. Shall I prepare a quote first?"
      : `Here's your secure payment link: ${link.url}`;
  } else if (/(human|agent|representative|call me|complaint|speak to)/.test(text)) {
    await call("handoff_to_human", { reason: "customer requested a human" });
    reply = "Sure — I'm connecting you with a member of our team who'll reply here shortly.";
  } else if (/(price|cost|rate|quote|how much|quotation)/.test(text)) {
    const pricing = (await call("get_pricing")) as {
      pricing?: { size: string; unitPriceInr: number; model: string }[];
    };
    const sample = (pricing.pricing ?? [])
      .slice(0, 3)
      .map((p) => `${p.size}: ₹${p.unitPriceInr}/bottle`)
      .join(", ");
    reply = `Happy to help with a quote! Indicative starting prices — ${sample} (final price confirmed by our team). Could you tell me: which model (your-brand vanity or ad-subsidized), size, material (PET or glass), water (RO or Himalayan) and how many bottles?`;
  } else {
    reply =
      "Hi! We make custom-branded bottled water — your name and QR code on every bottle. Are you looking to brand water for your venue, or sponsor bottles as a campaign? I can put together a quick quote.";
  }

  return {
    replyText: reply,
    needsHuman: ctx.flags.needsHuman,
    handoffReason: ctx.flags.handoffReason,
    toolInvocations: invocations,
    followUps: ctx.flags.followUps,
    paymentLink: ctx.flags.paymentLink,
    model: "mock",
    mock: true,
  };
}
