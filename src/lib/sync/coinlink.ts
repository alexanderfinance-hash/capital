/* Sync CoinLink accounts payable (кредиторская задолженность) from the external
 * read-only `coinlink_payable` view into the app's own DB (CoinlinkPayable
 * singleton). The company "available to withdraw" total subtracts this figure.
 *
 * Resilience (PRD §7): on a failed external read the last known value is kept —
 * only `ok`/timestamp metadata changes — so the dashboard never blanks out. */
import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { fetchPayable } from "../coinlink/db";

export interface CoinlinkSyncResult {
  total: number;
  partners: { partner: string; debt: number }[];
  from: string;
  to: string;
}

export async function syncCoinlinkPayable(): Promise<CoinlinkSyncResult> {
  const { total, partners, from, to } = await fetchPayable();
  // Plain JSON array for Prisma's Json column.
  const partnersJson = partners.map((p) => ({ partner: p.partner, debt: p.debt })) as unknown as Prisma.InputJsonValue;

  await prisma.coinlinkPayable.upsert({
    where: { id: "default" },
    update: { totalUsdt: total, partners: partnersJson, periodFrom: from, lastSyncedAt: new Date(), ok: true },
    create: { id: "default", totalUsdt: total, partners: partnersJson, periodFrom: from, lastSyncedAt: new Date(), ok: true },
  });

  await prisma.syncState.upsert({
    where: { source: "coinlink" },
    update: { lastSyncedAt: new Date(), ok: true },
    create: { source: "coinlink", lastSyncedAt: new Date(), ok: true },
  });

  return { total, partners, from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}
