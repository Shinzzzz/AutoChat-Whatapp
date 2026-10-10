import { prisma } from "@autochat/db";
import { SOCKET_EVENTS } from "@autochat/core";
import { publishRealtime, triggerSend } from "@autochat/engine";
import { apiSession, json, unauthorized } from "../../../../../lib/api.js";

export const dynamic = "force-dynamic";

async function ownConversation(workspaceId: string, id: string) {
  return prisma.conversation.findFirst({ where: { id, workspaceId } });
}

/** Full message history for a conversation. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await apiSession();
  if (!session) return unauthorized();
  const { id } = await params;
  const convo = await ownConversation(session.workspaceId, id);
  if (!convo) return json({ error: "not found" }, 404);

  const messages = await prisma.message.findMany({
    where: { conversationId: id },
    orderBy: { createdAt: "asc" },
    take: 200,
  });
  // Mark read.
  await prisma.conversation.update({ where: { id }, data: { unreadCount: 0 } });

  return json({
    messages: messages.map((m) => ({
      id: m.id,
      direction: m.direction,
      sender: m.sender,
      text: m.text,
      createdAt: m.createdAt.toISOString(),
      deliveryStatus: m.deliveryStatus,
      aiMeta: m.aiMeta,
    })),
  });
}

/** Human sends a manual reply (does not trigger the AI). */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await apiSession();
  if (!session) return unauthorized();
  const { id } = await params;
  const convo = await ownConversation(session.workspaceId, id);
  if (!convo) return json({ error: "not found" }, 404);

  const body = (await req.json().catch(() => ({}))) as { text?: string };
  const text = (body.text ?? "").trim();
  if (!text) return json({ error: "empty message" }, 400);

  const msg = await prisma.message.create({
    data: {
      workspaceId: session.workspaceId,
      conversationId: id,
      direction: "outbound",
      sender: "human",
      text,
      deliveryStatus: "pending",
    },
  });
  await prisma.conversation.update({
    where: { id },
    data: { lastMessageAt: new Date(), lastMessagePreview: text.slice(0, 160) },
  });
  await publishRealtime(session.workspaceId, SOCKET_EVENTS.messageCreated, {
    conversationId: id,
    message: {
      id: msg.id,
      conversationId: id,
      direction: "outbound",
      sender: "human",
      text,
      createdAt: msg.createdAt.toISOString(),
      deliveryStatus: "pending",
    },
  });
  await triggerSend(msg.id);

  return json({ ok: true, id: msg.id });
}
