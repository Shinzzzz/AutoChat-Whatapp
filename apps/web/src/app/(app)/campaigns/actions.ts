"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@autochat/db";
import { sendCampaign } from "@autochat/engine";
import type { ChannelType, ContactStage } from "@autochat/core";
import { requireSession } from "../../../lib/session.js";

export async function createCampaign(formData: FormData): Promise<void> {
  const session = await requireSession();
  const name = String(formData.get("name") || "Untitled campaign").trim();
  const channel = String(formData.get("channel") || "whatsapp") as ChannelType;
  const stage = String(formData.get("stage") || "").trim();
  const tag = String(formData.get("tag") || "").trim();
  const text = String(formData.get("text") || "").trim();

  await prisma.campaign.create({
    data: {
      workspaceId: session.workspaceId,
      name,
      channel,
      audienceFilter: {
        ...(stage ? { stages: [stage as ContactStage] } : {}),
        ...(tag ? { tag } : {}),
      },
      message: { text },
      status: "draft",
    },
  });
  revalidatePath("/campaigns");
}

export async function sendCampaignAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const id = String(formData.get("campaignId"));
  // Ownership check.
  const campaign = await prisma.campaign.findFirst({ where: { id, workspaceId: session.workspaceId } });
  if (!campaign) return;
  await sendCampaign(id);
  revalidatePath("/campaigns");
  revalidatePath("/dashboard");
}
