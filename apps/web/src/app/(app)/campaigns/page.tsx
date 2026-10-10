import { prisma } from "@autochat/db";
import { requireWorkspace } from "../../../lib/session.js";
import { timeAgo } from "../../../lib/money.js";
import { createCampaign, sendCampaignAction } from "./actions.js";

export const dynamic = "force-dynamic";

export default async function CampaignsPage() {
  const { workspace } = await requireWorkspace();
  const [campaigns, connectors] = await Promise.all([
    prisma.campaign.findMany({ where: { workspaceId: workspace.id }, orderBy: { createdAt: "desc" }, take: 50 }),
    prisma.channelConnector.findMany({ where: { workspaceId: workspace.id } }),
  ]);
  const channels = connectors.filter((c) => c.type !== "voice").map((c) => c.type);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Campaigns</h1>
          <div className="sub muted">Proactively push customers to buy. Replies thread back into the inbox.</div>
        </div>
      </div>

      <div className="grid cols-2">
        <div className="card">
          <h2>New campaign</h2>
          <form action={createCampaign} style={{ marginTop: 10 }}>
            <div className="field"><label>Name</label><input className="input" name="name" placeholder="Diwali offer" required /></div>
            <div className="grid cols-2">
              <div className="field">
                <label>Channel</label>
                <select className="input" name="channel">
                  {(channels.length ? channels : ["whatsapp"]).map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Audience stage</label>
                <select className="input" name="stage">
                  <option value="">All contacts</option>
                  <option value="lead">Leads</option>
                  <option value="qualified">Qualified</option>
                  <option value="quoted">Quoted</option>
                  <option value="customer">Customers</option>
                  <option value="repeat">Repeat</option>
                </select>
              </div>
            </div>
            <div className="field"><label>Tag (optional)</label><input className="input" name="tag" placeholder="e.g. mumbai" /></div>
            <div className="field"><label>Message</label><textarea className="input" name="text" placeholder="Hi! This month, branded 500ml bottles start at…" required /></div>
            <button className="btn primary" type="submit">Create draft</button>
          </form>
          <p className="muted small" style={{ marginTop: 10 }}>
            For live WhatsApp outside the 24-hour window, an approved template is required; in
            mock mode sends are simulated.
          </p>
        </div>

        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ padding: 16 }}><h2 style={{ margin: 0 }}>Campaigns</h2></div>
          <table className="tbl">
            <thead><tr><th>Name</th><th>Channel</th><th>Status</th><th>Sent</th><th></th></tr></thead>
            <tbody>
              {campaigns.map((c) => {
                const m = (c.metrics as { audience?: number; sent?: number; failed?: number }) ?? {};
                return (
                  <tr key={c.id}>
                    <td style={{ fontWeight: 600 }}>{c.name}<div className="muted small">{timeAgo(c.createdAt)}</div></td>
                    <td className="muted">{c.channel}</td>
                    <td><span className="tag">{c.status}</span></td>
                    <td className="small">{m.sent != null ? `${m.sent}/${m.audience ?? 0}` : "—"}</td>
                    <td>
                      {c.status !== "sent" && (
                        <form action={sendCampaignAction}>
                          <input type="hidden" name="campaignId" value={c.id} />
                          <button className="btn small primary" type="submit">Send now</button>
                        </form>
                      )}
                    </td>
                  </tr>
                );
              })}
              {campaigns.length === 0 && <tr><td colSpan={5} className="muted small">No campaigns yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
