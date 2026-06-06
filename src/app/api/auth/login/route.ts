import { NextResponse } from "next/server";
import { authenticate } from "@/lib/auth-server";
import { signSession, SESSION_COOKIE, SESSION_MAX_AGE } from "@/lib/session";

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
