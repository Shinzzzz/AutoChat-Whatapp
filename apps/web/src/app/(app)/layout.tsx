import type { ReactNode, CSSProperties } from "react";
import { prisma } from "@autochat/db";
import { themeToCssVars } from "@autochat/ui";
import { requireWorkspace } from "../../lib/session.js";
import { NavLinks } from "../../components/NavLinks.js";
import { LogoutButton } from "../../components/LogoutButton.js";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const { session, workspace } = await requireWorkspace();

  const [needsHuman, pendingLearned] = await Promise.all([
    prisma.conversation.count({ where: { workspaceId: workspace.id, status: "needs_human" } }),
    prisma.learnedItem.count({ where: { workspaceId: workspace.id, status: "pending" } }),
  ]);

  const themeVars = themeToCssVars({
    brandName: workspace.brandName,
    logoUrl: workspace.logoUrl,
    primaryColor: workspace.primaryColor,
    accentColor: workspace.accentColor,
  }) as CSSProperties;

  const initials = workspace.brandName.slice(0, 2).toUpperCase();

  return (
    <div className="shell" style={themeVars}>
      <aside className="sidebar">
        <div className="brand">
          {workspace.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={workspace.logoUrl} alt="" width={26} height={26} style={{ borderRadius: 8 }} />
          ) : (
            <span className="dot">{initials}</span>
          )}
          {workspace.brandName}
        </div>
        <NavLinks needsHuman={needsHuman} pendingLearned={pendingLearned} />
        <div className="sidebar-foot">
          <div style={{ marginBottom: 8 }}>{session.email}</div>
          <LogoutButton />
        </div>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
