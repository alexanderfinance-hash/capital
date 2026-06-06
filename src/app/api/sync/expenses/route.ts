import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth-server";
import { syncExpenses } from "@/lib/sync/expenses";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST() {
  if (!(await getSession())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const result = await syncExpenses();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
