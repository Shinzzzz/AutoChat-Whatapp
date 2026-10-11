import Link from "next/link";
import { prisma } from "@autochat/db";
import type { OrderStage } from "@autochat/core";
import { requireWorkspace } from "../../../lib/session.js";
import { formatInr, timeAgo } from "../../../lib/money.js";
import { stageLabel } from "../orders/[id]/pipeline.js";

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

  const weekAgo = new Date(Date.now() - 6 * 24 * 3600 * 1000);
  weekAgo.setHours(0, 0, 0, 0);

  const [
    connectors,
    openConvos,
    needsHuman,
    totalConvos,
    totalContacts,
    leadsToday,
    recentContacts,
    orders,
    paidAgg,
    quotes,
    recent,
  ] = await Promise.all([
    prisma.channelConnector.findMany({ where: { workspaceId: wsId }, orderBy: { createdAt: "asc" } }),
    prisma.conversation.count({ where: { workspaceId: wsId, status: { in: ["open", "ai_handling"] } } }),
    prisma.conversation.count({ where: { workspaceId: wsId, status: "needs_human" } }),
    prisma.conversation.count({ where: { workspaceId: wsId } }),
    prisma.contact.count({ where: { workspaceId: wsId } }),
    prisma.contact.count({ where: { workspaceId: wsId, createdAt: { gte: startOfDay } } }),
    prisma.contact.findMany({ where: { workspaceId: wsId, createdAt: { gte: weekAgo } }, select: { createdAt: true } }),
    prisma.order.groupBy({ by: ["stage"], where: { workspaceId: wsId }, _count: true }),
    prisma.order.aggregate({ where: { workspaceId: wsId, razorpayPaymentId: { not: null } }, _sum: { totalPaise: true } }),
    prisma.quote.count({ where: { workspaceId: wsId } }),
    prisma.auditEvent.findMany({ where: { workspaceId: wsId }, orderBy: { createdAt: "desc" }, take: 8 }),
  ]);

  const [knowledgeChunks, learnedApproved, learnedPending] = await Promise.all([
    prisma.knowledgeChunk.count({ where: { workspaceId: wsId } }),
    prisma.learnedItem.count({ where: { workspaceId: wsId, status: "approved" } }),
    prisma.learnedItem.count({ where: { workspaceId: wsId, status: "pending" } }),
  ]);

  const revenue = paidAgg._sum.totalPaise ?? 0;
  const ordersByStage = new Map<string, number>(orders.map((o) => [o.stage, o._count]));
  const aiHandledPct = totalConvos > 0 ? Math.round(((totalConvos - needsHuman) / totalConvos) * 100) : 100;

  // Bucket new leads into the last 7 days.
  const days: { label: string; count: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 3600 * 1000);
    days.push({ label: d.toLocaleDateString("en-IN", { weekday: "short" })[0] ?? "", count: 0 });
  }
  for (const c of recentContacts) {
    const idx = Math.floor((c.createdAt.getTime() - weekAgo.getTime()) / (24 * 3600 * 1000));
    if (idx >= 0 && idx < 7) days[idx]!.count++;
  }
  const maxLeads = Math.max(1, ...days.map((d) => d.count));

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

      {/* Analytics */}
      <div className="grid cols-2" style={{ marginBottom: 16 }}>
        <div className="card">
          <h3>New leads · last 7 days</h3>
          {(() => {
            const W = 320, H = 96, pad = 18, gap = 2;
            const bw = (W - (days.length - 1) * gap) / days.length;
            const plotH = H - pad;
            return (
              <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img"
                   aria-label={`New leads per day over the last 7 days; peak ${maxLeads}`} style={{ marginTop: 8 }}>
                <title>New leads per day (last 7 days)</title>
                <line x1="0" y1={plotH} x2={W} y2={plotH} stroke="var(--border)" strokeWidth="1" />
                {days.map((d, i) => {
                  const h = d.count === 0 ? 0 : Math.max(3, (d.count / maxLeads) * (plotH - 6));
                  const x = i * (bw + gap);
                  const y = plotH - h;
                  const isMax = d.count === maxLeads && d.count > 0;
                  return (
                    <g key={i}>
                      <rect x={x} y={y} width={bw} height={h} rx="4" fill="var(--brand-primary)" opacity={isMax ? 1 : 0.55}>
                        <title>{`${d.count} lead${d.count === 1 ? "" : "s"}`}</title>
                      </rect>
                      {isMax && <text x={x + bw / 2} y={y - 4} textAnchor="middle" fontSize="9" fill="var(--text-muted)">{d.count}</text>}
                      <text x={x + bw / 2} y={H - 4} textAnchor="middle" fontSize="9" fill="var(--text-muted)">{d.label}</text>
                    </g>
                  );
                })}
              </svg>
            );
          })()}
        </div>
        <div className="card">
          <h3>AI-handled conversations</h3>
          <div className="stat">{aiHandledPct}%</div>
          <div className="small muted">{needsHuman} of {totalConvos} currently need a human</div>
          <div style={{ marginTop: 12, height: 8, background: "var(--surface-2)", borderRadius: 999, overflow: "hidden" }}>
            <div style={{ width: `${aiHandledPct}%`, height: "100%", background: "var(--brand-primary)" }} />
          </div>
        </div>
      </div>

      {/* AI expertise (grows as it learns) */}
      <div className="card" style={{ marginBottom: 16 }}>
        <h3>AI expertise</h3>
        <div className="grid cols-3" style={{ marginTop: 8 }}>
          <div><div className="stat">{knowledgeChunks}</div><div className="small muted">retrievable knowledge chunks</div></div>
          <div><div className="stat">{learnedApproved}</div><div className="small muted">facts learned from chats</div></div>
          <div>
            <div className="stat" style={{ color: learnedPending ? "var(--brand-primary)" : undefined }}>{learnedPending}</div>
            <div className="small muted">pending to review · <a href="/learning">teach the AI →</a></div>
          </div>
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
