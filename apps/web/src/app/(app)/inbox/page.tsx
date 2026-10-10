import { requireWorkspace } from "../../../lib/session.js";
import { InboxClient } from "./InboxClient.js";

export const dynamic = "force-dynamic";

export default async function InboxPage() {
  await requireWorkspace();
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Inbox</h1>
          <div className="sub muted">Every channel in one real-time thread.</div>
        </div>
      </div>
      <InboxClient />
    </>
  );
}
