/* Shared domain types. Fields mirror the prototype mock contracts
   (STORE/CHARTS in dashboard-content.js, WALLETS/AGENCIES/HISTORY in
   dashboard-company.js) so they can map directly onto the DB schema later. */

export type DataSource = "sync" | "sheets" | "manual";
export type AssetBucket = "crypto" | "vehicles" | "cash" | "other";

export interface Asset {
  id: string;
  icon: string;
  name: string;
  value: number;
  delta: number | null;
  amount?: number | null; // token quantity (crypto)
  symbol?: string | null; // coin ticker (crypto)
  src: DataSource;
  bucket: AssetBucket;
}

export interface FlowExpenses {
  value: number;
  delta: number;
}
export interface FlowDividends {
  value: number;
}

export interface ExpenseCat {
  name: string;
  value: number;
}
export interface ExpenseMonth {
  m: string;
  v: number;
  period?: string; // "YYYY-MM"
}
export interface CoinAlloc {
  t: string;
  pct: number;
}
export interface Dividend {
  date: string;
  name: string;
  amount: number;
}

export interface ChartSeries {
  v: number[];
  l: string[];
  d: number;
  a: string;
}

export interface CryptoWalletHolding {
  symbol: string;
  chain: string;
  label: string;
  address: string;
  amount: number;
  usd: number;
}
export interface PersonalWalletRow {
  id: string;
  chain: string;
  label: string;
  address: string;
  balanceUsd: number;
  synced: string;
  staleDays?: number; // -1 = ни разу не синхронизирован; отсутствует = свежо (моки)
}
export interface SubCat {
  name: string;
  value: number;
}

export interface PersonalStore {
  assets: Asset[];
  flows: { expenses: FlowExpenses; dividends: FlowDividends };
  expenseCats: ExpenseCat[];
  expensesByPeriod: Record<string, ExpenseCat[]>;
  expenseSubs: Record<string, Record<string, SubCat[]>>; // period → parent → subs
  expenseMonths: ExpenseMonth[];
  coins: CoinAlloc[];
  cryptoWallets: CryptoWalletHolding[];
  dividendsList: Dividend[];
}

/* ---- Company ---- */
export type WalletType = "main" | "small";
export type WalletGroup = "clean" | "dirty";

export interface Wallet {
  id: string;
  label: string;
  addr: string;
  balance: number;
  type: WalletType;
  group: WalletGroup;
  synced: string;
  staleDays?: number; // -1 = ни разу не синхронизирован; отсутствует = свежо (моки)
}

export interface Agency {
  id: string;
  platform: string;
  name: string;
  balance: number;
  updated: string;
  staleDays: number;
  by: string;
}

export interface HistoryPoint {
  week: string;
  value: number;
}

export interface Reserves {
  salaryWeekly: number;
  salaryWeeks: number;
  tech: number;
}

/* ---- Shapes passed from server → client store ---- */
export interface PersonalData {
  assets: Asset[];
  flows: { expenses: FlowExpenses; dividends: FlowDividends };
  expenseCats: ExpenseCat[];
  expensesByPeriod: Record<string, ExpenseCat[]>;
  expenseSubs: Record<string, Record<string, SubCat[]>>;
  expenseMonths: ExpenseMonth[];
  coins: CoinAlloc[];
  cryptoWallets: CryptoWalletHolding[];
  personalWallets: PersonalWalletRow[];
  dividendsList: Dividend[];
  synced: string;
}

export interface CompanyData {
  wallets: Wallet[];
  agencies: Agency[];
  reserves: Reserves;
  history: HistoryPoint[];
  synced: string;
}

export interface InitialData {
  personal: PersonalData;
  company: CompanyData;
}
