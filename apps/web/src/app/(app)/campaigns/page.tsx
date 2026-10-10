import { requireWorkspace } from "../../../lib/session.js";

export const dynamic = "force-dynamic";

export default async function CampaignsPage() {
  await requireWorkspace();
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Campaigns</h1>
          <div className="sub muted">Proactively push customers to buy.</div>
        </div>
      </div>
      <div className="card">
        <h2>Coming in milestone M4</h2>
        <p className="muted">
          Build an audience segment from your contacts, compose a WhatsApp template / email /
          Instagram message, schedule or drip it, and track delivery, clicks and replies.
          The contact list and channel connectors this needs are already in place.
        </p>
      </div>
    </>
  );
}
