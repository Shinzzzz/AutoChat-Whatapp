import { prisma } from "@autochat/db";
import { requireWorkspace } from "../../../lib/session.js";
import { timeAgo } from "../../../lib/money.js";
import { ImportUploader } from "./ImportUploader.js";

export const dynamic = "force-dynamic";

export default async function ImportsPage() {
  const { workspace } = await requireWorkspace();
  const imports = await prisma.screenshotImport.findMany({
    where: { workspaceId: workspace.id },
    orderBy: { createdAt: "desc" },
    take: 25,
  });

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Screenshot import</h1>
          <div className="sub muted">Bring conversations from another number or device into AutoChat.</div>
        </div>
      </div>

      <ImportUploader />

      <div className="card" style={{ marginTop: 16, padding: 0, overflow: "hidden" }}>
        <table className="tbl">
          <thead>
            <tr><th>Extracted</th><th>Status</th><th>When</th></tr>
          </thead>
          <tbody>
            {imports.map((imp) => {
              const ex = (imp.extracted as { name?: string; summary?: string }) ?? {};
              return (
                <tr key={imp.id}>
                  <td>
                    <strong>{ex.name ?? "—"}</strong>
                    <div className="muted small">{ex.summary ?? ""}</div>
                  </td>
                  <td><span className="tag">{imp.status}</span></td>
                  <td className="muted small">{timeAgo(imp.createdAt)}</td>
                </tr>
              );
            })}
            {imports.length === 0 && (
              <tr><td colSpan={3} className="muted small">No imports yet. Upload a screenshot above.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
