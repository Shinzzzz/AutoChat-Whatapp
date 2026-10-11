import Anthropic from "@anthropic-ai/sdk";
import { getEnv, mockFlags } from "@autochat/core";
import { resolveModel } from "./model.js";

export interface LearnedCandidate {
  type: "qa" | "fact" | "objection";
  question?: string;
  answer: string;
  confidence: number;
}

export interface DistillTurn {
  role: "customer" | "agent" | "human";
  text: string;
}

const PROMPT = `You are improving a sales/support AI's knowledge base from a finished conversation.
Extract durable, reusable knowledge a future agent should know — not one-off specifics.
Prefer: recurring questions and the correct answer (type "qa"), stable facts (type "fact"),
and objections with how they were handled (type "objection").
Ignore: greetings, PII, prices/quantities (those are read live), anything uncertain or one-off.
Respond with ONLY a JSON array (max 5), each:
{"type":"qa|fact|objection","question":string|null,"answer":string,"confidence":0..1}
Return [] if nothing is worth keeping.`;

/** Distill durable knowledge candidates from a conversation transcript. */
export async function distill(
  turns: DistillTurn[],
  converted: boolean,
): Promise<LearnedCandidate[]> {
  const transcript = turns.map((t) => `${t.role}: ${t.text}`).join("\n");

  if (mockFlags().ai) {
    // Deterministic fallback: pair the first customer question with the first agent answer.
    const q = turns.find((t) => t.role === "customer")?.text;
    const a = turns.find((t) => t.role === "agent")?.text;
    if (!q || !a) return [];
    return [{ type: "qa", question: q.slice(0, 200), answer: a.slice(0, 400), confidence: converted ? 0.8 : 0.5 }];
  }

  const client = new Anthropic({ apiKey: getEnv().ANTHROPIC_API_KEY });
  const res = await client.messages.create({
    model: resolveModel(null),
    max_tokens: 1024,
    system: PROMPT,
    messages: [{ role: "user", content: `Conversation (converted=${converted}):\n\n${transcript}` }],
  });
  const text = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return [];
  try {
    const parsed = JSON.parse(match[0]) as LearnedCandidate[];
    return parsed
      .filter((c) => c.answer && ["qa", "fact", "objection"].includes(c.type))
      .slice(0, 5)
      .map((c) => ({ ...c, confidence: Math.max(0, Math.min(1, c.confidence ?? 0.5)) }));
  } catch {
    return [];
  }
}

/** Summarize a conversation into a short per-contact memory note. */
export async function summarizeConversation(turns: DistillTurn[]): Promise<string> {
  const transcript = turns.map((t) => `${t.role}: ${t.text}`).join("\n");
  if (mockFlags().ai) {
    const first = turns.find((t) => t.role === "customer")?.text ?? "";
    return `Previous enquiry: ${first.slice(0, 200)}`;
  }
  const client = new Anthropic({ apiKey: getEnv().ANTHROPIC_API_KEY });
  const res = await client.messages.create({
    model: resolveModel(null),
    max_tokens: 256,
    system: "Summarize this customer conversation in 1-2 sentences for future context (no PII beyond first name).",
    messages: [{ role: "user", content: transcript }],
  });
  return res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
}
