import { PrismaClient, Prisma } from "@prisma/client";
import { hashPassword } from "@autochat/core";

const prisma = new PrismaClient();

// Seed owns its seed values (kept independent of @autochat/commerce to avoid a
// package cycle). These mirror the AquaMedia catalogue/knowledge defaults.
const DEFAULT_PRICING = [
  { model: "vanity", size: "250ml", material: "pet", water: "ro", shape: null, unitPricePaise: 800, minQty: 500, turnaroundDays: 10 },
  { model: "vanity", size: "500ml", material: "pet", water: "ro", shape: null, unitPricePaise: 1000, minQty: 500, turnaroundDays: 10 },
  { model: "vanity", size: "1l", material: "pet", water: "ro", shape: null, unitPricePaise: 1200, minQty: 500, turnaroundDays: 10 },
  { model: "ad_subsidized", size: "250ml", material: "pet", water: "ro", shape: null, unitPricePaise: 900, minQty: 5000, turnaroundDays: 14 },
  { model: "ad_subsidized", size: "500ml", material: "pet", water: "ro", shape: null, unitPricePaise: 1100, minQty: 5000, turnaroundDays: 14 },
  { model: "ad_subsidized", size: "1l", material: "pet", water: "ro", shape: null, unitPricePaise: 1300, minQty: 5000, turnaroundDays: 14 },
];

const KNOWLEDGE = `# AquaMedia — business knowledge

AquaMedia turns packaged drinking water into branded media: custom-labelled
bottled water for venues and brands across India. A bottle sits in front of real
people for 45+ minutes and a QR code on the label bridges that moment to anything
digital.

## Product
- Sizes: 250 ml, 500 ml, 1 litre
- Materials: PET or flint glass (1 L glass shapes: Round, Square, Peace, Zen, Pyramid)
- Water: RO mineral or Himalayan spring
- FSSAI + BIS certified partners, tamper-evident seals, wrap-around waterproof label
- Delivered in Mumbai and major cities across India

## Two business models
1. Vanity — "your brand, your bottle." Minimum 500 bottles, 7–10 working days.
2. Ad-subsidized — brand sponsors bottles, venues serve them free. Minimum 5,000
   bottles, 10–14 working days.
Plus a Venue Partner Programme pairing venues with sponsoring brands.

## Pricing (IMPORTANT)
Published prices are indicative only; the team sets live prices and minimums.
ALWAYS read current pricing with get_pricing — never hard-code a rate.

## How a sale works
Configure (model, size, material, water, quantity) → request a quote → team
reviews and sends a priced quotation → customer accepts → design/proof →
production → dispatch → delivery → GST invoice payable by Razorpay.
Order stages: awaiting review → awaiting acceptance → approved → design review →
in production → dispatched → delivered (any open order can be cancelled).

## Contact
hello@aquamedia.in · +91 83848 03408 · Mumbai, Maharashtra, India`;

const PERSONA = `Warm, concise and professional. You represent a premium branded-water studio.
Speak like a helpful sales associate: ask one or two focused questions at a time,
never overwhelm, and always move toward a quote or a clear next step.`;

async function main() {
  const workspace = await prisma.workspace.upsert({
    where: { slug: "aquamedia" },
    update: {},
    create: {
      slug: "aquamedia",
      name: "AquaMedia",
      brandName: "AquaMedia",
      primaryColor: "#0ea5e9",
      accentColor: "#0369a1",
    },
  });

  // Owner user.
  const email = "admin@aquamedia.in";
  const password = "autochat123";
  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      name: "AquaMedia Admin",
      passwordHash: await hashPassword(password),
    },
  });
  await prisma.membership.upsert({
    where: { userId_workspaceId: { userId: user.id, workspaceId: workspace.id } },
    update: { role: "owner" },
    create: { userId: user.id, workspaceId: workspace.id, role: "owner" },
  });

  // AI config + knowledge.
  await prisma.aiConfig.upsert({
    where: { workspaceId: workspace.id },
    update: {},
    create: {
      workspaceId: workspace.id,
      persona: PERSONA,
      autonomy: "full_auto",
      enabledTools: [
        "get_pricing",
        "get_catalog",
        "upsert_contact",
        "create_quote",
        "get_order_status",
        "get_tracking_status",
        "create_payment_link",
        "handoff_to_human",
        "schedule_followup",
      ],
    },
  });
  const existingDoc = await prisma.knowledgeDoc.findFirst({
    where: { workspaceId: workspace.id, title: "Business knowledge" },
  });
  if (!existingDoc) {
    await prisma.knowledgeDoc.create({
      data: { workspaceId: workspace.id, title: "Business knowledge", content: KNOWLEDGE },
    });
  }
  // Note: run Settings → "Reindex all" (or the worker's `index` script) to embed
  // docs for RAG; kept out of the DB seed to avoid a package cycle (engine→db).

  // Pricing rules (findFirst + create/update to handle the nullable `shape` key).
  for (const r of DEFAULT_PRICING) {
    const existing = await prisma.pricingRule.findFirst({
      where: {
        workspaceId: workspace.id,
        model: r.model,
        size: r.size,
        material: r.material,
        water: r.water,
        shape: r.shape,
      },
    });
    if (existing) {
      await prisma.pricingRule.update({
        where: { id: existing.id },
        data: { unitPricePaise: r.unitPricePaise, minQty: r.minQty, turnaroundDays: r.turnaroundDays },
      });
    } else {
      await prisma.pricingRule.create({ data: { workspaceId: workspace.id, ...r } });
    }
  }

  // Channel connectors with representative statuses for the dashboard.
  const hasWa = Boolean(process.env.WHATSAPP_PHONE_NUMBER_ID && process.env.WHATSAPP_ACCESS_TOKEN);
  const connectors: {
    type: "whatsapp" | "instagram" | "email" | "webhook" | "voice";
    label: string;
    status: "connected" | "disconnected" | "coming_soon";
    meta?: Prisma.InputJsonValue;
  }[] = [
    { type: "whatsapp", label: "WhatsApp Business", status: hasWa ? "connected" : "disconnected", meta: { mock: !hasWa } },
    { type: "instagram", label: "Instagram DMs", status: "disconnected" },
    { type: "email", label: "Email", status: "disconnected" },
    { type: "webhook", label: "Generic Webhook / API", status: "connected" },
    { type: "voice", label: "Voice caller", status: "coming_soon" },
  ];
  for (const c of connectors) {
    await prisma.channelConnector.upsert({
      where: { workspaceId_type: { workspaceId: workspace.id, type: c.type } },
      update: { label: c.label, status: c.status, meta: c.meta ?? {} },
      create: { workspaceId: workspace.id, type: c.type, label: c.label, status: c.status, meta: c.meta ?? {} },
    });
  }

  // Sample contact + conversation so the inbox isn't empty on first run.
  const contact = await prisma.contact.upsert({
    where: { id: "seed-contact-ravi" },
    update: {},
    create: {
      id: "seed-contact-ravi",
      workspaceId: workspace.id,
      name: "Ravi Shah",
      phones: ["+918384803408"],
      stage: "lead",
      source: "whatsapp",
      customFields: { enquiryType: "vanity" },
    },
  });
  const convo = await prisma.conversation.upsert({
    where: { id: "seed-convo-ravi" },
    update: {},
    create: {
      id: "seed-convo-ravi",
      workspaceId: workspace.id,
      contactId: contact.id,
      channel: "whatsapp",
      status: "ai_handling",
      lastMessageAt: new Date(),
      lastMessagePreview: "I want 1000 branded 500ml glass bottles",
    },
  });
  const count = await prisma.message.count({ where: { conversationId: convo.id } });
  if (count === 0) {
    await prisma.message.createMany({
      data: [
        {
          workspaceId: workspace.id,
          conversationId: convo.id,
          direction: "inbound",
          sender: "contact",
          text: "Hi, I want 1000 branded 500ml glass bottles for my restaurant. How much?",
          deliveryStatus: "delivered",
        },
        {
          workspaceId: workspace.id,
          conversationId: convo.id,
          direction: "outbound",
          sender: "ai",
          text: "Great choice! Indicative starting price for 500ml is ₹10/bottle (final price confirmed by our team). Is this for your own brand (vanity) or a sponsored campaign? I'll prepare a quote.",
          deliveryStatus: "sent",
          aiMeta: { model: "mock", tools: ["get_pricing"] },
        },
      ],
    });
  }

  console.log("Seed complete.");
  console.log(`  Workspace: ${workspace.name} (${workspace.slug})`);
  console.log(`  Login:     ${email} / ${password}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
