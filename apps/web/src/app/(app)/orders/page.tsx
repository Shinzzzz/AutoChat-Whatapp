import Link from "next/link";
import { prisma } from "@autochat/db";
import { requireWorkspace } from "../../../lib/session.js";
import { formatInr, timeAgo } from "../../../lib/money.js";
import { stageLabel } from "./[id]/pipeline.js";

export const dynamic = "force-dynamic";

export default async function OrdersPage() {
  const { workspace } = await requireWorkspace();
  const orders = await prisma.order.findMany({
    where: { workspaceId: workspace.id },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { contact: { select: { name: true, phones: true } } },
  });

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Orders</h1>
          <div className="sub muted">Quote → production → delivery. Click a row to manage.</div>
        </div>
      </div>
      <div className="banner">
        Payments (Razorpay) and shipment tracking (Shiprocket) run in mock mode until their
        keys are added in Settings — pricing, invoicing and the full lifecycle are live.
      </div>
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <table className="tbl">
          <thead>
            <tr>
              <th>Customer</th>
              <th>Configuration</th>
              <th>Qty</th>
              <th>Amount</th>
              <th>Stage</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => {
              const cfg = o.config as Record<string, unknown>;
              return (
                <tr key={o.id}>
                  <td style={{ fontWeight: 600 }}>
                    <Link href={`/orders/${o.id}`}>{o.contact.name ?? o.contact.phones[0] ?? "—"}</Link>
                  </td>
                  <td className="muted small">
                    {[cfg.model, cfg.size, cfg.material, cfg.water, cfg.shape].filter(Boolean).join(" · ")}
                  </td>
                  <td>{o.quantity}</td>
                  <td>{formatInr(o.totalPaise)}</td>
                  <td><Link href={`/orders/${o.id}`}><span className="tag">{stageLabel(o.stage)}</span></Link></td>
                  <td className="muted small">{timeAgo(o.createdAt)}</td>
                </tr>
              );
            })}
            {orders.length === 0 && (
              <tr><td colSpan={6} className="muted small">No orders yet. The AI creates one when a customer requests a quote.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
