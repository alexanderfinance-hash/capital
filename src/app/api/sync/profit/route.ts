import { NextResponse } from "next/server";
import { authorizeSync, getSession } from "@/lib/auth-server";
import { syncProfit } from "@/lib/sync/profit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  if (!(await authorizeSync(req))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const result = await syncProfit();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    // При сбое сохраняются последние известные значения дохода (PRD §7).
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}

// Диагностика (только сессия): GET /api/sync/profit — источник (URL/скоуп, факт
// наличия токена) + пробный синк (months/weeks). При ошибке ничего не трогает.
export async function GET(req: Request) {
  if (!(await getSession())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const out: Record<string, unknown> = {
    url: process.env.PNL_API_URL || "https://finance-company.online/api/integrations/pnl",
    tokenSet: !!process.env.PNL_API_TOKEN,
    scope: process.env.PNL_SCOPE || "all",
    periods: Math.min(60, Math.max(1, Number(process.env.PNL_PERIODS) || 12)),
  };
  try {
    const result = await syncProfit();
    return NextResponse.json({ ok: true, ...out, ...result });
  } catch (e) {
    return NextResponse.json({ ok: false, ...out, error: String(e) }, { status: 200 });
  }
}
