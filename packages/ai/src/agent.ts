import Anthropic from "@anthropic-ai/sdk";
import { getEnv, mockFlags } from "@autochat/core";
import { getCommerceProvider } from "@autochat/commerce";
import { buildSystemPrompt } from "./prompt.js";
import { resolveModel } from "./model.js";
import { TOOL_DEFS, executeTool, type ToolContext } from "./tools.js";
import { runMockAgent } from "./mock.js";

export interface HistoryTurn {
  role: "user" | "assistant";
  text: string;
}

export interface AgentTurnInput {
  workspaceId: string;
  conversationId: string;
  contactId: string;
  brandName: string;
  persona: string;
  knowledge: string;
  autonomy: "full_auto" | "assist" | "off";
  model?: string | null;
  history: HistoryTurn[];
  /** Images attached to the latest inbound message (vision). */
  images?: { base64: string; mimeType: string }[];
}

export interface ToolInvocation {
  name: string;
  input: unknown;
  result: unknown;
}

export interface AgentTurnResult {
  replyText: string;
  needsHuman: boolean;
  handoffReason?: string;
  toolInvocations: ToolInvocation[];
  followUps: { note: string; when?: string }[];
  paymentLink?: string;
  model: string;
  mock: boolean;
}

const MAX_ITERATIONS = 6;
const MAX_TOKENS = 1024;

/** Run one agent turn: call Claude with tools, loop over tool calls, return the reply. */
export async function runAgentTurn(
  input: AgentTurnInput,
): Promise<AgentTurnResult> {
  const commerce = getCommerceProvider(input.workspaceId);
  const ctx: ToolContext = {
    workspaceId: input.workspaceId,
    contactId: input.contactId,
    conversationId: input.conversationId,
    commerce,
    flags: { needsHuman: false, followUps: [] },
  };

  // No API key → deterministic mock agent so the flow is demonstrable.
  if (mockFlags().ai) {
    return runMockAgent(input, ctx);
  }

  const client = new Anthropic({ apiKey: getEnv().ANTHROPIC_API_KEY });
  const model = resolveModel(input.model);
  const system = buildSystemPrompt({
    brandName: input.brandName,
    persona: input.persona,
    knowledge: input.knowledge,
    autonomy: input.autonomy,
  });

  const messages: Anthropic.MessageParam[] = input.history.map((h, i) => {
    // Attach images to the most recent user turn only.
    const isLastUser =
      h.role === "user" && i === input.history.length - 1 && !!input.images?.length;
    if (isLastUser) {
      const blocks: Anthropic.ContentBlockParam[] = input.images!.map((img) => ({
        type: "image",
        source: {
          type: "base64",
          media_type: img.mimeType as "image/jpeg",
          data: img.base64,
        },
      }));
      blocks.push({ type: "text", text: h.text });
      return { role: "user", content: blocks };
    }
    return { role: h.role, content: h.text };
  });

  const toolInvocations: ToolInvocation[] = [];
  let replyText = "";

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    const response = await client.messages.create({
      model,
      max_tokens: MAX_TOKENS,
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      tools: TOOL_DEFS,
      tool_choice: { type: "auto" },
      messages,
    });

    messages.push({ role: "assistant", content: response.content });

    // Collect any text the model emitted this round.
    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    if (text) replyText = text;

    if (response.stop_reason !== "tool_use") break;

    const toolUses = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
    );
    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const tu of toolUses) {
      const result = await executeTool(
        tu.name,
        (tu.input ?? {}) as Record<string, unknown>,
        ctx,
      );
      toolInvocations.push({ name: tu.name, input: tu.input, result });
      toolResults.push({
        type: "tool_result",
        tool_use_id: tu.id,
        content: JSON.stringify(result),
      });
    }
    messages.push({ role: "user", content: toolResults });
  }

  return {
    replyText: replyText || "…",
    needsHuman: ctx.flags.needsHuman,
    handoffReason: ctx.flags.handoffReason,
    toolInvocations,
    followUps: ctx.flags.followUps,
    paymentLink: ctx.flags.paymentLink,
    model,
    mock: false,
  };
}
