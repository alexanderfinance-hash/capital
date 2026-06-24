/* Shared domain types. Fields mirror the prototype mock contracts
   (STORE/CHARTS in dashboard-content.js, WALLETS/AGENCIES/HISTORY in
   dashboard-company.js) so they can map directly onto the DB schema later. */

export type DataSource = "sync" | "sheets" | "manual";
export type AssetBucket = "crypto" | "vehicles" | "cash" | "other";

export interface Asset {
  id: string;
  icon: string;
  name: string;
  value: number; // USD (converted from `currency` at the current CBR rate)
  delta: number | null;
  amount?: number | null; // token quantity (crypto)
  symbol?: string | null; // coin ticker (crypto)
  currency?: string; // "USD" | "RUB" — currency the value was entered in
  nativeValue?: number | null; // original amount in `currency` (when not USD)
  investment?: boolean; // tracked on the Инвестиции tab ("Другие инвестиции")
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
  v: number; // expenses (USD)
  income?: number; // personal income for the month (USD, mostly dividends)
  period?: string; // "YYYY-MM"
}

export interface ExpenseWeek {
  w: string;      // label "01.06–07.06"
  v: number;      // expenses USD
  weekEnd: string; // "YYYY-MM-DD"
  income?: number; // net profit for the week (USD, from «Отчет Общий»)
}

/** Expense rows reclassified as investments (education etc.). Shown on
 *  Инвестиции separately and NOT counted in the portfolio total. */
export interface OtherInvestmentItem {
  name: string; // "Образование и развитие · Коучи/преподаватели/наставники"
  value: number; // USD
}
export interface OtherInvestments {
  total: number; // USD
  items: OtherInvestmentItem[];
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

/** One dated capital snapshot — drives the real history line charts (PRD §6).
 *  `t` is an ISO timestamp (for period filtering); `label` is "5 июн". */
export interface SnapshotPoint {
  t: string;
  label: string;
  value: number;
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

/** Отдельный платёж из ДДС-журнала (для раскрытия подкатегории до трат). */
export interface ExpenseTxn {
  date: string; // "YYYY-MM-DD"
  comment: string; // столбец H ДДС («Комментарий к платежу»)
  value: number; // USD (отмасштабирован под итог подкатегории)
}
/** period|weekEnd → Статья → Подстатья → платежи. */
export type ExpenseTxnTree = Record<string, Record<string, Record<string, ExpenseTxn[]>>>;

export interface PersonalStore {
  assets: Asset[];
  flows: { expenses: FlowExpenses; dividends: FlowDividends };
  expenseCats: ExpenseCat[];
  expensesByPeriod: Record<string, ExpenseCat[]>;
  expenseSubs: Record<string, Record<string, SubCat[]>>; // period → parent → subs
  expenseMonths: ExpenseMonth[];
  expenseWeeks: ExpenseWeek[];
  expenseWeeksByPeriod: Record<string, ExpenseCat[]>; // weekEnd → categories
  expenseWeekSubs: Record<string, Record<string, SubCat[]>>; // weekEnd → parent → subs
  expenseTxns: ExpenseTxnTree; // period → parent → sub → платежи
  expenseWeekTxns: ExpenseTxnTree; // weekEnd → parent → sub → платежи
  coins: CoinAlloc[];
  cryptoWallets: CryptoWalletHolding[];
  dividendsList: Dividend[];
  otherInvestments: OtherInvestments;
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
  agencyReserve: number; // резерв на рекламные агентства
}

/** CoinLink accounts payable (кредиторская задолженность), synced from the
 *  external `coinlink_payable` view. Subtracted from "available to withdraw". */
export interface CoinlinkPayablePartner {
  partner: string;
  debt: number;
}
export interface CompanyPayable {
  total: number;
  partners: CoinlinkPayablePartner[];
  synced: string;
  staleDays: number; // -1 = ни разу не синхронизирован
}

/** Live unit price of one anonymous TON number (nums888.io), shown next to the
 *  TON-number asset. `usd` = 0 until the first successful sync. */
export interface TonNumberRate {
  usd: number;
  synced: string;
  staleDays: number; // -1 = ни разу не синхронизирован
}

/* ---- Shapes passed from server → client store ---- */
export interface PersonalData {
  assets: Asset[];
  flows: { expenses: FlowExpenses; dividends: FlowDividends };
  expenseCats: ExpenseCat[];
  expensesByPeriod: Record<string, ExpenseCat[]>;
  expenseSubs: Record<string, Record<string, SubCat[]>>;
  expenseMonths: ExpenseMonth[];
  expenseWeeks: ExpenseWeek[];
  expenseWeeksByPeriod: Record<string, ExpenseCat[]>;
  expenseWeekSubs: Record<string, Record<string, SubCat[]>>;
  expenseTxns: ExpenseTxnTree;
  expenseWeekTxns: ExpenseTxnTree;
  coins: CoinAlloc[];
  cryptoWallets: CryptoWalletHolding[];
  personalWallets: PersonalWalletRow[];
  dividendsList: Dividend[];
  otherInvestments: OtherInvestments;
  capitalHistory: SnapshotPoint[];
  cryptoHistory: SnapshotPoint[];
  tonNumberRate: TonNumberRate;
  usdRub: number; // current USD→RUB rate (RUB per 1 USD), for RUB asset entry/display
  synced: string;
}

export interface CompanyData {
  wallets: Wallet[];
  agencies: Agency[];
  reserves: Reserves;
  payable: CompanyPayable;
  history: HistoryPoint[];
  synced: string;
}

export interface InitialData {
  personal: PersonalData;
  company: CompanyData;
}
