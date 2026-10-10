import { prisma } from "@autochat/db";
import { requireWorkspace } from "../../../lib/session.js";
import { updatePricingRule } from "./actions.js";

export const dynamic = "force-dynamic";

export default async function PricingPage() {
  const { workspace } = await requireWorkspace();
  const rules = await prisma.pricingRule.findMany({
    where: { workspaceId: workspace.id },
    orderBy: [{ model: "asc" }, { size: "asc" }],
  });

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Pricing</h1>
          <div className="sub muted">
            The admin console behind <code>GET /api/pricing</code>. The AI always reads these live.
          </div>
        </div>
      </div>

      <div className="card">
        <div className="grid" style={{ gap: 10 }}>
          <div style={{ display: "flex", gap: 10, fontSize: ".72rem", textTransform: "uppercase", color: "var(--text-muted)", fontWeight: 700 }}>
            <div style={{ flex: 2 }}>Configuration</div>
            <div style={{ width: 120 }}>Unit ₹</div>
            <div style={{ width: 120 }}>Min qty</div>
            <div style={{ width: 120 }}>Turnaround</div>
            <div style={{ width: 70 }}>Active</div>
            <div style={{ width: 80 }}></div>
          </div>
          {rules.map((r) => (
            <form
              key={r.id}
              action={updatePricingRule}
              style={{ display: "flex", gap: 10, alignItems: "center", borderTop: "1px solid var(--border)", paddingTop: 10 }}
            >
              <input type="hidden" name="id" value={r.id} />
              <div style={{ flex: 2 }}>
                <strong>{r.model}</strong>{" "}
                <span className="muted">{r.size} · {r.material} · {r.water}{r.shape ? ` · ${r.shape}` : ""}</span>
              </div>
              <div style={{ width: 120 }}>
                <input className="input" name="unitPriceInr" type="number" step="0.01" defaultValue={(r.unitPricePaise / 100).toString()} />
              </div>
              <div style={{ width: 120 }}>
                <input className="input" name="minQty" type="number" defaultValue={r.minQty} />
              </div>
              <div style={{ width: 120 }}>
                <input className="input" name="turnaroundDays" type="number" defaultValue={r.turnaroundDays} />
              </div>
              <div style={{ width: 70, textAlign: "center" }}>
                <input name="active" type="checkbox" defaultChecked={r.active} />
              </div>
              <div style={{ width: 80 }}>
                <button className="btn small primary" type="submit">Save</button>
              </div>
            </form>
          ))}
          {rules.length === 0 && (
            <div className="muted small">No pricing rules. Run the seed to load AquaMedia defaults.</div>
          )}
        </div>
      </div>
    </>
  );
}
