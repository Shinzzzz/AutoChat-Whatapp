import { prisma } from "@autochat/db";
import { voiceReply } from "@autochat/engine";
import { json } from "../../../../lib/api.js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Voice call-control webhook. A telephony/STT integration posts a transcribed
 * caller turn ({ conversationId, transcript }); we run the agent and return the
 * text to speak (TTS). Provider call-status callbacks are acked.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    conversationId?: string;
    transcript?: string;
  };
  if (!body.conversationId || !body.transcript) {
    return json({ ok: true }); // status callback / no speech turn
  }
  const convo = await prisma.conversation.findUnique({ where: { id: body.conversationId } });
  if (!convo) return json({ error: "not found" }, 404);

  const reply = await voiceReply(convo.workspaceId, convo.id, body.transcript);
  return json(reply);
}
