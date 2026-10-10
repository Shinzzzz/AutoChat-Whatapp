import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@autochat/db";
import { SESSION_COOKIE, verifySession, type SessionClaims } from "./auth.js";

/** Read + verify the session cookie. Returns null if not signed in. */
export async function getSession(): Promise<SessionClaims | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySession(token);
}

/** Require a session or redirect to /login. */
export async function requireSession(): Promise<SessionClaims> {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}

/** Require a session and load the workspace. */
export async function requireWorkspace() {
  const session = await requireSession();
  const workspace = await prisma.workspace.findUnique({
    where: { id: session.workspaceId },
  });
  if (!workspace) redirect("/login");
  return { session, workspace };
}
