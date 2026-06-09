import { NextResponse } from "next/server";
import { authorizeSync } from "@/lib/auth-server";
import { syncCoinlinkPayable } from "@/lib/sync/coinlink";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  if (!(await authorizeSync(req))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!process.env.COINLINK_DATABASE_URL && !process.env.COINLINK_DB_HOST) {
    return NextResponse.json({ ok: false, error: "COINLINK_DATABASE_URL not set" }, { status: 503 });
  }
  try {
    const result = await syncCoinlinkPayable();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
