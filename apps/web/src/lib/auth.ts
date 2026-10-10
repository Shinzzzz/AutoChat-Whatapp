import { SignJWT, jwtVerify } from "jose";
import { getEnv } from "@autochat/core";

export const SESSION_COOKIE = "autochat_session";
const ALG = "HS256";

function secretKey(): Uint8Array {
  return new TextEncoder().encode(getEnv().AUTH_SECRET);
}

export interface SessionClaims {
  userId: string;
  workspaceId: string;
  email: string;
}

export async function signSession(claims: SessionClaims): Promise<string> {
  return new SignJWT({ ...claims })
    .setProtectedHeader({ alg: ALG })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secretKey());
}

export async function verifySession(token: string): Promise<SessionClaims | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey());
    if (
      typeof payload.userId === "string" &&
      typeof payload.workspaceId === "string" &&
      typeof payload.email === "string"
    ) {
      return { userId: payload.userId, workspaceId: payload.workspaceId, email: payload.email };
    }
    return null;
  } catch {
    return null;
  }
}
