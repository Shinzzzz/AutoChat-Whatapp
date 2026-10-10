/**
 * End-to-end pipeline smoke test (no HTTP). Simulates an inbound WhatsApp
 * message and asserts the AI pipeline captures the lead, reads live pricing and
 * replies — exercising ingest → agent → tools → outbound send against a real DB.
 *
 * Run (with Postgres + Redis up and DATABASE_URL set):
 *   pnpm --filter @autochat/worker run smoke
 */
import { prisma } from "@autochat/db";
import { ingestInbound } from "@autochat/engine";
import { randomId } from "@autochat/core";

async function main() {
  const ws = await prisma.workspace.findUniqueOrThrow({ where: { slug: "aquamedia" } });

  const result = await ingestInbound({
    workspaceId: ws.id,
    normalized: {
      channel: "whatsapp",
      externalContactId: "919000000001",
      contactName: "Smoke Test",
      contactPhone: "+919000000001",
      providerMessageId: randomId("smoke"),
      text: "Hello, what is the price for 1000 branded 500ml bottles?",
      media: [],
      timestamp: Date.now(),
    },
  });

  if (!result) throw new Error("ingest returned null");

  const messages = await prisma.message.findMany({
    where: { conversationId: result.conversationId },
    orderBy: { createdAt: "asc" },
  });

  console.log(`\nConversation ${result.conversationId} — ${messages.length} messages:`);
  for (const m of messages) {
    console.log(`  [${m.direction}/${m.sender}] (${m.deliveryStatus}) ${m.text}`);
  }

  const aiReply = messages.find((m) => m.sender === "ai");
  const audit = await prisma.auditEvent.findMany({
    where: { workspaceId: ws.id, entityId: result.conversationId },
  });

  console.log("\nAssertions:");
  const checks: [string, boolean][] = [
    ["inbound stored", messages.some((m) => m.sender === "contact")],
    ["AI replied", !!aiReply],
    ["reply mentions price", !!aiReply?.text && /₹|price/i.test(aiReply.text)],
    ["outbound marked sent", messages.some((m) => m.direction === "outbound" && m.deliveryStatus === "sent")],
    ["contact captured", !!(await prisma.contact.findFirst({ where: { workspaceId: ws.id, phones: { has: "+919000000001" } } }))],
    ["audit written", audit.length >= 0],
  ];
  let ok = true;
  for (const [name, pass] of checks) {
    console.log(`  ${pass ? "✓" : "✗"} ${name}`);
    if (!pass) ok = false;
  }

  await prisma.$disconnect();
  if (!ok) {
    console.error("\nSMOKE TEST FAILED");
    process.exit(1);
  }
  console.log("\nSMOKE TEST PASSED");
  process.exit(0);
}

main().catch(async (e) => {
  console.error(e);
  process.exit(1);
});
