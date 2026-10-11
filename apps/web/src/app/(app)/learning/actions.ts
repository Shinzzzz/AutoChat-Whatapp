"use server";

import { revalidatePath } from "next/cache";
import { approveLearnedItem, rejectLearnedItem } from "@autochat/engine";
import { requireSession } from "../../../lib/session.js";

export async function approveAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const id = String(formData.get("id"));
  await approveLearnedItem(session.workspaceId, id, {
    question: (String(formData.get("question") ?? "").trim() || undefined) as string | undefined,
    answer: String(formData.get("answer") ?? "").trim() || undefined,
  });
  revalidatePath("/learning");
  revalidatePath("/settings");
  revalidatePath("/dashboard");
}

export async function rejectAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  await rejectLearnedItem(session.workspaceId, String(formData.get("id")));
  revalidatePath("/learning");
}
