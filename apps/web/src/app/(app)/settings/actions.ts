"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@autochat/db";
import { encryptSecret } from "@autochat/core";
import { requireSession } from "../../../lib/session.js";

export async function updateBranding(formData: FormData): Promise<void> {
  const session = await requireSession();
  await prisma.workspace.update({
    where: { id: session.workspaceId },
    data: {
      brandName: String(formData.get("brandName") || "AutoChat").slice(0, 60),
      primaryColor: String(formData.get("primaryColor") || "#4f46e5"),
      accentColor: String(formData.get("accentColor") || "#06b6d4"),
      logoUrl: (String(formData.get("logoUrl") || "").trim() || null) as string | null,
    },
  });
  revalidatePath("/settings");
}

export async function updateAiConfig(formData: FormData): Promise<void> {
  const session = await requireSession();
  const autonomy = String(formData.get("autonomy") || "full_auto");
  const persona = String(formData.get("persona") || "");
  await prisma.aiConfig.upsert({
    where: { workspaceId: session.workspaceId },
    update: { persona, autonomy: autonomy as "full_auto" | "assist" | "off" },
    create: {
      workspaceId: session.workspaceId,
      persona,
      autonomy: autonomy as "full_auto" | "assist" | "off",
    },
  });
  revalidatePath("/settings");
}

export async function saveWhatsAppConnector(formData: FormData): Promise<void> {
  const session = await requireSession();
  const config = {
    phoneNumberId: String(formData.get("phoneNumberId") || "").trim(),
    accessToken: String(formData.get("accessToken") || "").trim(),
    verifyToken: String(formData.get("verifyToken") || "").trim(),
    appSecret: String(formData.get("appSecret") || "").trim(),
  };
  const connected = Boolean(config.phoneNumberId && config.accessToken);
  await prisma.channelConnector.upsert({
    where: { workspaceId_type: { workspaceId: session.workspaceId, type: "whatsapp" } },
    update: {
      encryptedConfig: encryptSecret(JSON.stringify(config)),
      status: connected ? "connected" : "disconnected",
      meta: { phoneNumberId: config.phoneNumberId },
      lastCheckAt: new Date(),
    },
    create: {
      workspaceId: session.workspaceId,
      type: "whatsapp",
      label: "WhatsApp Business",
      encryptedConfig: encryptSecret(JSON.stringify(config)),
      status: connected ? "connected" : "disconnected",
      meta: { phoneNumberId: config.phoneNumberId },
    },
  });
  revalidatePath("/settings");
  revalidatePath("/dashboard");
}

async function upsertConnector(
  workspaceId: string,
  type: "instagram" | "email" | "webhook",
  label: string,
  config: Record<string, string>,
  connected: boolean,
  meta: Record<string, string> = {},
) {
  await prisma.channelConnector.upsert({
    where: { workspaceId_type: { workspaceId, type } },
    update: {
      encryptedConfig: encryptSecret(JSON.stringify(config)),
      status: connected ? "connected" : "disconnected",
      meta,
      lastCheckAt: new Date(),
    },
    create: {
      workspaceId,
      type,
      label,
      encryptedConfig: encryptSecret(JSON.stringify(config)),
      status: connected ? "connected" : "disconnected",
      meta,
    },
  });
  revalidatePath("/settings");
  revalidatePath("/dashboard");
}

export async function saveInstagramConnector(formData: FormData): Promise<void> {
  const session = await requireSession();
  const config = {
    igId: String(formData.get("igId") || "").trim(),
    accessToken: String(formData.get("accessToken") || "").trim(),
    verifyToken: String(formData.get("verifyToken") || "").trim(),
    appSecret: String(formData.get("appSecret") || "").trim(),
  };
  await upsertConnector(session.workspaceId, "instagram", "Instagram DMs", config, !!(config.igId && config.accessToken), { igId: config.igId });
}

export async function saveEmailConnector(formData: FormData): Promise<void> {
  const session = await requireSession();
  const config = { fromEmail: String(formData.get("fromEmail") || "").trim() };
  await upsertConnector(session.workspaceId, "email", "Email", config, !!config.fromEmail, { fromEmail: config.fromEmail });
}

export async function saveWebhookConnector(formData: FormData): Promise<void> {
  const session = await requireSession();
  const config = {
    secret: String(formData.get("secret") || "").trim(),
    outboundUrl: String(formData.get("outboundUrl") || "").trim(),
  };
  await upsertConnector(session.workspaceId, "webhook", "Generic Webhook / API", config, true, {});
}
