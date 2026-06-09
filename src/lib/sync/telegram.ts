/* Sync ad-agency balances from the company Telegram chat.
 *
 * An employee posts the agency balances once a day as a single list message,
 * e.g.:
 *   Остатки агентств 09.06
 *   Meta Ads — 128 400$
 *   Google Ads: 86 200
 *   TikTok Ads 42 750$
 *
 * We long-poll getUpdates, pick the most recent qualifying "balances report"
 * message, parse each line into {name, amount} and upsert the Agency rows
 * (match by platform/name, case-insensitive; auto-create unknown agencies when
 * TELEGRAM_AGENCY_AUTOCREATE is on). The getUpdates offset is persisted so
 * messages aren't reprocessed. Balances are in USD (the chat reports $). */
import "server-only";
import { prisma } from "../prisma";
import { getUpdates, telegramChatId, senderLabel, type TgMessage, type TgUpdate } from "../telegram";
import { parseReport, isReport, normName as norm } from "./telegram-parse";

export interface TelegramSyncResult {
  consumed: number; // updates consumed from getUpdates
  updated: number; // agencies whose balance changed
  created: number; // agencies auto-created
  skipped: number; // parsed lines with no matching agency (autocreate off)
  messageAt: string | null;
  entries: { name: string; amount: number; action: "updated" | "created" | "skipped" }[];
}

export async function syncTelegramAgencies(): Promise<TelegramSyncResult> {
  const chatFilter = telegramChatId();
  const autoCreate = (process.env.TELEGRAM_AGENCY_AUTOCREATE ?? "true").toLowerCase() !== "false";

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
    const text = m.text || m.caption || "";
    if (!text || !isReport(text)) continue;
    // Keep the most recent qualifying message (daily full snapshot).
    if (!report || m.date >= report.date) report = m;
  }

  const result: TelegramSyncResult = {
    consumed: updates.length,
    updated: 0,
    created: 0,
    skipped: 0,
    messageAt: report ? new Date(report.date * 1000).toISOString() : null,
    entries: [],
  };

  if (report) {
    const by = senderLabel(report);
    const text = report.text || report.caption || "";
    const parsed = parseReport(text);

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
          if (Number(existing.balance) !== e.amount) result.updated++;
          await tx.agency.update({
            where: { id: existing.id },
            data: { balance: e.amount, enteredBy: by, updatedAt: new Date() },
          });
          result.entries.push({ name: e.name, amount: e.amount, action: "updated" });
        } else if (autoCreate) {
          await tx.agency.create({
            data: { platform: e.name, name: "", balance: e.amount, enteredBy: by },
          });
          result.created++;
          result.entries.push({ name: e.name, amount: e.amount, action: "created" });
        } else {
          result.skipped++;
          result.entries.push({ name: e.name, amount: e.amount, action: "skipped" });
        }
      }
    });
  }

  // Persist the cursor and a "telegram" sync timestamp (for freshness badges).
  if (maxUpdateId >= offset) {
    await prisma.telegramState.upsert({
      where: { id: "default" },
      update: {
        offset: BigInt(maxUpdateId + 1),
        lastChatId: report ? String(report.chat?.id) : state?.lastChatId ?? null,
        lastMessageAt: report ? new Date(report.date * 1000) : state?.lastMessageAt ?? null,
      },
      create: {
        id: "default",
        offset: BigInt(maxUpdateId + 1),
        lastChatId: report ? String(report.chat?.id) : null,
        lastMessageAt: report ? new Date(report.date * 1000) : null,
      },
    });
  }
  await prisma.syncState.upsert({
    where: { source: "telegram" },
    update: { lastSyncedAt: new Date(), ok: true },
    create: { source: "telegram", lastSyncedAt: new Date(), ok: true },
  });

  return result;
}
