import { NextResponse } from "next/server";
import { authorizeSync } from "@/lib/auth-server";
import { backfillCoinHistory } from "@/lib/sync/backfill";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Прогон долгий (много внешних запросов) — даём максимум времени.
export const maxDuration = 800;

export async function POST(req: Request) {
  if (!(await authorizeSync(req))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const url = new URL(req.url);
    const days = Math.min(400, Math.max(1, Number(url.searchParams.get("days")) || 200));
    const result = await backfillCoinHistory(days);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
