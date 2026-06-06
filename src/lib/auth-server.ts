/* Server-side auth (Node runtime: prisma + bcrypt). */
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";
import { SESSION_COOKIE, verifySession, type SessionPayload } from "./session";

/** Read & verify the current session from cookies (server components / routes). */
export async function getSession(): Promise<SessionPayload | null> {
  const token = cookies().get(SESSION_COOKIE)?.value;
  return token ? verifySession(token) : null;
}

/** Allow a request if it has a valid session OR the internal cron key
 *  (used by the background worker to trigger syncs). */
export async function authorizeSync(req: Request): Promise<boolean> {
  if (await getSession()) return true;
  const key = req.headers.get("x-cron-key");
  return !!key && !!process.env.CRON_SECRET && key === process.env.CRON_SECRET;
}

/** Verify password against the stored user. Single-user: falls back to the
 *  only user when no email is supplied.
 *
 *  Dev convenience: outside production, if the database is unreachable, accept
 *  APP_PASSWORD from the environment so the app can be run locally without a DB
 *  (data is still mock at this stage). Production always requires the DB. */
export async function authenticate(password: string, email?: string) {
  try {
    const user = email
      ? await prisma.user.findUnique({ where: { email } })
      : await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
    if (!user) return null;
    const ok = await bcrypt.compare(password, user.passwordHash);
    return ok ? user : null;
  } catch (err) {
    if (process.env.NODE_ENV !== "production" && process.env.APP_PASSWORD) {
      if (password === process.env.APP_PASSWORD) {
        return {
          id: "dev",
          email: process.env.APP_EMAIL || "admin@capital.local",
          role: "admin",
          name: "Администратор",
        };
      }
      return null;
    }
    throw err;
  }
}
