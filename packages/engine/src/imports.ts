import { prisma } from "@autochat/db";
import { normalizePhone, SOCKET_EVENTS } from "@autochat/core";
import { getObject } from "@autochat/core/storage";
import { extractFromImage, type Extraction } from "@autochat/ai";
import { publishRealtime } from "./realtime.js";
import { triggerAi } from "./pipeline.js";

/** Run Claude vision over an uploaded screenshot and store the extraction. */
export async function processScreenshotImport(importId: string): Promise<void> {
  const imp = await prisma.screenshotImport.findUnique({ where: { id: importId } });
  if (!imp) return;
  const obj = await getObject(imp.imageKey);
  if (!obj) {
    await prisma.screenshotImport.update({ where: { id: importId }, data: { status: "failed" } });
    return;
  }
  const extraction = await extractFromImage(obj.body.toString("base64"), obj.contentType);
  await prisma.screenshotImport.update({
    where: { id: importId },
    data: { status: "extracted", extracted: extraction as unknown as object },
  });
}

/** Confirm an import: create/merge the contact + conversation and let the AI take over. */
export async function confirmScreenshotImport(
  workspaceId: string,
  importId: string,
  overrides: Partial<Extraction> = {},
): Promise<{ conversationId: string; contactId: string } | null> {
  const imp = await prisma.screenshotImport.findFirst({ where: { id: importId, workspaceId } });
  if (!imp) return null;
  const ex = { ...((imp.extracted as unknown as Extraction) ?? { summary: "" }), ...overrides };
  const phone = ex.phone ? normalizePhone(ex.phone) : undefined;

  let contact =
    (phone && (await prisma.contact.findFirst({ where: { workspaceId, phones: { has: phone } } }))) ||
    (ex.email && (await prisma.contact.findFirst({ where: { workspaceId, emails: { has: ex.email } } }))) ||
    null;
  if (!contact) {
    contact = await prisma.contact.create({
      data: {
        workspaceId,
        name: ex.name,
        phones: phone ? [phone] : [],
        emails: ex.email ? [ex.email] : [],
        source: "screenshot-import",
        stage: "lead",
        customFields: ex.enquiryType ? { enquiryType: ex.enquiryType } : {},
      },
    });
  }

  const conversation = await prisma.conversation.create({
    data: {
      workspaceId,
      contactId: contact.id,
      channel: "whatsapp",
      status: "ai_handling",
      lastMessageAt: new Date(),
      lastMessagePreview: ex.summary.slice(0, 160),
    },
  });

  // Seed the imported enquiry as the customer's opening message so the AI responds.
  const seed = await prisma.message.create({
    data: {
      workspaceId,
      conversationId: conversation.id,
      direction: "inbound",
      sender: "contact",
      text: ex.summary || "(imported conversation)",
      deliveryStatus: "delivered",
    },
  });

  await prisma.screenshotImport.update({
    where: { id: importId },
    data: { status: "confirmed", contactId: contact.id, conversationId: conversation.id },
  });

  await publishRealtime(workspaceId, SOCKET_EVENTS.messageCreated, {
    conversationId: conversation.id,
    message: {
      id: seed.id,
      conversationId: conversation.id,
      direction: "inbound",
      sender: "contact",
      text: seed.text,
      createdAt: seed.createdAt.toISOString(),
      deliveryStatus: "delivered",
    },
  });
  await triggerAi(conversation.id);

  return { conversationId: conversation.id, contactId: contact.id };
}
