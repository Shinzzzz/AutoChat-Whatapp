import { prisma } from "@autochat/db";
import { randomId } from "@autochat/core";
import { putObject } from "@autochat/core/storage";
import { processScreenshotImport } from "@autochat/engine";
import { apiSession, json, unauthorized } from "../../../lib/api.js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Upload a chat screenshot → store it → run Claude vision extraction. */
export async function POST(req: Request) {
  const session = await apiSession();
  if (!session) return unauthorized();

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return json({ error: "file required" }, 400);

  const buf = Buffer.from(await file.arrayBuffer());
  const key = `ws/${session.workspaceId}/imports/${randomId("imp", 8)}`;
  await putObject(key, buf, file.type || "image/jpeg");

  const imp = await prisma.screenshotImport.create({
    data: {
      workspaceId: session.workspaceId,
      uploaderId: session.userId,
      imageKey: key,
      status: "pending",
    },
  });
  await processScreenshotImport(imp.id);

  const updated = await prisma.screenshotImport.findUnique({ where: { id: imp.id } });
  return json({ id: imp.id, status: updated?.status, extracted: updated?.extracted });
}
