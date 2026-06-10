import { NextResponse } from "next/server";
import { authorizeSync, getSession } from "@/lib/auth-server";
import { syncDividends, ddsSpreadsheetId } from "@/lib/sync/dividends";
import { listSheetTitles, serviceAccountEmail } from "@/lib/sheets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  if (!(await authorizeSync(req))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const result = await syncDividends();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    // On failure the last-known income figures are kept (PRD §7).
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}

// Diagnostics (session-only): GET /api/sync/dividends — shows the service-account
// email the ДДС file must be shared with, the spreadsheet id, the tabs found and
// a parsed preview, without mutating anything.
export async function GET(req: Request) {
  if (!(await getSession())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const spreadsheetId = ddsSpreadsheetId();
  const out: Record<string, unknown> = { spreadsheetId, serviceAccount: serviceAccountEmail() };
  try {
    out.tabs = await listSheetTitles(spreadsheetId);
  } catch (e) {
    out.tabsError = String(e);
  }
  try {
    const result = await syncDividends();
    return NextResponse.json({ ok: true, ...out, ...result });
  } catch (e) {
    return NextResponse.json({ ok: false, ...out, error: String(e) }, { status: 200 });
  }
}
