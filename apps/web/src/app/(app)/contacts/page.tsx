import { prisma } from "@autochat/db";
import { requireWorkspace } from "../../../lib/session.js";
import { timeAgo } from "../../../lib/money.js";

export const dynamic = "force-dynamic";

export default async function ContactsPage() {
  const { workspace } = await requireWorkspace();
  const contacts = await prisma.contact.findMany({
    where: { workspaceId: workspace.id },
    orderBy: { updatedAt: "desc" },
    take: 200,
    include: { _count: { select: { orders: true } } },
  });

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Contacts &amp; leads</h1>
          <div className="sub muted">{contacts.length} contacts · captured automatically from every channel.</div>
        </div>
      </div>
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <table className="tbl">
          <thead>
            <tr>
              <th>Name</th>
              <th>Phone</th>
              <th>Stage</th>
              <th>Source</th>
              <th>Enquiry</th>
              <th>Orders</th>
              <th>Updated</th>
            </tr>
          </thead>
          <tbody>
            {contacts.map((c) => {
              const cf = (c.customFields as Record<string, unknown>) ?? {};
              return (
                <tr key={c.id}>
                  <td style={{ fontWeight: 600 }}>{c.name ?? "—"}</td>
                  <td>{c.phones[0] ?? "—"}</td>
                  <td><span className="tag">{c.stage}</span></td>
                  <td className="muted">{c.source ?? "—"}</td>
                  <td className="muted">{(cf.enquiryType as string) ?? "—"}</td>
                  <td>{c._count.orders}</td>
                  <td className="muted small">{timeAgo(c.updatedAt)}</td>
                </tr>
              );
            })}
            {contacts.length === 0 && (
              <tr><td colSpan={7} className="muted small">No contacts yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
