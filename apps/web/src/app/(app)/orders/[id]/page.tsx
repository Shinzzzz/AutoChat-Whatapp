import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@autochat/db";
import { stageLabel, ORDER_STAGES_LABELS } from "./pipeline.js";
import { requireWorkspace } from "../../../../lib/session.js";
import { formatInr } from "../../../../lib/money.js";
import {
  priceQuoteAction,
  acceptQuoteAction,
  advanceStageAction,
  cancelOrderAction,
  paymentLinkAction,
  createShipmentAction,
  refreshTrackingAction,
  simulatePaidAction,
} from "./actions.js";

export const dynamic = "force-dynamic";

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { workspace } = await requireWorkspace();
  const { id } = await params;
  const order = await prisma.order.findFirst({
    where: { id, workspaceId: workspace.id },
    include: { contact: true, quote: true, shipment: true, payments: true },
  });
  if (!order) notFound();

  const cfg = order.config as Record<string, unknown>;
  const configLabel = [cfg.model, cfg.size, cfg.material, cfg.water, cfg.shape].filter(Boolean).join(" · ");
  const paid = !!order.razorpayPaymentId;
  const terminal = order.stage === "delivered" || order.stage === "cancelled";

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Order {order.id.slice(-6).toUpperCase()}</h1>
          <div className="sub muted">
            <Link href="/orders">← Orders</Link> · {order.contact.name ?? order.contact.phones[0]}
          </div>
        </div>
        <span className="tag">{stageLabel(order.stage)}</span>
      </div>

      {/* Stage pipeline */}
      <div className="card" style={{ marginBottom: 16 }}>
        <h3>Pipeline</h3>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
          {ORDER_STAGES_LABELS.map((s) => {
            const active = s.key === order.stage;
            const done = ORDER_STAGES_LABELS.findIndex((x) => x.key === order.stage) >= ORDER_STAGES_LABELS.findIndex((x) => x.key === s.key);
            return (
              <span key={s.key} className="pill" style={{ background: active ? "var(--brand-primary)" : done ? "color-mix(in srgb, var(--brand-primary) 15%, transparent)" : "var(--surface-2)", color: active ? "var(--brand-primary-contrast)" : "var(--text)" }}>
                {s.label}
              </span>
            );
          })}
        </div>
        {order.stage === "cancelled" && <div className="banner" style={{ marginTop: 12 }}>This order was cancelled.</div>}
      </div>

      <div className="grid cols-2">
        {/* Summary + quote */}
        <div className="card">
          <h3>Order</h3>
          <table className="tbl" style={{ marginTop: 8 }}>
            <tbody>
              <tr><td className="muted">Configuration</td><td>{configLabel}</td></tr>
              <tr><td className="muted">Quantity</td><td>{order.quantity.toLocaleString("en-IN")}</td></tr>
              <tr><td className="muted">Subtotal</td><td>{formatInr(order.subtotalPaise)}</td></tr>
              <tr><td className="muted">GST</td><td>{formatInr(order.taxPaise)}</td></tr>
              <tr><td className="muted">Total</td><td style={{ fontWeight: 700 }}>{formatInr(order.totalPaise)}</td></tr>
              {order.quotationUrl && <tr><td className="muted">Quotation</td><td><a href={order.quotationUrl} target="_blank" rel="noreferrer">PDF ↗</a></td></tr>}
              {order.invoiceUrl && <tr><td className="muted">Invoice</td><td><a href={order.invoiceUrl} target="_blank" rel="noreferrer">PDF ↗</a></td></tr>}
            </tbody>
          </table>

          {/* Price a quote */}
          {order.stage === "awaiting_review" && (
            <form action={priceQuoteAction} style={{ marginTop: 14, borderTop: "1px solid var(--border)", paddingTop: 12 }}>
              <input type="hidden" name="orderId" value={order.id} />
              <div style={{ display: "flex", gap: 8, alignItems: "end" }}>
                <div className="field" style={{ margin: 0, flex: 1 }}>
                  <label>Unit price (₹)</label>
                  <input className="input" name="unitPriceInr" type="number" step="0.01" defaultValue={order.quantity ? (order.subtotalPaise / order.quantity / 100).toString() : ""} />
                </div>
                <div className="field" style={{ margin: 0, width: 90 }}>
                  <label>GST %</label>
                  <input className="input" name="gstPercent" type="number" defaultValue="18" />
                </div>
                <button className="btn primary" type="submit">Price &amp; send quote</button>
              </div>
            </form>
          )}
          {order.stage === "awaiting_acceptance" && (
            <form action={acceptQuoteAction} style={{ marginTop: 14 }}>
              <input type="hidden" name="orderId" value={order.id} />
              <button className="btn primary" type="submit">Mark quote accepted</button>
            </form>
          )}
        </div>

        {/* Payment + shipment + stage controls */}
        <div className="card">
          <h3>Fulfilment</h3>
          <table className="tbl" style={{ marginTop: 8 }}>
            <tbody>
              <tr><td className="muted">Payment</td><td>{paid ? <span className="pill connected"><span className="led" />paid</span> : "unpaid"}</td></tr>
              {order.razorpayLinkId && <tr><td className="muted">Payment link</td><td className="small">{order.razorpayLinkId}</td></tr>}
              <tr><td className="muted">Shipment</td><td>{order.shipment ? `${order.shipment.status}${order.shipment.awb ? ` · ${order.shipment.awb}` : ""}` : "—"}</td></tr>
              {order.shipment?.trackingUrl && <tr><td className="muted">Tracking</td><td><a href={order.shipment.trackingUrl} target="_blank" rel="noreferrer">Track ↗</a></td></tr>}
            </tbody>
          </table>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 14 }}>
            {!terminal && (
              <form action={advanceStageAction}><input type="hidden" name="orderId" value={order.id} /><button className="btn" type="submit">Advance stage →</button></form>
            )}
            {!paid && order.totalPaise > 0 && (
              <form action={paymentLinkAction}><input type="hidden" name="orderId" value={order.id} /><button className="btn" type="submit">Create payment link</button></form>
            )}
            {!order.shipment && (
              <form action={createShipmentAction}><input type="hidden" name="orderId" value={order.id} /><button className="btn" type="submit">Create shipment</button></form>
            )}
            {order.shipment && (
              <form action={refreshTrackingAction}><input type="hidden" name="orderId" value={order.id} /><button className="btn" type="submit">Refresh tracking</button></form>
            )}
            {!terminal && (
              <form action={cancelOrderAction}><input type="hidden" name="orderId" value={order.id} /><button className="btn" type="submit">Cancel</button></form>
            )}
          </div>

          {!paid && (
            <form action={simulatePaidAction} style={{ marginTop: 10 }}>
              <input type="hidden" name="orderId" value={order.id} />
              <button className="btn small" type="submit">Simulate payment (demo)</button>
            </form>
          )}
        </div>
      </div>
    </>
  );
}
