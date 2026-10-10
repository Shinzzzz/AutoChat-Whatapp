"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { confirmScreenshotImport } from "@autochat/engine";
import { requireSession } from "../../../lib/session.js";

/** Confirm an extracted import → create/merge contact + conversation, AI takes over. */
export async function confirmImportAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const importId = String(formData.get("importId"));
  const result = await confirmScreenshotImport(session.workspaceId, importId, {
    name: (String(formData.get("name") || "").trim() || undefined) as string | undefined,
    phone: (String(formData.get("phone") || "").trim() || undefined) as string | undefined,
    email: (String(formData.get("email") || "").trim() || undefined) as string | undefined,
    enquiryType: (String(formData.get("enquiryType") || "").trim() || undefined) as string | undefined,
  });
  revalidatePath("/imports");
  if (result) redirect("/inbox");
}
