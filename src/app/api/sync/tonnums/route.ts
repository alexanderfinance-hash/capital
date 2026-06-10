import { NextResponse } from "next/server";
import { authorizeSync, getSession } from "@/lib/auth-server";
import { syncTonNumbers } from "@/lib/sync/tonnums";
import { fetchTonNumberRate } from "@/lib/tonnums/price";
import { defaultProviders } from "@/lib/crypto/providers";

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

// Diagnostics (session-only): open in the browser to see exactly what the floor
// source returns from the server, without mutating anything. Helps pin down the
// right query/field when the rate isn't pulling.
export async function GET() {
  if (!(await getSession())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    let tonUsd: number | undefined;
    try {
      const prices = await defaultProviders.prices(["TON"]);
      tonUsd = prices.get("TON")?.usd;
    } catch {
      /* report below */
    }
    const rate = await fetchTonNumberRate(tonUsd);
    return NextResponse.json({ ok: true, tonUsd: tonUsd ?? null, ...rate });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 200 });
  }
}
