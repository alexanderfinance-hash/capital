import { NextResponse } from "next/server";
import { authenticate } from "@/lib/auth-server";
import { signSession, SESSION_COOKIE, SESSION_MAX_AGE } from "@/lib/session";
import { twoFactorAppliesTo, createChallenge } from "@/lib/twofa";

export const runtime = "nodejs";

export async function POST(req: Request) {
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

  // Второй фактор (только владелец, при включённом 2FA): не выдаём сессию сразу —
  // отправляем код на почту и просим его ввести на шаге 2 (/api/auth/verify).
  if (twoFactorAppliesTo(user.role)) {
    try {
      const { challengeId, to } = await createChallenge({ id: user.id, email: user.email, role: user.role });
      return NextResponse.json({ twofa: true, challengeId, to });
    } catch {
      // Сбой отправки кода — вход не выдаём (безопасный отказ).
      return NextResponse.json({ error: "mail_failed" }, { status: 500 });
    }
  }

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
