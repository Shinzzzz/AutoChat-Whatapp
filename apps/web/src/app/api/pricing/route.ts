import { prisma } from "@autochat/db";
import { getCommerceProvider } from "@autochat/commerce";
import { apiSession, json } from "../../../lib/api.js";

export const dynamic = "force-dynamic";

/**
 * Live pricing. The AI reads pricing through the commerce provider directly;
 * this HTTP endpoint exposes the same numbers for the storefront and external
 * integrations. Scope: the signed-in workspace, or ?workspace=<slug> for a
 * public read.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const slug = url.searchParams.get("workspace");

  let workspaceId: string | null = null;
  if (slug) {
    const ws = await prisma.workspace.findUnique({ where: { slug } });
    workspaceId = ws?.id ?? null;
  } else {
    const session = await apiSession();
    workspaceId = session?.workspaceId ?? null;
  }
  if (!workspaceId) return json({ error: "workspace not found" }, 404);

  const provider = getCommerceProvider(workspaceId);
  const pricing = await provider.getPricing(workspaceId);
  return json({
    currency: "INR",
    note: "Indicative prices set by the team; subject to review.",
    pricing: pricing.map((p) => ({
      model: p.model,
      size: p.size,
      material: p.material,
      water: p.water,
      shape: p.shape ?? null,
      unitPriceInr: p.unitPricePaise / 100,
      minQty: p.minQty,
      turnaroundDays: p.turnaroundDays,
    })),
  });
}
