import { prisma } from "@autochat/db";
import { apiSession, json, unauthorized } from "../../../lib/api.js";

export const dynamic = "force-dynamic";

/** List conversations for the inbox. */
export async function GET() {
  const session = await apiSession();
  if (!session) return unauthorized();

  const convos = await prisma.conversation.findMany({
    where: { workspaceId: session.workspaceId },
    orderBy: { lastMessageAt: "desc" },
    take: 100,
    include: { contact: { select: { name: true, phones: true } } },
  });

  return json({
    conversations: convos.map((c) => ({
      id: c.id,
      name: c.contact.name ?? c.contact.phones[0] ?? "Unknown",
      channel: c.channel,
      status: c.status,
      preview: c.lastMessagePreview ?? "",
      lastMessageAt: c.lastMessageAt?.toISOString() ?? null,
      unreadCount: c.unreadCount,
    })),
  });
}
