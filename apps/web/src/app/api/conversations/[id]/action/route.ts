import { prisma } from "@autochat/db";
import { SOCKET_EVENTS } from "@autochat/core";
import { publishRealtime, runAiForConversation, closeConversation, distillConversation } from "@autochat/engine";
import { apiSession, json, unauthorized } from "../../../../../lib/api.js";

export const dynamic = "force-dynamic";

/** Conversation controls: take over, hand back to AI, or ask the AI to reply now. */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await apiSession();
  if (!session) return unauthorized();
  const { id } = await params;
  const convo = await prisma.conversation.findFirst({
    where: { id, workspaceId: session.workspaceId },
  });
  if (!convo) return json({ error: "not found" }, 404);

  const body = (await req.json().catch(() => ({}))) as { type?: string };

  switch (body.type) {
    case "takeover":
      await prisma.conversation.update({
        where: { id },
        data: { status: "needs_human", assigneeId: session.userId },
      });
      break;
    case "release":
      await prisma.conversation.update({
        where: { id },
        data: { status: "ai_handling", assigneeId: null },
      });
      break;
    case "ai_run":
      // Clear any human hold so the AI is allowed to reply, then run it.
      await prisma.conversation.update({
        where: { id },
        data: { status: "ai_handling", assigneeId: null },
      });
      await runAiForConversation(id);
      break;
    case "close":
      // Close + summarize into contact memory + queue learning.
      await closeConversation(session.workspaceId, id);
      break;
    case "learn":
      await distillConversation(id);
      break;
    default:
      return json({ error: "unknown action" }, 400);
  }

  await publishRealtime(session.workspaceId, SOCKET_EVENTS.conversationUpdated, {
    conversationId: id,
  });
  return json({ ok: true });
}
