import { prisma } from "@autochat/db";
import {
  SOCKET_EVENTS,
  normalizePhone,
  type NormalizedInbound,
  type MediaRef,
} from "@autochat/core";
import { getChannelProvider, fetchWhatsAppMedia } from "@autochat/channels";
import { runAgentTurn, type HistoryTurn } from "@autochat/ai";
import { putObject, fileUrl, getObject } from "@autochat/core/storage";
import { randomId } from "@autochat/core";
import { publishRealtime } from "./realtime.js";
import { aiRunQueue, outboundQueue, useQueue } from "./queue.js";
import { resolveConnectorConfig } from "./config.js";

const HISTORY_LIMIT = 20;

export interface IngestResult {
  conversationId: string;
  messageId: string;
  contactId: string;
  deduped: boolean;
}

/** Store an inbound message (upserting contact + conversation), then trigger AI. */
export async function ingestInbound(args: {
  workspaceId: string;
  connectorId?: string;
  normalized: NormalizedInbound;
}): Promise<IngestResult | null> {
  const { workspaceId, connectorId, normalized } = args;
  const phone = normalized.contactPhone
    ? normalizePhone(normalized.contactPhone)
    : undefined;

  // Find or create the contact (match by phone for WhatsApp).
  let contact = phone
    ? await prisma.contact.findFirst({ where: { workspaceId, phones: { has: phone } } })
    : null;
  if (!contact) {
    contact = await prisma.contact.create({
      data: {
        workspaceId,
        name: normalized.contactName,
        phones: phone ? [phone] : [],
        emails: normalized.contactEmail ? [normalized.contactEmail] : [],
        source: normalized.channel,
        stage: "lead",
      },
    });
  } else if (!contact.name && normalized.contactName) {
    contact = await prisma.contact.update({
      where: { id: contact.id },
      data: { name: normalized.contactName },
    });
  }

  // Find an open conversation on this channel, else create one.
  let conversation = await prisma.conversation.findFirst({
    where: {
      workspaceId,
      contactId: contact.id,
      channel: normalized.channel,
      status: { notIn: ["closed"] },
    },
    orderBy: { lastMessageAt: "desc" },
  });
  if (!conversation) {
    conversation = await prisma.conversation.create({
      data: {
        workspaceId,
        contactId: contact.id,
        connectorId,
        channel: normalized.channel,
        status: "ai_handling",
      },
    });
  }

  // Dedupe by provider message id.
  const existing = await prisma.message.findFirst({
    where: { conversationId: conversation.id, providerMessageId: normalized.providerMessageId },
  });
  if (existing) {
    return { conversationId: conversation.id, messageId: existing.id, contactId: contact.id, deduped: true };
  }

  const message = await prisma.message.create({
    data: {
      workspaceId,
      conversationId: conversation.id,
      direction: "inbound",
      sender: "contact",
      contentType: normalized.media[0]?.type ?? "text",
      text: normalized.text,
      media: normalized.media as unknown as object[],
      providerMessageId: normalized.providerMessageId,
      deliveryStatus: "delivered",
    },
  });

  // Best-effort: pull WhatsApp inbound images down to our storage so they render
  // in the inbox and can be fed to the vision agent.
  if (normalized.channel === "whatsapp" && normalized.media.some((m) => m.type === "image")) {
    try {
      const connector = connectorId
        ? await prisma.channelConnector.findUnique({ where: { id: connectorId } })
        : null;
      const cfg = resolveConnectorConfig("whatsapp", connector?.encryptedConfig ?? null);
      const updated: MediaRef[] = [];
      for (const m of normalized.media) {
        if (m.type === "image" && m.storageKey) {
          const fetched = await fetchWhatsAppMedia(m.storageKey, cfg);
          if (fetched) {
            const key = `ws/${workspaceId}/media/${randomId("m", 8)}`;
            await putObject(key, fetched.buffer, fetched.mimeType);
            updated.push({ ...m, url: fileUrl(key), storageKey: key, mimeType: fetched.mimeType });
            continue;
          }
        }
        updated.push(m);
      }
      await prisma.message.update({
        where: { id: message.id },
        data: { media: updated as unknown as object[] },
      });
    } catch (e) {
      console.error("[pipeline] media fetch failed", (e as Error).message);
    }
  }

  const preview = normalized.text ?? (normalized.media.length ? "[media]" : "");
  await prisma.conversation.update({
    where: { id: conversation.id },
    data: {
      lastMessageAt: new Date(),
      lastMessagePreview: preview.slice(0, 160),
      unreadCount: { increment: 1 },
    },
  });

  await publishRealtime(workspaceId, SOCKET_EVENTS.messageCreated, {
    conversationId: conversation.id,
    message: serializeMessage(message),
  });
  await publishRealtime(workspaceId, SOCKET_EVENTS.conversationUpdated, {
    conversationId: conversation.id,
  });

  await triggerAi(conversation.id);

  return { conversationId: conversation.id, messageId: message.id, contactId: contact.id, deduped: false };
}

/** Dispatch the AI run (queue or inline). */
export async function triggerAi(conversationId: string): Promise<void> {
  if (useQueue()) {
    const convo = await prisma.conversation.findUnique({ where: { id: conversationId } });
    if (!convo) return;
    await aiRunQueue().add("run", {
      workspaceId: convo.workspaceId,
      conversationId,
      triggerMessageId: "",
    });
  } else {
    await runAiForConversation(conversationId);
  }
}

/** Run the AI for a conversation and send its reply. */
export async function runAiForConversation(conversationId: string): Promise<void> {
  const convo = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: { contact: true, workspace: true },
  });
  if (!convo) return;

  // Respect human takeover and autonomy settings.
  if (convo.status === "closed" || convo.status === "needs_human" || convo.assigneeId) return;

  const aiConfig = await prisma.aiConfig.findUnique({ where: { workspaceId: convo.workspaceId } });
  if (aiConfig?.autonomy === "off") return;

  const docs = await prisma.knowledgeDoc.findMany({ where: { workspaceId: convo.workspaceId } });
  const knowledge = docs.map((d) => d.content).join("\n\n---\n\n");

  const recent = await prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: "asc" },
    take: HISTORY_LIMIT,
  });
  const history: HistoryTurn[] = recent
    .filter((m) => m.text && m.sender !== "system")
    .map((m) => ({
      role: m.sender === "contact" ? ("user" as const) : ("assistant" as const),
      text: m.text!,
    }));
  if (history.length === 0 || history[history.length - 1]!.role !== "user") return;

  // Load any images on the latest inbound message for the vision agent.
  const lastInbound = [...recent].reverse().find((m) => m.direction === "inbound");
  const images = lastInbound ? await loadStoredImages(lastInbound.media) : [];

  const result = await runAgentTurn({
    workspaceId: convo.workspaceId,
    conversationId,
    contactId: convo.contactId,
    brandName: convo.workspace.brandName,
    persona: aiConfig?.persona ?? "",
    knowledge,
    autonomy: (aiConfig?.autonomy as "full_auto" | "assist" | "off") ?? "full_auto",
    model: aiConfig?.model,
    history,
    images: images.length ? images : undefined,
  });

  const aiMessage = await prisma.message.create({
    data: {
      workspaceId: convo.workspaceId,
      conversationId,
      direction: "outbound",
      sender: "ai",
      text: result.replyText,
      deliveryStatus: "pending",
      aiMeta: {
        model: result.model,
        mock: result.mock,
        tools: result.toolInvocations.map((t) => t.name),
        needsHuman: result.needsHuman,
      },
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

  // Audit notable tool actions.
  for (const t of result.toolInvocations) {
    if (["create_quote", "create_payment_link", "handoff_to_human"].includes(t.name)) {
      await prisma.auditEvent.create({
        data: {
          workspaceId: convo.workspaceId,
          actor: "ai",
          action: t.name,
          entityType: "conversation",
          entityId: conversationId,
          meta: { result: t.result } as object,
        },
      });
    }
  }

  await publishRealtime(convo.workspaceId, SOCKET_EVENTS.messageCreated, {
    conversationId,
    message: serializeMessage(aiMessage),
  });
  await publishRealtime(convo.workspaceId, SOCKET_EVENTS.conversationUpdated, {
    conversationId,
    status: result.needsHuman ? "needs_human" : "ai_handling",
  });

  // In assist mode the human sends; in full_auto we deliver immediately.
  if (aiConfig?.autonomy !== "assist") {
    await triggerSend(aiMessage.id);
  }
}

/** Dispatch an outbound send (queue or inline). */
export async function triggerSend(messageId: string): Promise<void> {
  if (useQueue()) {
    const msg = await prisma.message.findUnique({ where: { id: messageId } });
    if (!msg) return;
    await outboundQueue().add("send", {
      workspaceId: msg.workspaceId,
      conversationId: msg.conversationId,
      messageId,
    });
  } else {
    await sendOutboundMessage(messageId);
  }
}

/** Send one outbound message through its conversation's channel. */
export async function sendOutboundMessage(messageId: string): Promise<void> {
  const msg = await prisma.message.findUnique({
    where: { id: messageId },
    include: { conversation: { include: { contact: true, connector: true } } },
  });
  if (!msg || msg.direction !== "outbound") return;
  const convo = msg.conversation;
  const to = convo.contact.phones[0];

  let status: "sent" | "failed" = "failed";
  let providerMessageId: string | undefined;

  try {
    if (!to) throw new Error("contact has no destination address");
    const provider = getChannelProvider(convo.channel);
    const config = resolveConnectorConfig(convo.channel, convo.connector?.encryptedConfig ?? null);
    const media = (msg.media as unknown as MediaRef[]) ?? [];
    const res = await provider.send(
      to,
      { text: msg.text ?? undefined, media: media.length ? media : undefined },
      config,
    );
    status = res.status === "failed" ? "failed" : "sent";
    providerMessageId = res.providerMessageId;
  } catch (e) {
    console.error("[pipeline] send failed", (e as Error).message);
  }

  await prisma.message.update({
    where: { id: messageId },
    data: { deliveryStatus: status, providerMessageId },
  });
  await prisma.auditEvent.create({
    data: {
      workspaceId: msg.workspaceId,
      actor: msg.sender === "ai" ? "ai" : "human",
      action: "message.sent",
      entityType: "message",
      entityId: messageId,
      meta: { status } as object,
    },
  });
  await publishRealtime(msg.workspaceId, SOCKET_EVENTS.conversationUpdated, {
    conversationId: convo.id,
  });
}

/** Load up to 2 stored image attachments as base64 for the vision agent. */
async function loadStoredImages(
  media: unknown,
): Promise<{ base64: string; mimeType: string }[]> {
  const refs = (media as MediaRef[]) ?? [];
  const out: { base64: string; mimeType: string }[] = [];
  for (const m of refs) {
    if (m.type !== "image" || !m.storageKey || !m.storageKey.startsWith("ws/")) continue;
    const obj = await getObject(m.storageKey);
    if (obj) {
      out.push({ base64: obj.body.toString("base64"), mimeType: obj.contentType });
      if (out.length >= 2) break;
    }
  }
  return out;
}

function serializeMessage(m: {
  id: string;
  conversationId: string;
  direction: string;
  sender: string;
  text: string | null;
  createdAt: Date;
  deliveryStatus: string;
}) {
  return {
    id: m.id,
    conversationId: m.conversationId,
    direction: m.direction,
    sender: m.sender,
    text: m.text,
    createdAt: m.createdAt.toISOString(),
    deliveryStatus: m.deliveryStatus,
  };
}
