import { NextResponse } from "next/server";
import { authorizeSync, getSession } from "@/lib/auth-server";
import { syncTonNumbers } from "@/lib/sync/tonnums";
import { fetchTonNumberRate } from "@/lib/tonnums/price";

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

// Outbound-reachability probe (session-only): GET /api/sync/tonnums?probe=1.
// Hits several hosts FROM THE SERVER and reports status + a body snippet, so we
// can tell which sources the server's egress policy actually allows (a 403 HTML
// "ERROR" page = blocked by the egress proxy, not by the source itself).
async function probe() {
  const targets = [
    "https://toncenter.com/api/v2/getMasterchainInfo", // known-allowed (crypto sync works)
    "https://tonapi.io/v2/status",
    "https://api.coingecko.com/api/v3/ping",
    "https://api.getgems.io/graphql",
    "https://nums888.io/",
  ];
  const results = await Promise.all(
    targets.map(async (url) => {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
        const body = (await res.text().catch(() => "")).replace(/\s+/g, " ").slice(0, 120);
        return { url, status: res.status, body };
      } catch (e) {
        return { url, status: 0, error: String(e).slice(0, 160) };
      }
    })
  );
  return NextResponse.json({ ok: true, probe: results });
}

// Diagnostics (session-only): open in the browser to see exactly what the floor
// source returns from the server, without mutating anything. Helps pin down the
// right query/field when the rate isn't pulling.
export async function GET(req: Request) {
  if (!(await getSession())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (new URL(req.url).searchParams.get("probe")) return probe();
  try {
    const rate = await fetchTonNumberRate();
    return NextResponse.json({ ok: true, ...rate });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 200 });
  }
}
