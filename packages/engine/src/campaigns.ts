import { prisma } from "@autochat/db";
import { SOCKET_EVENTS, type ChannelType, type ContactStage } from "@autochat/core";
import { getChannelProvider, hasChannelProvider } from "@autochat/channels";
import { resolveConnectorConfig } from "./config.js";
import { publishRealtime } from "./realtime.js";

export interface AudienceFilter {
  stages?: ContactStage[];
  tag?: string;
}

/** Resolve the contacts a campaign targets. */
export async function buildAudience(workspaceId: string, filter: AudienceFilter) {
  return prisma.contact.findMany({
    where: {
      workspaceId,
      ...(filter.stages?.length ? { stage: { in: filter.stages } } : {}),
      ...(filter.tag ? { tags: { has: filter.tag } } : {}),
    },
  });
}

function destinationFor(channel: ChannelType, contact: { phones: string[]; emails: string[]; handles: unknown }): string | null {
  const handles = (contact.handles as Record<string, string>) ?? {};
  switch (channel) {
    case "whatsapp":
      return contact.phones[0] ?? null;
    case "email":
      return contact.emails[0] ?? null;
    case "instagram":
      return handles.instagram ?? null;
    case "webhook":
      return contact.phones[0] ?? contact.emails[0] ?? null;
    default:
      return null;
  }
}

/** Send a campaign to its audience now. Creates/reuses a conversation per
 *  contact so replies thread back into the inbox and the AI can follow up. */
export async function sendCampaign(
  campaignId: string,
): Promise<{ audience: number; sent: number; failed: number }> {
  const campaign = await prisma.campaign.findUniqueOrThrow({ where: { id: campaignId } });
  const workspaceId = campaign.workspaceId;
  const channel = campaign.channel;
  const text = (campaign.message as { text?: string }).text ?? "";

  await prisma.campaign.update({ where: { id: campaignId }, data: { status: "sending" } });

  const audience = await buildAudience(workspaceId, campaign.audienceFilter as AudienceFilter);
  const connector = await prisma.channelConnector.findFirst({ where: { workspaceId, type: channel } });
  const config = resolveConnectorConfig(channel, connector?.encryptedConfig ?? null);

  let sent = 0;
  let failed = 0;

  for (const contact of audience) {
    const consent = (contact.consent as Record<string, boolean>) ?? {};
    const dest = destinationFor(channel, contact);
    if (!dest || consent[channel] === false || !hasChannelProvider(channel)) {
      failed++;
      await prisma.campaignRecipient.create({
        data: { campaignId, contactId: contact.id, status: "skipped", error: !dest ? "no destination" : "no consent/provider" },
      });
      continue;
    }

    let conversation = await prisma.conversation.findFirst({
      where: { workspaceId, contactId: contact.id, channel, status: { notIn: ["closed"] } },
      orderBy: { lastMessageAt: "desc" },
    });
    conversation ??= await prisma.conversation.create({
      data: { workspaceId, contactId: contact.id, connectorId: connector?.id, channel, status: "ai_handling" },
    });

    const message = await prisma.message.create({
      data: {
        workspaceId,
        conversationId: conversation.id,
        direction: "outbound",
        sender: "ai",
        text,
        deliveryStatus: "pending",
        aiMeta: { campaignId },
      },
    });

    let status: "sent" | "failed" = "failed";
    try {
      const res = await getChannelProvider(channel).send(dest, { text }, config);
      status = res.status === "failed" ? "failed" : "sent";
      await prisma.message.update({
        where: { id: message.id },
        data: { deliveryStatus: status, providerMessageId: res.providerMessageId },
      });
    } catch {
      /* leave failed */
    }
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { lastMessageAt: new Date(), lastMessagePreview: text.slice(0, 160) },
    });
    await prisma.campaignRecipient.create({
      data: { campaignId, contactId: contact.id, status, sentAt: new Date() },
    });
    if (status === "sent") sent++;
    else failed++;
  }

  await prisma.campaign.update({
    where: { id: campaignId },
    data: {
      status: "sent",
      metrics: { audience: audience.length, sent, failed } as object,
    },
  });
  await publishRealtime(workspaceId, SOCKET_EVENTS.dashboardStats, { campaignId, sent });

  return { audience: audience.length, sent, failed };
}
