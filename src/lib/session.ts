/* Edge-safe session helpers (jose only — usable in middleware). */
import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "cap_session";
const MAX_AGE = 60 * 60 * 24 * 7; // 7 days

export interface SessionPayload {
  sub: string;
  email: string;
  role: string;
}

function secret(): Uint8Array {
  return new TextEncoder().encode(process.env.AUTH_SECRET || "dev-secret-change-me-please");
}

export async function signSession(p: SessionPayload): Promise<string> {
  return new SignJWT({ email: p.email, role: p.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(p.sub)
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(secret());
}

export async function verifySession(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    return { sub: String(payload.sub), email: String(payload.email), role: String(payload.role) };
  } catch {
    return null;
  }
}

export const SESSION_MAX_AGE = MAX_AGE;
