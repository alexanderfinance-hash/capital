import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

/* Seed only the essentials. Real data is populated by the sync jobs:
 *  - personal crypto assets + allocation → /api/sync/crypto
 *  - expenses → /api/sync/expenses
 *  - company wallet balances → /api/sync/crypto
 * Demo/placeholder records are intentionally NOT seeded (start empty). */
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

  // ---- Personal crypto wallets (addresses to sync) ----
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
    { chain: "TON", addrs: [
      "UQA8iSpC1heDwyQK2H-0ALJ-zZqdqBPVi7sV9uMv55pybi-T",
      "UQBZZbHNNOe832nuXMalQwlRtvj_bcD7nIYHO7lwFbNEmALt",
    ] },
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

  // ---- Reserves (singleton, default what-if values) ----
  await prisma.reserve.upsert({
    where: { id: "default" },
    update: {},
    create: { id: "default", salaryWeekly: 24000, salaryWeeks: 4, tech: 35000 },
  });

  // ---- Sync state placeholders ----
  await prisma.syncState.upsert({ where: { source: "crypto" }, update: {}, create: { source: "crypto", ok: true } });
  await prisma.syncState.upsert({ where: { source: "sheets" }, update: {}, create: { source: "sheets", ok: true } });

  const personalWallets = PERSONAL_WALLETS.reduce((s, g) => s + g.addrs.length, 0);
  console.log("Seed complete:", { email, personalWallets });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
