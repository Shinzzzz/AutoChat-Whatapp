import Anthropic from "@anthropic-ai/sdk";
import { getEnv, mockFlags } from "@autochat/core";
import { resolveModel } from "./model.js";

export interface Extraction {
  name?: string;
  phone?: string;
  email?: string;
  enquiryType?: string;
  summary: string;
  mock?: boolean;
}

const PROMPT = `You are reading a screenshot of a customer chat (e.g. WhatsApp/Instagram) that happened on another device.
Extract the customer's details and intent. Respond with ONLY a JSON object, no prose:
{"name": string|null, "phone": string|null, "email": string|null, "enquiryType": string|null, "summary": string}
- phone in international format if visible; enquiryType is a short tag (e.g. "vanity", "ad_subsidized", "pricing", "general").
- summary: one or two sentences describing what the customer wants.`;

/** Extract contact + enquiry details from a chat screenshot using Claude vision. */
export async function extractFromImage(
  base64: string,
  mimeType: string,
): Promise<Extraction> {
  if (mockFlags().ai) {
    return {
      name: "Imported Lead",
      enquiryType: "general",
      summary: "Imported from a chat screenshot (mock extraction — set ANTHROPIC_API_KEY for real vision).",
      mock: true,
    };
  }

  const client = new Anthropic({ apiKey: getEnv().ANTHROPIC_API_KEY });
  const res = await client.messages.create({
    model: resolveModel(null),
    max_tokens: 512,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: mimeType as "image/jpeg", data: base64 },
          },
          { type: "text", text: PROMPT },
        ],
      },
    ],
  });
  const text = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return { summary: text.slice(0, 280) || "Could not read the screenshot." };
  try {
    const parsed = JSON.parse(match[0]) as Extraction;
    return {
      name: parsed.name ?? undefined,
      phone: parsed.phone ?? undefined,
      email: parsed.email ?? undefined,
      enquiryType: parsed.enquiryType ?? undefined,
      summary: parsed.summary ?? "",
    };
  } catch {
    return { summary: text.slice(0, 280) };
  }
}
