import { prisma } from "@autochat/db";
import { distill, summarizeConversation, type DistillTurn } from "@autochat/ai";
import { QUEUES } from "@autochat/core";
import { newRedis } from "./redis.js";
import { useQueue } from "./queue.js";
import { indexLearnedItem, indexContactMemory } from "./knowledge.js";

function toTurns(messages: { sender: string; text: string | null }[]): DistillTurn[] {
  return messages
    .filter((m) => m.text)
    .map((m) => ({
      role: m.sender === "contact" ? ("customer" as const) : m.sender === "human" ? ("human" as const) : ("agent" as const),
      text: m.text!,
    }));
}

async function hasConverted(workspaceId: string, contactId: string): Promise<boolean> {
  const paid = await prisma.order.findFirst({
    where: { workspaceId, contactId, razorpayPaymentId: { not: null } },
  });
  return !!paid;
}

/** Distill durable knowledge candidates from a conversation into the review queue. */
export async function distillConversation(conversationId: string): Promise<number> {
  const convo = await prisma.conversation.findUnique({ where: { id: conversationId } });
  if (!convo) return 0;
  const messages = await prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: "asc" },
    take: 50,
  });
  const converted = await hasConverted(convo.workspaceId, convo.contactId);
  const candidates = await distill(toTurns(messages), converted);

  for (const c of candidates) {
    await prisma.learnedItem.create({
      data: {
        workspaceId: convo.workspaceId,
        conversationId,
        type: c.type,
        question: c.question,
        answer: c.answer,
        confidence: c.confidence,
        converted,
        status: "pending",
      },
    });
  }
  return candidates.length;
}

/** Approve a learned item (optionally edited) → promote to a retrievable chunk. */
export async function approveLearnedItem(
  workspaceId: string,
  itemId: string,
  edits: { question?: string; answer?: string } = {},
): Promise<void> {
  const item = await prisma.learnedItem.findFirst({ where: { id: itemId, workspaceId } });
  if (!item) return;
  await prisma.learnedItem.update({
    where: { id: itemId },
    data: {
      status: "approved",
      ...(edits.question !== undefined ? { question: edits.question } : {}),
      ...(edits.answer ? { answer: edits.answer } : {}),
    },
  });
  await indexLearnedItem(itemId);
}

export async function rejectLearnedItem(workspaceId: string, itemId: string): Promise<void> {
  await prisma.learnedItem.updateMany({
    where: { id: itemId, workspaceId },
    data: { status: "rejected" },
  });
}

/** Close a conversation: record a per-contact memory summary and queue learning. */
export async function closeConversation(workspaceId: string, conversationId: string): Promise<void> {
  const convo = await prisma.conversation.findFirst({ where: { id: conversationId, workspaceId } });
  if (!convo) return;
  const messages = await prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: "asc" },
    take: 50,
  });
  const summary = await summarizeConversation(toTurns(messages));
  await prisma.conversation.update({
    where: { id: conversationId },
    data: { status: "closed", aiSummary: summary },
  });
  if (summary) await indexContactMemory(workspaceId, convo.contactId, summary);
  await triggerLearn(conversationId);
}

/** Dispatch distillation (queue or inline). */
export async function triggerLearn(conversationId: string): Promise<void> {
  if (useQueue()) {
    const { Queue } = await import("bullmq");
    const q = new Queue(QUEUES.learn, { connection: newRedis() });
    await q.add("distill", { conversationId });
  } else {
    await distillConversation(conversationId);
  }
}
