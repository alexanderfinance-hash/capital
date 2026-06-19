/* Sync ad-agency balances from the company Telegram chat.
 *
 * An employee posts the agency balances once a day as a single list message.
 * Two delivery paths share the same parsing/upsert core (applyReportMessage):
 *  - Polling (getUpdates): syncTelegramAgencies, triggered by the worker.
 *  - Webhook: /api/telegram/webhook, when outbound to api.telegram.org is
 *    blocked and Telegram must push to us instead (TELEGRAM_WEBHOOK_SECRET set).
 *
 * Balances are matched to Agency rows by name (case-insensitive); unknown
 * agencies are auto-created when TELEGRAM_AGENCY_AUTOCREATE is on. Balances are
 * in USD (the chat reports $). */
import "server-only";
import { prisma } from "../prisma";
import { getUpdates, telegramChatId, senderLabel, senderAllowed, webhookEnabled, type TgMessage, type TgUpdate } from "../telegram";
import { parseReport, isReport, normName as norm } from "./telegram-parse";

export interface ApplyResult {
  updated: number; // agencies whose balance changed
  created: number; // agencies auto-created
  skipped: number; // parsed lines with no matching agency (autocreate off)
  entries: { name: string; amount: number; action: "updated" | "created" | "skipped" }[];
}

export interface TelegramSyncResult extends ApplyResult {
  consumed: number; // updates consumed from getUpdates
  messageAt: string | null;
  note?: string;
}

/** Parse a report message and upsert agency balances + freshness stamp.
 *  Shared by the polling sync and the webhook receiver. */
export async function applyReportMessage(report: TgMessage): Promise<ApplyResult> {
  const autoCreate = (process.env.TELEGRAM_AGENCY_AUTOCREATE ?? "true").toLowerCase() !== "false";
  const by = senderLabel(report);
  const text = report.text || report.caption || "";
  const entities = report.entities || report.caption_entities;
  const parsed = parseReport(text, entities);
  const res: ApplyResult = { updated: 0, created: 0, skipped: 0, entries: [] };

  await prisma.$transaction(async (tx) => {
    const agencies = await tx.agency.findMany();
    const byName = new Map<string, (typeof agencies)[number]>();
    for (const a of agencies) {
      byName.set(norm(a.platform), a);
      if (a.name) byName.set(norm(a.name), a);
    }
    for (const e of parsed) {
      const existing = byName.get(norm(e.name));
      if (existing) {
        if (Number(existing.balance) !== e.amount) res.updated++;
        await tx.agency.update({ where: { id: existing.id }, data: { balance: e.amount, enteredBy: by, updatedAt: new Date() } });
        res.entries.push({ name: e.name, amount: e.amount, action: "updated" });
      } else if (autoCreate) {
        await tx.agency.create({ data: { platform: e.name, name: "", balance: e.amount, enteredBy: by } });
        res.created++;
        res.entries.push({ name: e.name, amount: e.amount, action: "created" });
      } else {
        res.skipped++;
        res.entries.push({ name: e.name, amount: e.amount, action: "skipped" });
      }
    }
  });
  return res;
}

/** Record a "telegram" sync timestamp (for the freshness badge) and the last
 *  consumed report's chat/time. */
async function stampSync(report: TgMessage | null, offset?: { value: bigint; prevChat?: string | null; prevAt?: Date | null }) {
  if (offset) {
    await prisma.telegramState.upsert({
      where: { id: "default" },
      update: {
        offset: offset.value,
        lastChatId: report ? String(report.chat?.id) : offset.prevChat ?? null,
        lastMessageAt: report ? new Date(report.date * 1000) : offset.prevAt ?? null,
      },
      create: {
        id: "default",
        offset: offset.value,
        lastChatId: report ? String(report.chat?.id) : null,
        lastMessageAt: report ? new Date(report.date * 1000) : null,
      },
    });
  } else if (report) {
    await prisma.telegramState.upsert({
      where: { id: "default" },
      update: { lastChatId: String(report.chat?.id), lastMessageAt: new Date(report.date * 1000) },
      create: { id: "default", offset: BigInt(0), lastChatId: String(report.chat?.id), lastMessageAt: new Date(report.date * 1000) },
    });
  }
  await prisma.syncState.upsert({
    where: { source: "telegram" },
    update: { lastSyncedAt: new Date(), ok: true },
    create: { source: "telegram", lastSyncedAt: new Date(), ok: true },
  });
}

export async function syncTelegramAgencies(): Promise<TelegramSyncResult> {
  // In webhook mode getUpdates is unavailable (Telegram returns 409 once a
  // webhook is set), so the polling endpoint is a no-op — updates arrive via
  // /api/telegram/webhook instead.
  if (webhookEnabled()) {
    return { consumed: 0, updated: 0, created: 0, skipped: 0, entries: [], messageAt: null, note: "webhook mode — polling disabled" };
  }

  const chatFilter = telegramChatId();
  const state = await prisma.telegramState.findUnique({ where: { id: "default" } });
  const offset = state ? Number(state.offset) : 0;

  const updates: TgUpdate[] = await getUpdates(offset);

  // Advance the cursor past everything we just read, even if no report is
  // found, so chatter isn't re-fetched forever.
  let maxUpdateId = offset - 1;
  let report: TgMessage | null = null;
  for (const u of updates) {
    if (u.update_id > maxUpdateId) maxUpdateId = u.update_id;
    const m = u.message || u.channel_post || u.edited_message || u.edited_channel_post;
    if (!m) continue;
    if (chatFilter && String(m.chat?.id) !== chatFilter) continue;
    // Only trusted senders post the report — ignore other chat members'
    // messages so casual chatter ($-mentions) can't create phantom agencies.
    if (!senderAllowed(m)) continue;
    const text = m.text || m.caption || "";
    if (!text || !isReport(text)) continue;
    // Keep the most recent qualifying message (daily full snapshot).
    if (!report || m.date >= report.date) report = m;
  }

  const applied = report ? await applyReportMessage(report) : { updated: 0, created: 0, skipped: 0, entries: [] };

  if (maxUpdateId >= offset) {
    await stampSync(report, { value: BigInt(maxUpdateId + 1), prevChat: state?.lastChatId ?? null, prevAt: state?.lastMessageAt ?? null });
  } else {
    await stampSync(null);
  }

  return {
    consumed: updates.length,
    messageAt: report ? new Date(report.date * 1000).toISOString() : null,
    ...applied,
  };
}

/** Apply a single update delivered via webhook. Returns null when the message
 *  isn't a balances report (so the caller can 200 silently). */
export async function applyWebhookUpdate(update: unknown): Promise<(ApplyResult & { messageAt: string | null }) | null> {
  const u = update as TgUpdate;
  const m = u?.message || u?.channel_post || u?.edited_message || u?.edited_channel_post;
  if (!m) return null;
  const chatFilter = telegramChatId();
  if (chatFilter && String(m.chat?.id) !== chatFilter) return null;
  if (!senderAllowed(m)) return null;
  const text = m.text || m.caption || "";
  if (!text || !isReport(text)) return null;

  const applied = await applyReportMessage(m);
  await stampSync(m);
  return { ...applied, messageAt: m.date ? new Date(m.date * 1000).toISOString() : null };
}
