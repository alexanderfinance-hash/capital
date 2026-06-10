import { NextResponse } from "next/server";
import { authorizeSync } from "@/lib/auth-server";
import { syncTonNumbers } from "@/lib/sync/tonnums";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  if (!(await authorizeSync(req))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const result = await syncTonNumbers();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    // On failure the last known cached price and asset values are kept (PRD §7).
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
