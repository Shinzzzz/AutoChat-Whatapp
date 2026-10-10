import { prisma } from "@autochat/db";
import { runMockVoiceCall } from "@autochat/engine";
import { apiSession, json, unauthorized } from "../../../../lib/api.js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SCRIPT = [
  "Hi, I saw your bottles at a cafe. I run a restaurant and want branded water.",
  "500ml glass, around 2000 bottles. What would that cost?",
  "Okay, please send me the details to order.",
];

/** Run a simulated AI voice call against a contact and return the transcript. */
export async function POST(req: Request) {
  const session = await apiSession();
  if (!session) return unauthorized();

  const body = (await req.json().catch(() => ({}))) as { contactId?: string };
  const contact = body.contactId
    ? await prisma.contact.findFirst({ where: { id: body.contactId, workspaceId: session.workspaceId } })
    : await prisma.contact.findFirst({ where: { workspaceId: session.workspaceId }, orderBy: { createdAt: "asc" } });
  if (!contact) return json({ error: "no contact to call" }, 400);

  const result = await runMockVoiceCall(session.workspaceId, contact.id, SCRIPT);
  return json({ contact: contact.name ?? contact.phones[0], ...result });
}
