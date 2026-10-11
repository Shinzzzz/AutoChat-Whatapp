"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";

const LINKS: { href: string; label: string; ico: string }[] = [
  { href: "/dashboard", label: "Dashboard", ico: "▱" },
  { href: "/inbox", label: "Inbox", ico: "✉" },
  { href: "/contacts", label: "Contacts", ico: "◍" },
  { href: "/orders", label: "Orders", ico: "⬡" },
  { href: "/pricing", label: "Pricing", ico: "₹" },
  { href: "/campaigns", label: "Campaigns", ico: "➤" },
  { href: "/imports", label: "Screenshot import", ico: "⬆" },
  { href: "/learning", label: "AI Learning", ico: "✦" },
  { href: "/settings", label: "Settings", ico: "⚙" },
];

export function NavLinks({ needsHuman, pendingLearned = 0 }: { needsHuman: number; pendingLearned?: number }) {
  const path = usePathname();
  return (
    <nav style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {LINKS.map((l) => {
        const active = path === l.href || path.startsWith(l.href + "/");
        return (
          <Link key={l.href} href={l.href} className={`nav-link${active ? " active" : ""}`}>
            <span className="ico">{l.ico}</span>
            {l.label}
            {l.href === "/inbox" && needsHuman > 0 && (
              <span className="nav-badge">{needsHuman}</span>
            )}
            {l.href === "/learning" && pendingLearned > 0 && (
              <span className="nav-badge" style={{ background: "var(--brand-primary)" }}>{pendingLearned}</span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
