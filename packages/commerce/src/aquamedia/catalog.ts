import type { Catalog } from "../types.js";

/**
 * AquaMedia catalogue. Prices are NOT defined here — they live in the
 * PricingRule table (admin console) and are read live. This file only enumerates
 * the configurable dimensions the AI offers to customers.
 */
export const AQUAMEDIA_CATALOG: Catalog = {
  currency: "INR",
  notes:
    "1 litre glass bottles come in five shapes. Prices and minimum order quantities are set by the team and read live from pricing; never quote a hard-coded rate.",
  dimensions: [
    {
      key: "model",
      label: "Business model",
      options: [
        { key: "vanity", label: "Vanity (your brand, your bottle)" },
        {
          key: "ad_subsidized",
          label: "Ad-subsidized (free water for venues, brand-sponsored)",
        },
      ],
    },
    {
      key: "size",
      label: "Size",
      options: [
        { key: "250ml", label: "250 ml" },
        { key: "500ml", label: "500 ml" },
        { key: "1l", label: "1 litre" },
      ],
    },
    {
      key: "material",
      label: "Material",
      options: [
        { key: "pet", label: "PET" },
        { key: "glass", label: "Flint glass" },
      ],
    },
    {
      key: "water",
      label: "Water",
      options: [
        { key: "ro", label: "RO mineral" },
        { key: "himalayan", label: "Himalayan spring" },
      ],
    },
    {
      key: "shape",
      label: "Shape (1 L glass only)",
      options: [
        { key: "round", label: "Round", requires: { size: "1l", material: "glass" } },
        { key: "square", label: "Square", requires: { size: "1l", material: "glass" } },
        { key: "peace", label: "Peace", requires: { size: "1l", material: "glass" } },
        { key: "zen", label: "Zen", requires: { size: "1l", material: "glass" } },
        { key: "pyramid", label: "Pyramid", requires: { size: "1l", material: "glass" } },
      ],
    },
  ],
};

/** Indicative starting prices (paise) seeded into PricingRule. Team edits live. */
export const AQUAMEDIA_DEFAULT_PRICING = [
  // model, size, material, water, shape, unitPricePaise, minQty, turnaroundDays
  { model: "vanity", size: "250ml", material: "pet", water: "ro", shape: null, unitPricePaise: 800, minQty: 500, turnaroundDays: 10 },
  { model: "vanity", size: "500ml", material: "pet", water: "ro", shape: null, unitPricePaise: 1000, minQty: 500, turnaroundDays: 10 },
  { model: "vanity", size: "1l", material: "pet", water: "ro", shape: null, unitPricePaise: 1200, minQty: 500, turnaroundDays: 10 },
  { model: "ad_subsidized", size: "250ml", material: "pet", water: "ro", shape: null, unitPricePaise: 900, minQty: 5000, turnaroundDays: 14 },
  { model: "ad_subsidized", size: "500ml", material: "pet", water: "ro", shape: null, unitPricePaise: 1100, minQty: 5000, turnaroundDays: 14 },
  { model: "ad_subsidized", size: "1l", material: "pet", water: "ro", shape: null, unitPricePaise: 1300, minQty: 5000, turnaroundDays: 14 },
] as const;

/** The AquaMedia knowledge base seeded for the AI. Editable in Settings → AI. */
export const AQUAMEDIA_KNOWLEDGE = `# AquaMedia — business knowledge

AquaMedia turns packaged drinking water into branded media. We produce
custom-labelled bottled water for venues and brands across India — the bottle on
the table carries your name, your design and your QR code. A bottle sits in front
of real people for 45+ minutes; it can't be ad-blocked or scrolled past, and the
QR code bridges that physical moment to anything digital.

## Product
- Sizes: 250 ml, 500 ml, 1 litre
- Materials: PET or flint glass (1 L glass: Round, Square, Peace, Zen, Pyramid)
- Water: RO mineral or Himalayan spring
- FSSAI + BIS certified partners, tamper-evident seals, wrap-around waterproof label
- Delivered in Mumbai and major cities across India

## Two business models
1. Vanity — "your brand, your bottle." The venue pays and puts its own name on the
   water it serves (restaurants, hotels, weddings, resorts, corporate offices).
   Minimum order 500 bottles. Turnaround 7–10 working days.
2. Ad-subsidized — "free water for venues, high-dwell media for brands." A brand
   sponsors the bottles, partner venues serve them to guests free. The brand gets
   the ad surface + QR scan tracking; the venue gets premium water at no cost.
   Minimum campaign 5,000 bottles. Turnaround 10–14 working days.

There is also a Venue Partner Programme: venues apply to join the network, get
paired with a sponsoring brand, and receive scheduled deliveries of sponsored water.

## Pricing (IMPORTANT)
Published prices are indicative starting figures only. Live prices and minimum
order quantities are set by the team and can change at any time. ALWAYS read
current pricing with the get_pricing tool — never hard-code a rate into a chat
answer or a quote.

## How a sale works
Customer configures (model, size, material, water, quantity) → requests a quote →
the team reviews and sends a priced quotation (PDF) → the customer accepts → the
order moves through label design and proof approval, production, dispatch and
delivery → a GST invoice is issued, payable online by Razorpay.

Order stages: awaiting review → awaiting acceptance → approved → design review →
in production → dispatched → delivered (any open order can be cancelled).

## Contact
hello@aquamedia.in · +91 83848 03408 · Mumbai, Maharashtra, India`;
