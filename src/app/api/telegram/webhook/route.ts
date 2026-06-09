import { NextResponse } from "next/server";
import { webhookSecret } from "@/lib/telegram";
import { applyWebhookUpdate } from "@/lib/sync/telegram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Telegram pushes updates here when a webhook is configured (used when the
// server can't reach api.telegram.org for getUpdates polling). Authenticated by
// the secret token Telegram echoes in the X-Telegram-Bot-Api-Secret-Token
// header (set via setWebhook). Always answers 200 so Telegram doesn't retry-
// storm; auth failures return 403.
export async function POST(req: Request) {
  const secret = webhookSecret();
  if (!secret) return NextResponse.json({ ok: false, error: "webhook disabled" }, { status: 503 });
  if (req.headers.get("x-telegram-bot-api-secret-token") !== secret) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  let update: unknown;
  try {
    update = await req.json();
  } catch {
    return NextResponse.json({ ok: true }); // ignore malformed bodies
  }

  try {
    const res = await applyWebhookUpdate(update);
    return NextResponse.json(res ? { ok: true, ...res } : { ok: true, skipped: true });
  } catch (e) {
    // 200 on processing errors so Telegram doesn't retry indefinitely.
    return NextResponse.json({ ok: false, error: String(e) });
  }
}
