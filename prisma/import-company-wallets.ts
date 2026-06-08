import "dotenv/config";
import { PrismaClient, Chain, WalletGroup, WalletKind } from "@prisma/client";

const prisma = new PrismaClient();

/* Idempotent bulk import of the company USDT wallets (TRC20 / BEP20 / ERC20).
 *
 * Runs on every deploy (see docker-entrypoint.sh), AFTER migrations and the
 * first-boot seed. Upsert is keyed by the natural unique (chain, address, token),
 * so re-running never duplicates rows; balances, holdings and lastSyncedAt are
 * left untouched — those are owned by the crypto sync. Only the descriptive
 * fields (label/group/kind/scope) are kept in sync with this list.
 *
 * Wallets manually added through the UI that are NOT in this list are left
 * alone (we never delete here). To remove a wallet, delete it in the UI. */

type Row = { label: string; group: WalletGroup; chain: Chain; address: string };

// group: clean = «чистый», dirty = «грязный». kind is "main" for all (per decision —
// re-tag «мелкие» in the UI). One EVM address (0xEf497…) is intentionally present on
// both BSC and ETH — those are two distinct wallets (different networks).
const WALLETS: Row[] = [
  // ---- Tron (TRC20) ----
  { label: "Общая приемка new", group: "dirty", chain: "TRX", address: "TJuBYBZiUBCv9XUkqFAbq57DMz5Pfcbkk6" },
  { label: "CoinLink new", group: "dirty", chain: "TRX", address: "TJwtXY2KFVNKtWr22ggicb4J5JhGTLeJz8" },
  { label: "Тестовый new", group: "dirty", chain: "TRX", address: "TXupnC2aKRjT8YiywvCj8fSedpfVLQ7uXi" },
  { label: "Запасной new", group: "dirty", chain: "TRX", address: "TAmbC8nkvzinqjpfejeR4xWJjnXiiJ7aoH" },
  { label: "Для лидов new", group: "dirty", chain: "TRX", address: "TSrpAFZoULKSG6ERFr5aCNbLRSXNgknooh" },
  { label: "Подрядчики", group: "dirty", chain: "TRX", address: "TKPdoBbsnCbuJD85KzKSbDKZWvPUdz49Po" },
  { label: "CoinLink", group: "dirty", chain: "TRX", address: "TL2VnhvkFSses8cxNyWPystwYjxzqUuuGo" },
  { label: "Общая приемка", group: "dirty", chain: "TRX", address: "TVoRZw5CJgvNxGD8XE1wt6TAKcmVmGsX5x" },
  { label: "Для лидов", group: "dirty", chain: "TRX", address: "TSHZoztCvsSKwoY2Jwru5JMbGMK8d7geVu" },
  { label: "43 Хранилище", group: "clean", chain: "TRX", address: "TB9QZAUdCbVsRidP86ebQ8fP8ViBSDuj3H" },
  { label: "Запасной", group: "dirty", chain: "TRX", address: "TDMH6nWYhf3GiKpA1uxYyW7rxVcc9TyQvm" },
  { label: "Тестовый", group: "dirty", chain: "TRX", address: "TMxurV2au392Npi2yrF5SqxdXsyJrTNNrB" },
  { label: "Ntrc", group: "dirty", chain: "TRX", address: "TSmBjEcfyn7pPgDon7BBP7W8dj7nKRChb6" },
  { label: "Тех расходы trc 2", group: "dirty", chain: "TRX", address: "TKrsdNa83rgNutPDKwgbFFh7LNGDywRfrh" },
  { label: "TRC Coin 1", group: "dirty", chain: "TRX", address: "TLfzjNCPsidf8f7JBJCvqSPsNrrv18sgrt" },
  { label: "TRC Coin 2", group: "dirty", chain: "TRX", address: "TYi84hXErS5YYCShWcNMk4f1pnHePxtVmC" },
  { label: "TRC Coin 3", group: "dirty", chain: "TRX", address: "TMBnpgwRv2Q1XkiU48itpnHn7hBrspZ51h" },
  { label: "Технические расходы ОМ (А)", group: "dirty", chain: "TRX", address: "TBCRobWxSNJhQyAdGiETesL9m8yYM6nntZ" },

  // ---- BNB Smart Chain (BEP20) ----
  { label: "Тестовый BSC", group: "dirty", chain: "BSC", address: "0xa760B1B4492be8f96ca923328fc6E685eaC76E9d" },
  { label: "Cbsc", group: "dirty", chain: "BSC", address: "0xEf497758197184d2B981Fd43e81F51291468754D" },
  { label: "Ubsc", group: "dirty", chain: "BSC", address: "0x419f50c4BFe47D1A4568382822B3Ccb596b9A32b" },
  { label: "Zbsc", group: "dirty", chain: "BSC", address: "0xDc51F4E3Ac386E2f18252Fa85227A69EC88A3C37" },
  { label: "Pbsc", group: "dirty", chain: "BSC", address: "0x33dc1Cf6765c949cF6EC7Db7CE82Bc1a54eB2a5A" },
  { label: "Nbsc", group: "dirty", chain: "BSC", address: "0xEf435aD6b6Bed47226314978173cD1D3F2140055" },
  { label: "U2bsc", group: "dirty", chain: "BSC", address: "0x4B155BCBC933A84176Fc8C0BC5a9f8146abEeB26" },
  { label: "Запасной BSC", group: "dirty", chain: "BSC", address: "0xe6C98c06D366b3aD02c4a1E5bD3c1c57b79891D0" },
  { label: "Подрядчики BSC", group: "dirty", chain: "BSC", address: "0x6e4D12B970Ab1F95FC445d5ae8c97261DD84C1e5" },
  { label: "Для лидов BSC", group: "dirty", chain: "BSC", address: "0xb9638eb0973eF3C950594Bec7Ef0946F0ad6A0Ab" },
  { label: "Ubsc3", group: "dirty", chain: "BSC", address: "0x69Bc572f930A15357667757D9482814A382e669e" },
  { label: "Cbsc3", group: "dirty", chain: "BSC", address: "0x0f0f3Cc63BBBCf8247e9EC90d87C1A8736c51A13" },
  { label: "Подрядчики BSC3", group: "dirty", chain: "BSC", address: "0x6bd502cCfaBf8F91BFad44F7f7e74a954C96e4C2" },
  { label: "Запасной BSC3", group: "dirty", chain: "BSC", address: "0x11F304E82710417309dC3d17FdBfed31228eeCAa" },
  { label: "Для лидов BSC3", group: "dirty", chain: "BSC", address: "0xD2349B35f5C5A91912fa1A079C131c858F15B67c" },
  { label: "Хранилище Bsc", group: "clean", chain: "BSC", address: "0x5CC0155032a40b61036eaE32A04cFd1fC364afaF" },
  { label: "Хранилище 43 bsc", group: "clean", chain: "BSC", address: "0xcE8eC91aC4d9B1972416AAeC77A04c443e324A4c" },
  { label: "Тех расходы Bsc", group: "dirty", chain: "BSC", address: "0x846606b0f0d165c1D7bE848e2Fdf67499d33B1f3" },
  { label: "Тех расходы Bsc 2", group: "dirty", chain: "BSC", address: "0x814F1BA0CF72FE48d4f3af3cF126a30eaB3E2446" },

  // ---- Ethereum (ERC20) ----
  { label: "ERC кош приемки 2", group: "dirty", chain: "ETH", address: "0xEf497758197184d2B981Fd43e81F51291468754D" },
  { label: "ERC кош приемки", group: "dirty", chain: "ETH", address: "0xE3e84A1830499347fBFd8313827D3155C8b4dbc4" },
];

async function main() {
  const token = "USDT";
  const kind: WalletKind = "main";
  let created = 0;
  let updated = 0;

  for (const w of WALLETS) {
    const existing = await prisma.wallet.findUnique({
      where: { chain_address_token: { chain: w.chain, address: w.address, token } },
      select: { id: true },
    });
    await prisma.wallet.upsert({
      where: { chain_address_token: { chain: w.chain, address: w.address, token } },
      // Keep descriptive fields in sync; never touch balance/holdings/lastSyncedAt.
      update: { scope: "company", label: w.label, group: w.group, kind },
      create: { scope: "company", chain: w.chain, token, address: w.address, label: w.label, group: w.group, kind },
    });
    if (existing) updated++;
    else created++;
  }

  const byChain = WALLETS.reduce<Record<string, number>>((m, w) => ((m[w.chain] = (m[w.chain] || 0) + 1), m), {});
  console.log("Company wallets import complete:", { total: WALLETS.length, created, updated, byChain });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
