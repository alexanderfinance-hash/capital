import { NextResponse } from "next/server";
import { authorizeSync } from "@/lib/auth-server";
import { syncSecretExpenses } from "@/lib/sync/secret-expenses";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  if (!(await authorizeSync(req))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const result = await syncSecretExpenses();
    return NextResponse.json(result);
  } catch (e) {
    // При сбое чтения секретного листа последние значения не затираются (PRD §7).
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
