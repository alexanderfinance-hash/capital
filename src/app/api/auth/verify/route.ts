import { NextResponse } from "next/server";
import { verifyChallenge } from "@/lib/twofa";
import { signSession, SESSION_COOKIE, SESSION_MAX_AGE } from "@/lib/session";

export const runtime = "nodejs";

/* Шаг 2 входа: проверка кода из письма. При успехе выдаёт сессию. */
export async function POST(req: Request) {
  let body: { challengeId?: string; code?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const challengeId = (body.challengeId || "").trim();
  const code = (body.code || "").replace(/\D/g, "");
  if (!challengeId || !code) return NextResponse.json({ error: "bad_request" }, { status: 400 });

  const sess = await verifyChallenge(challengeId, code);
  if (!sess) return NextResponse.json({ error: "invalid_code" }, { status: 401 });

  const token = await signSession(sess);
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
