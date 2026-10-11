import { prisma } from "@autochat/db";
import { requireWorkspace } from "../../../lib/session.js";
import { timeAgo } from "../../../lib/money.js";
import { approveAction, rejectAction } from "./actions.js";

export const dynamic = "force-dynamic";

export default async function LearningPage() {
  const { workspace } = await requireWorkspace();
  const [pending, approved] = await Promise.all([
    prisma.learnedItem.findMany({
      where: { workspaceId: workspace.id, status: "pending" },
      orderBy: [{ converted: "desc" }, { confidence: "desc" }],
      take: 100,
    }),
    prisma.learnedItem.findMany({
      where: { workspaceId: workspace.id, status: "approved" },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>AI Learning</h1>
          <div className="sub muted">
            The AI proposes knowledge from resolved chats. Approve to make it part of future
            answers — nothing changes until you do.
          </div>
        </div>
      </div>

      <div className="card">
        <h2>Pending review ({pending.length})</h2>
        {pending.length === 0 && (
          <p className="muted small">
            Nothing pending. Use “Learn” or “Close” on a conversation in the Inbox to distill new
            knowledge from it.
          </p>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 10 }}>
          {pending.map((it) => (
            <form key={it.id} action={approveAction} style={{ borderTop: "1px solid var(--border)", paddingTop: 12 }}>
              <input type="hidden" name="id" value={it.id} />
              <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                <span className="tag">{it.type}</span>
                {it.converted && <span className="pill connected"><span className="led" />from a won deal</span>}
                <span className="muted small">confidence {(it.confidence * 100).toFixed(0)}% · {timeAgo(it.createdAt)}</span>
              </div>
              {it.type === "qa" && (
                <div className="field"><label>Question</label><input className="input" name="question" defaultValue={it.question ?? ""} /></div>
              )}
              <div className="field"><label>Answer / fact</label><textarea className="input" name="answer" defaultValue={it.answer} /></div>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn primary" type="submit">Approve &amp; teach</button>
                <button className="btn" type="submit" formAction={rejectAction}>Reject</button>
              </div>
            </form>
          ))}
        </div>
      </div>

      {approved.length > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <h2>Recently learned</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
            {approved.map((it) => (
              <div key={it.id} style={{ borderTop: "1px solid var(--border)", paddingTop: 6 }}>
                <span className="tag">{it.type}</span>{" "}
                {it.question ? <strong>{it.question}</strong> : null}
                <div className="muted small">{it.answer}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
