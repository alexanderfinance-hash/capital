import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { initialStore, WALLETS, AGENCIES, HISTORY, DEFAULT_RESERVES } from "../src/lib/mockData";

const prisma = new PrismaClient();

const MONTHS: Record<string, number> = {
  янв: 0, фев: 1, мар: 2, апр: 3, мая: 4, май: 4, июн: 5, июл: 6,
  авг: 7, сен: 8, окт: 9, ноя: 10, дек: 11,
};

/** Parse a "15 мая" label into a 2025 Date. */
function parseRuDate(label: string, year = 2025): Date {
  const [d, m] = label.trim().split(/\s+/);
  const month = MONTHS[(m || "").toLowerCase()] ?? 0;
  return new Date(Date.UTC(year, month, parseInt(d, 10) || 1));
}

async function main() {
  const email = process.env.APP_EMAIL || "admin@capital.local";
  const password = process.env.APP_PASSWORD || "capital123";

  // ---- User (single-password login) ----
  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.user.upsert({
    where: { email },
    update: { passwordHash, role: "admin" },
    create: { email, name: "Администратор", role: "admin", passwordHash },
  });

  // ---- Personal assets ----
  for (const a of initialStore.assets) {
    await prisma.asset.upsert({
      where: { slug: a.id },
      update: { icon: a.icon, name: a.name, value: a.value, delta: a.delta, source: a.src, bucket: a.bucket },
      create: { slug: a.id, icon: a.icon, name: a.name, value: a.value, delta: a.delta, source: a.src, bucket: a.bucket },
    });
  }

  // ---- Company wallets (USDT-TRC20). Mock balances are USD-equivalent. ----
  for (const w of WALLETS) {
    await prisma.wallet.upsert({
      where: { slug: w.id },
      update: { label: w.label, balance: w.balance, balanceUsd: w.balance, group: w.group, kind: w.type },
      create: {
        slug: w.id,
        scope: "company",
        chain: "TRX",
        token: "USDT",
        address: w.addr,
        label: w.label,
        group: w.group,
        kind: w.type,
        balance: w.balance,
        balanceUsd: w.balance,
        lastSyncedAt: new Date(),
      },
    });
  }

  // ---- Personal crypto wallets (addresses to sync in Stage 6) ----
  const PERSONAL_WALLETS: { chain: "BTC" | "ETH" | "TRX" | "TON"; addrs: string[] }[] = [
    { chain: "BTC", addrs: [
      "bc1qaptyvvwuta4kjn48d34kqm40ek6f3g8ctpmknh",
      "bc1q68u5e00j9tspa5deltqctm2ctr3ganq02dktnm",
      "bc1qhjzwxcxwk636gxk4el62s8hcu0xnrg0mqjr757",
      "bc1qc4dkvy94ghyuhk6evc8wvkqgpnv4sl0n0qrnky",
    ] },
    { chain: "ETH", addrs: [
      "0x8A0A3E6175E1cb6420ab5eAAE9AE207F57D65739",
      "0x6a1F8984AB5b8a8642467d3AC1923b624C366019",
      "0x085F5b4b9Df31f9CcC6370F4136F4208B716BbdB",
      "0x32eE09B6D9EE51E17551D99926418382AdAf1B5d",
    ] },
    { chain: "TRX", addrs: [
      "TE62Fi8pmwcZWaX8KmrarFwkGzQ7SttTj8",
      "TTPKT5LeS26Z71AL9vCUCzBnx3RomZ5uiz",
      "TCiDRvChzNv9EDmPYeStWg2v7J5HUZwvgb",
    ] },
    { chain: "TON", addrs: ["UQA8iSpC1heDwyQK2H-0ALJ-zZqdqBPVi7sV9uMv55pybi-T"] },
  ];
  for (const grp of PERSONAL_WALLETS) {
    for (let i = 0; i < grp.addrs.length; i++) {
      const slug = `pw_${grp.chain.toLowerCase()}_${i + 1}`;
      await prisma.wallet.upsert({
        where: { slug },
        update: { address: grp.addrs[i] },
        create: { slug, scope: "personal", chain: grp.chain, token: grp.chain, address: grp.addrs[i], label: `${grp.chain} ${i + 1}` },
      });
    }
  }

  // ---- Agencies (updatedAt derived from staleDays) ----
  const now = Date.now();
  for (const ag of AGENCIES) {
    const updatedAt = new Date(now - ag.staleDays * 24 * 3600 * 1000);
    await prisma.agency.upsert({
      where: { slug: ag.id },
      update: { platform: ag.platform, name: ag.name, balance: ag.balance, enteredBy: ag.by, updatedAt },
      create: { slug: ag.id, platform: ag.platform, name: ag.name, balance: ag.balance, enteredBy: ag.by, updatedAt },
    });
  }

  // ---- Reserves (singleton) ----
  await prisma.reserve.upsert({
    where: { id: "default" },
    update: {},
    create: { id: "default", ...DEFAULT_RESERVES },
  });

  // ---- Dividends ----
  await prisma.dividend.deleteMany();
  for (const d of initialStore.dividendsList) {
    await prisma.dividend.create({ data: { name: d.name, amount: d.amount, paidAt: parseRuDate(d.date) } });
  }

  // ---- Expenses (months + categories) ----
  const monthIdx: Record<string, number> = { Янв: 0, Фев: 1, Мар: 2, Апр: 3, Май: 4, Июн: 5 };
  for (const m of initialStore.expenseMonths) {
    const monthStart = new Date(Date.UTC(2025, monthIdx[m.m] ?? 0, 1));
    await prisma.expenseMonth.upsert({
      where: { monthStart },
      update: { label: m.m, value: m.v },
      create: { label: m.m, monthStart, value: m.v },
    });
  }
  for (const cat of initialStore.expenseCats) {
    await prisma.expenseCategory.upsert({
      where: { period_name: { period: "2025-06", name: cat.name } },
      update: { value: cat.value },
      create: { period: "2025-06", name: cat.name, value: cat.value },
    });
  }

  // ---- Coin allocation ----
  for (const c of initialStore.coins) {
    await prisma.coinAllocation.upsert({
      where: { ticker: c.t },
      update: { pct: c.pct },
      create: { ticker: c.t, pct: c.pct },
    });
  }

  // ---- Capital history (company weekly snapshots) ----
  await prisma.capitalSnapshot.deleteMany({ where: { scope: "company" } });
  const weeksBack = HISTORY.length - 1;
  for (let i = 0; i < HISTORY.length; i++) {
    const capturedAt = new Date(now - (weeksBack - i) * 7 * 24 * 3600 * 1000);
    await prisma.capitalSnapshot.create({ data: { scope: "company", value: HISTORY[i].value, capturedAt } });
  }
  // one personal snapshot (current total)
  const personalTotal = initialStore.assets.reduce((s, a) => s + a.value, 0);
  await prisma.capitalSnapshot.deleteMany({ where: { scope: "personal" } });
  await prisma.capitalSnapshot.create({ data: { scope: "personal", value: personalTotal } });

  // ---- Price cache (approx seed; real prices in Stage 6) ----
  const prices: Record<string, number> = { BTC: 68000, ETH: 3500, TRX: 0.12, TON: 6.5, USDT: 1 };
  for (const [symbol, usd] of Object.entries(prices)) {
    await prisma.priceCache.upsert({ where: { symbol }, update: { usd }, create: { symbol, usd } });
  }

  // ---- Sync state ----
  await prisma.syncState.upsert({ where: { source: "crypto" }, update: { lastSyncedAt: new Date(), ok: true }, create: { source: "crypto", lastSyncedAt: new Date(), ok: true } });
  await prisma.syncState.upsert({ where: { source: "sheets" }, update: { lastSyncedAt: new Date(), ok: true }, create: { source: "sheets", lastSyncedAt: new Date(), ok: true } });

  console.log("Seed complete:", { email, assets: initialStore.assets.length, wallets: WALLETS.length, agencies: AGENCIES.length });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
