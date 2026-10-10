import { requireWorkspace } from "../../../lib/session.js";

export const dynamic = "force-dynamic";

export default async function ImportsPage() {
  await requireWorkspace();
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Screenshot import</h1>
          <div className="sub muted">Bring conversations from another number or device into AutoChat.</div>
        </div>
      </div>
      <div className="card">
        <h2>Coming in milestone M3</h2>
        <p className="muted">
          Upload a screenshot of a chat that happened on another number or device. Claude vision
          reads the name, number and enquiry type, you confirm, and a contact + conversation is
          created so the AI can take over from there. The vision plumbing (image blocks into the
          agent) and the storage model are already in the codebase.
        </p>
      </div>
    </>
  );
}
