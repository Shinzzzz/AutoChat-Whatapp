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
import {
  getCommerceProvider,
  priceQuote,
  acceptQuote,
  markOrderPaid,
  createOrderShipment,
  refreshTracking,
} from "@autochat/commerce";
import {
  processScreenshotImport,
  confirmScreenshotImport,
  sendCampaign,
  runMockVoiceCall,
  reindexWorkspace,
  distillConversation,
  approveLearnedItem,
} from "@autochat/engine";
import { retrieve } from "@autochat/ai";
import { putObject } from "@autochat/core/storage";

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

  // ── M2: full revenue path ─────────────────────────────────────────────
  const commerce = getCommerceProvider(ws.id);
  const draft = await commerce.createQuoteDraft({
    workspaceId: ws.id,
    contactId: result.contactId,
    conversationId: result.conversationId,
    spec: { model: "vanity", size: "500ml", material: "glass", water: "ro", quantity: 1000 },
  });
  await priceQuote(ws.id, draft.orderId, { unitPriceInr: 12, gstPercent: 18 });
  await acceptQuote(ws.id, draft.orderId);
  const link = await commerce.createPaymentLink(ws.id, draft.orderId);
  await markOrderPaid(ws.id, draft.orderId, "sim_pay_123");
  await createOrderShipment(ws.id, draft.orderId);
  await refreshTracking(ws.id, draft.orderId);

  const order = await prisma.order.findUniqueOrThrow({
    where: { id: draft.orderId },
    include: { shipment: true, payments: true },
  });
  console.log("\nRevenue path:");
  console.log(`  quote ₹12 × 1000 + 18% GST → total ${(order.totalPaise / 100).toLocaleString("en-IN")}`);
  console.log(`  payment link: ${link.url}${link.mock ? " (mock)" : ""}`);
  console.log(`  invoice: ${order.invoiceUrl}`);
  console.log(`  shipment: ${order.shipment?.status} (${order.shipment?.awb})`);

  // ── M3: screenshot import ─────────────────────────────────────────────
  const imgKey = `ws/${ws.id}/imports/smoke-${randomId("t", 6)}`;
  await putObject(imgKey, Buffer.from("fake-image-bytes"), "image/png");
  const imp = await prisma.screenshotImport.create({
    data: { workspaceId: ws.id, imageKey: imgKey, status: "pending" },
  });
  await processScreenshotImport(imp.id);
  const confirmed = await confirmScreenshotImport(ws.id, imp.id, {
    name: "Screenshot Lead",
    phone: "+919777000111",
  });
  const importMsgs = confirmed
    ? await prisma.message.findMany({ where: { conversationId: confirmed.conversationId } })
    : [];
  console.log("\nScreenshot import:");
  console.log(`  created conversation ${confirmed?.conversationId} with ${importMsgs.length} messages`);

  // ── M4: campaign send ─────────────────────────────────────────────────
  const campaign = await prisma.campaign.create({
    data: {
      workspaceId: ws.id,
      name: "Smoke festive offer",
      channel: "whatsapp",
      audienceFilter: {},
      message: { text: "Festive offer: 10% off branded bottles this month!" },
      status: "draft",
    },
  });
  const campaignResult = await sendCampaign(campaign.id);
  console.log("\nCampaign:");
  console.log(`  audience ${campaignResult.audience}, sent ${campaignResult.sent}, failed ${campaignResult.failed}`);

  // ── M5: voice call (mock) ─────────────────────────────────────────────
  const voice = confirmed
    ? await runMockVoiceCall(ws.id, confirmed.contactId, [
        "Hi, I want branded water for my cafe.",
        "What's the price for 500ml glass?",
      ])
    : null;
  console.log("\nVoice (mock) call:");
  voice?.turns.forEach((t) => console.log(`  🗣️ ${t.caller}\n  🤖 ${t.agent}`));

  // ── M6: RAG + learning ────────────────────────────────────────────────
  const indexed = await reindexWorkspace(ws.id);
  const hits = await retrieve(ws.id, "what shapes do the 1 litre glass bottles come in?", { k: 3 });
  const distilled = confirmed ? await distillConversation(result.conversationId) : 0;
  const pending = await prisma.learnedItem.findFirst({
    where: { workspaceId: ws.id, status: "pending" },
    orderBy: { createdAt: "desc" },
  });
  const beforeLearned = await prisma.knowledgeChunk.count({ where: { workspaceId: ws.id, source: "learned" } });
  if (pending) await approveLearnedItem(ws.id, pending.id);
  const afterLearned = await prisma.knowledgeChunk.count({ where: { workspaceId: ws.id, source: "learned" } });
  console.log("\nRAG + learning:");
  console.log(`  indexed ${indexed} chunks; top hit score ${hits[0]?.score.toFixed(3)} :: ${hits[0]?.text.slice(0, 70)}…`);
  console.log(`  distilled ${distilled} candidate(s); learned chunks ${beforeLearned} → ${afterLearned}`);

  console.log("\nAssertions:");
  const checks: [string, boolean][] = [
    ["inbound stored", messages.some((m) => m.sender === "contact")],
    ["AI replied", !!aiReply],
    ["reply mentions price", !!aiReply?.text && /₹|price/i.test(aiReply.text)],
    ["outbound marked sent", messages.some((m) => m.direction === "outbound" && m.deliveryStatus === "sent")],
    ["contact captured", !!(await prisma.contact.findFirst({ where: { workspaceId: ws.id, phones: { has: "+919000000001" } } }))],
    ["quote priced w/ GST", order.subtotalPaise === 1200000 && order.taxPaise === 216000 && order.totalPaise === 1416000],
    ["quotation PDF generated", !!order.quotationUrl],
    ["payment link created", !!order.razorpayLinkId && !!link.url],
    ["order marked paid", !!order.razorpayPaymentId],
    ["invoice PDF generated", !!order.invoiceUrl],
    ["payment row paid", order.payments.some((p) => p.status === "paid")],
    ["shipment created + tracked", !!order.shipment?.awb && !!order.shipment?.status],
    ["screenshot import extracted", (await prisma.screenshotImport.findUnique({ where: { id: imp.id } }))?.status === "confirmed"],
    ["import created conversation", !!confirmed?.conversationId],
    ["import AI replied", importMsgs.some((m) => m.sender === "ai")],
    ["campaign sent to audience", campaignResult.audience > 0 && campaignResult.sent > 0],
    ["voice call ran with agent replies", !!voice && voice.turns.length === 2 && voice.turns.every((t) => t.agent.length > 0)],
    ["knowledge indexed", indexed > 0],
    ["RAG retrieved a relevant chunk", hits.length > 0 && /shape|round|square|zen|pyramid/i.test(hits[0]?.text ?? "")],
    ["conversation distilled a learned item", distilled > 0 && !!pending],
    ["approval promoted it to a retrievable chunk", afterLearned === beforeLearned + 1],
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
