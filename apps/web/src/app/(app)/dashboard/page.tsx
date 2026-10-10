import Link from "next/link";
import { prisma } from "@autochat/db";
import { stageLabel } from "@autochat/commerce";
import type { OrderStage } from "@autochat/core";
import { requireWorkspace } from "../../../lib/session.js";
import { formatInr, timeAgo } from "../../../lib/money.js";

const CONNECTOR_LABELS: Record<string, string> = {
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  email: "Email",
  webhook: "Webhook / API",
  voice: "Voice caller",
};

export default async function DashboardPage() {
  const { workspace } = await requireWorkspace();
  const wsId = workspace.id;
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const [
    connectors,
    openConvos,
    needsHuman,
    totalContacts,
    leadsToday,
    orders,
    paidAgg,
    quotes,
    recent,
  ] = await Promise.all([
    prisma.channelConnector.findMany({ where: { workspaceId: wsId }, orderBy: { createdAt: "asc" } }),
    prisma.conversation.count({ where: { workspaceId: wsId, status: { in: ["open", "ai_handling"] } } }),
    prisma.conversation.count({ where: { workspaceId: wsId, status: "needs_human" } }),
    prisma.contact.count({ where: { workspaceId: wsId } }),
    prisma.contact.count({ where: { workspaceId: wsId, createdAt: { gte: startOfDay } } }),
    prisma.order.groupBy({ by: ["stage"], where: { workspaceId: wsId }, _count: true }),
    prisma.order.aggregate({ where: { workspaceId: wsId, razorpayPaymentId: { not: null } }, _sum: { totalPaise: true } }),
    prisma.quote.count({ where: { workspaceId: wsId } }),
    prisma.auditEvent.findMany({ where: { workspaceId: wsId }, orderBy: { createdAt: "desc" }, take: 8 }),
  ]);

  const revenue = paidAgg._sum.totalPaise ?? 0;
  const ordersByStage = new Map<string, number>(orders.map((o) => [o.stage, o._count]));

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Dashboard</h1>
          <div className="sub muted">Live view of connectors, conversations and pipeline.</div>
        </div>
        <Link className="btn primary" href="/inbox">Open inbox</Link>
      </div>

      {/* KPIs */}
      <div className="grid cols-4" style={{ marginBottom: 16 }}>
        <div className="card">
          <h3>Open conversations</h3>
          <div className="stat">{openConvos}</div>
          <div className="small muted">AI is handling these</div>
        </div>
        <div className="card">
          <h3>Needs a human</h3>
          <div className="stat" style={{ color: needsHuman ? "var(--err)" : undefined }}>{needsHuman}</div>
          <div className="small muted">Escalated by the AI</div>
        </div>
        <div className="card">
          <h3>New leads today</h3>
          <div className="stat">{leadsToday}</div>
          <div className="small muted">{totalContacts} contacts total</div>
        </div>
        <div className="card">
          <h3>Paid revenue</h3>
          <div className="stat">{formatInr(revenue)}</div>
          <div className="small muted">{quotes} quotes created</div>
        </div>
      </div>

      <div className="grid cols-2" style={{ marginBottom: 16 }}>
        {/* Connector status */}
        <div className="card">
          <h3>Connectors</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 10 }}>
            {connectors.map((c) => (
              <div key={c.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontWeight: 600 }}>{CONNECTOR_LABELS[c.type] ?? c.label}</div>
                <span className={`pill ${c.status}`}>
                  <span className="led" />
                  {c.status.replace("_", " ")}
                </span>
              </div>
            ))}
            {connectors.length === 0 && <div className="muted small">No connectors yet. Add them in Settings.</div>}
          </div>
          <div style={{ marginTop: 14 }}>
            <Link className="btn small" href="/settings">Manage connectors</Link>
          </div>
        </div>

        {/* Orders pipeline */}
        <div className="card">
          <h3>Orders by stage</h3>
          <table className="tbl" style={{ marginTop: 8 }}>
            <tbody>
              {(["awaiting_review", "awaiting_acceptance", "approved", "design_review", "in_production", "dispatched", "delivered"] as OrderStage[]).map((s) => (
                <tr key={s}>
                  <td>{stageLabel(s)}</td>
                  <td style={{ textAlign: "right", fontWeight: 600 }}>{ordersByStage.get(s) ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Activity feed */}
      <div className="card">
        <h3>Recent AI activity</h3>
        {recent.length === 0 ? (
          <div className="muted small" style={{ marginTop: 8 }}>Nothing yet — activity appears as the AI replies, quotes and sends links.</div>
        ) : (
          <table className="tbl" style={{ marginTop: 8 }}>
            <tbody>
              {recent.map((e) => (
                <tr key={e.id}>
                  <td style={{ width: 120 }}><span className="tag">{e.actor}</span></td>
                  <td>{e.action.replace(/[._]/g, " ")}</td>
                  <td style={{ textAlign: "right" }} className="muted small">{timeAgo(e.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
