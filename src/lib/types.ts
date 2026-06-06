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

export interface PersonalStore {
  assets: Asset[];
  flows: { expenses: FlowExpenses; dividends: FlowDividends };
  expenseCats: ExpenseCat[];
  expenseMonths: ExpenseMonth[];
  coins: CoinAlloc[];
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
