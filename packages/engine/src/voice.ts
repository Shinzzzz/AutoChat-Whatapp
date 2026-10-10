import { prisma } from "@autochat/db";
import { getEnv } from "@autochat/core";
import { voiceProvider } from "@autochat/channels";
import { runAgentTurn, type HistoryTurn } from "@autochat/ai";

/**
 * Voice session bridge. The telephony provider handles PSTN + STT/TTS; this
 * bridge runs the same Claude agent (pricing, quote, payment link, tracking,
 * handoff) against a `voice`-channel conversation, so voice reuses everything.
 *
 * M5 ships the full structure + a mock call runner. Live PSTN audio turns on
 * once a telephony account + number are connected (VOICE_* env / Settings).
 */

async function ensureVoiceConversation(workspaceId: string, contactId: string) {
  const existing = await prisma.conversation.findFirst({
    where: { workspaceId, contactId, channel: "voice", status: { notIn: ["closed"] } },
    orderBy: { lastMessageAt: "desc" },
  });
  return (
    existing ??
    prisma.conversation.create({
      data: { workspaceId, contactId, channel: "voice", status: "ai_handling" },
    })
  );
}

/** Place an outbound call to a lead (mock unless telephony is configured). */
export async function startOutboundCall(
  workspaceId: string,
  contactId: string,
): Promise<{ callId: string; conversationId: string; mock: boolean }> {
  const convo = await ensureVoiceConversation(workspaceId, contactId);
  const contact = await prisma.contact.findUniqueOrThrow({ where: { id: contactId } });
  const to = contact.phones[0] ?? "";
  const base = getEnv().PUBLIC_BASE_URL.replace(/\/$/, "");
  const call = await voiceProvider.placeCall({ to, answerUrl: `${base}/api/webhooks/voice` });
  await prisma.auditEvent.create({
    data: { workspaceId, actor: "ai", action: "voice.call_started", entityType: "conversation", entityId: convo.id, meta: { callId: call.callId, mock: call.mock } },
  });
  return { callId: call.callId, conversationId: convo.id, mock: call.mock };
}

/** Process one spoken turn: store it, run the agent, return text to speak. */
export async function voiceReply(
  workspaceId: string,
  conversationId: string,
  transcript: string,
): Promise<{ speak: string; handoff: boolean }> {
  const convo = await prisma.conversation.findUniqueOrThrow({
    where: { id: conversationId },
    include: { workspace: true },
  });
  await prisma.message.create({
    data: { workspaceId, conversationId, direction: "inbound", sender: "contact", text: transcript, deliveryStatus: "delivered" },
  });

  const [aiConfig, docs, recent] = await Promise.all([
    prisma.aiConfig.findUnique({ where: { workspaceId } }),
    prisma.knowledgeDoc.findMany({ where: { workspaceId } }),
    prisma.message.findMany({ where: { conversationId }, orderBy: { createdAt: "asc" }, take: 20 }),
  ]);
  const history: HistoryTurn[] = recent
    .filter((m) => m.text && m.sender !== "system")
    .map((m) => ({ role: m.sender === "contact" ? ("user" as const) : ("assistant" as const), text: m.text! }));

  const result = await runAgentTurn({
    workspaceId,
    conversationId,
    contactId: convo.contactId,
    brandName: convo.workspace.brandName,
    persona: (aiConfig?.persona ?? "") + "\nYou are on a phone call — keep replies short and natural for speech.",
    knowledge: docs.map((d) => d.content).join("\n\n---\n\n"),
    autonomy: (aiConfig?.autonomy as "full_auto" | "assist" | "off") ?? "full_auto",
    model: aiConfig?.model,
    history,
  });

  await prisma.message.create({
    data: {
      workspaceId,
      conversationId,
      direction: "outbound",
      sender: "ai",
      text: result.replyText,
      deliveryStatus: "sent",
      aiMeta: { model: result.model, mock: result.mock, channel: "voice" },
    },
  });
  await prisma.conversation.update({
    where: { id: conversationId },
    data: {
      status: result.needsHuman ? "needs_human" : "ai_handling",
      lastMessageAt: new Date(),
      lastMessagePreview: result.replyText.slice(0, 160),
    },
  });
  return { speak: result.replyText, handoff: result.needsHuman };
}

/** Demo/mock: simulate a full call as a series of caller utterances. */
export async function runMockVoiceCall(
  workspaceId: string,
  contactId: string,
  transcripts: string[],
): Promise<{ callId: string; conversationId: string; turns: { caller: string; agent: string }[] }> {
  const { callId, conversationId } = await startOutboundCall(workspaceId, contactId);
  const turns: { caller: string; agent: string }[] = [];
  for (const t of transcripts) {
    const r = await voiceReply(workspaceId, conversationId, t);
    turns.push({ caller: t, agent: r.speak });
  }
  return { callId, conversationId, turns };
}
