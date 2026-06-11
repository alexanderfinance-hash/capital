import { NextResponse } from "next/server";
import { authenticate } from "@/lib/auth-server";
import { signSession, SESSION_COOKIE, SESSION_MAX_AGE } from "@/lib/session";
import { rateLimit, rateLimitReset, clientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";

// Brute-force protection: cap login attempts per client IP per minute.
const LOGIN_LIMIT = 8;
const LOGIN_WINDOW_MS = 60_000;

export async function POST(req: Request) {
  const ip = clientIp(req);
  const rl = rateLimit(`login:${ip}`, LOGIN_LIMIT, LOGIN_WINDOW_MS);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "too_many_attempts" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
    );
  }

  let body: { password?: string; email?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const password = (body.password || "").trim();
  if (!password) return NextResponse.json({ error: "no_password" }, { status: 400 });

  const user = await authenticate(password, body.email?.trim() || undefined);
  if (!user) return NextResponse.json({ error: "invalid_credentials" }, { status: 401 });

  // Successful login — clear the counter so earlier typos don't count against the user.
  rateLimitReset(`login:${ip}`);

  const token = await signSession({ sub: user.id, email: user.email, role: user.role });
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  return res;
}
