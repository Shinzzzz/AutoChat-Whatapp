"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@autochat/db";
import { requireSession } from "../../../lib/session.js";

/** Update a single pricing rule (unit price in rupees, min qty, turnaround, active). */
export async function updatePricingRule(formData: FormData): Promise<void> {
  const session = await requireSession();
  const id = String(formData.get("id"));
  const rule = await prisma.pricingRule.findFirst({
    where: { id, workspaceId: session.workspaceId },
  });
  if (!rule) return;

  const unitPriceInr = Number(formData.get("unitPriceInr"));
  const minQty = Number(formData.get("minQty"));
  const turnaroundDays = Number(formData.get("turnaroundDays"));
  const active = formData.get("active") === "on";

  await prisma.pricingRule.update({
    where: { id },
    data: {
      unitPricePaise: Math.max(0, Math.round(unitPriceInr * 100)),
      minQty: Math.max(0, Math.round(minQty)),
      turnaroundDays: Math.max(0, Math.round(turnaroundDays)),
      active,
    },
  });
  revalidatePath("/pricing");
}
