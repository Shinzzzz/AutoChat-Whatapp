import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySession, type SessionClaims } from "./auth.js";

/** Session for route handlers. Returns null when unauthenticated. */
export async function apiSession(): Promise<SessionClaims | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySession(token);
}

export function json(data: unknown, init?: number | ResponseInit): Response {
  const resInit = typeof init === "number" ? { status: init } : init;
  return new Response(JSON.stringify(data), {
    ...resInit,
    headers: { "content-type": "application/json", ...(resInit as ResponseInit)?.headers },
  });
}

export const unauthorized = () => json({ error: "unauthorized" }, 401);
