/* Mock data ported verbatim from the prototype. These are the data contracts
   for the future DB schema & API responses (Stage 3+). */

import type {
  PersonalStore,
  ChartSeries,
  Wallet,
  Agency,
  HistoryPoint,
  Reserves,
} from "./types";

/* ===== Personal (dashboard-content.js → STORE / CHARTS) ===== */

export const initialStore: PersonalStore = {
  assets: [
    { id: "crypto", icon: "coins", name: "Крипта-инвест", value: 213400, delta: 4.2, src: "sync", bucket: "crypto" },
    { id: "wallet", icon: "wallet", name: "Остаток кошелька", value: 38920, delta: 1.1, src: "sync", bucket: "crypto" },
    { id: "cash", icon: "cash", name: "Наличные", value: 52000, delta: null, src: "manual", bucket: "cash" },
    { id: "cars", icon: "car", name: "Автомобили", value: 96500, delta: -0.8, src: "manual", bucket: "vehicles" },
    { id: "val", icon: "gem", name: "Ценные вещи", value: 34200, delta: 2.0, src: "manual", bucket: "other" },
  ],
  flows: {
    expenses: { value: 8430, delta: -12 },
    dividends: { value: 6240 },
  },
  expenseCats: [
    { name: "Жильё", value: 3200 },
    { name: "Питание", value: 2100 },
    { name: "Транспорт", value: 1150 },
    { name: "Развлечения", value: 820 },
    { name: "Прочее", value: 1160 },
  ],
  expensesByPeriod: {
    "2025-06": [
      { name: "Жильё", value: 3200 },
      { name: "Питание", value: 2100 },
      { name: "Транспорт", value: 1150 },
      { name: "Развлечения", value: 820 },
      { name: "Прочее", value: 1160 },
    ],
  },
  expenseSubs: {},
  cryptoWallets: [],
  walletHistory: [],
  expenseMonths: [
    { m: "Янв", v: 9100 },
    { m: "Фев", v: 8800 },
    { m: "Мар", v: 9300 },
    { m: "Апр", v: 8200 },
    { m: "Май", v: 8900 },
    { m: "Июн", v: 8430 },
  ],
  coins: [
    { t: "BTC", pct: 48 },
    { t: "ETH", pct: 31 },
    { t: "USDT", pct: 21 },
  ],
  dividendsList: [
    { date: "15 мая", name: "Стейкинг ETH", amount: 1630 },
    { date: "21 апр", name: "USDT lending", amount: 980 },
    { date: "18 мар", name: "Стейкинг SOL", amount: 1240 },
    { date: "12 фев", name: "Дивиденды AAPL", amount: 860 },
    { date: "20 янв", name: "USDT lending", amount: 1530 },
  ],
  otherInvestments: { total: 0, items: [] },
  expenseWeeks: [],
  expenseWeeksByPeriod: {},
  expenseWeekSubs: {},
  expenseTxns: {},
  expenseWeekTxns: {},
};

// Demo income so the расходы/доходы chart has a second series in dev (no DB).
initialStore.expenseMonths = [
  { m: "Янв", v: 9100, income: 12400 },
  { m: "Фев", v: 8800, income: 9300 },
  { m: "Мар", v: 9300, income: 15200 },
  { m: "Апр", v: 8200, income: 7600 },
  { m: "Май", v: 8900, income: 18100 },
  { m: "Июн", v: 8430, income: 11200 },
];

export const CHARTS: Record<string, ChartSeries> = {
  "Н": { v: [431, 430, 432, 431, 433, 434, 435], l: ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"], d: 0.9, a: "+$3,910" },
  "М": { v: [425, 424, 427, 429, 431, 433, 435], l: ["1", "5", "10", "15", "20", "25", "30"], d: 2.4, a: "+$10,140" },
  "6М": { v: [360, 372, 368, 395, 412, 435], l: ["Янв", "Фев", "Мар", "Апр", "Май", "Июн"], d: 5.8, a: "+$23,840" },
  "Г": { v: [368, 355, 372, 360, 378, 385, 396, 402, 410, 418, 427, 435], l: ["Я", "Ф", "М", "А", "М", "И", "И", "А", "С", "О", "Н", "Д"], d: 18.3, a: "+$67,300" },
  "Всё": { v: [180, 205, 255, 330, 435], l: ["2021", "2022", "2023", "2024", "2025"], d: 141, a: "+$255,020" },
};

export const PERIODS = ["1Н", "1М", "3М", "6М", "1Г"] as const;

/* ===== Company (dashboard-company.js → WALLETS / AGENCIES / HISTORY) ===== */

export const WALLETS: Wallet[] = [
  { id: "w_clean_1", label: "Основной чистый", addr: "TJ8x4Qw1PqR7mNv2KdZ6hLcUa9Yb3eF5G", balance: 420000, type: "main", group: "clean", synced: "2 мин назад" },
  { id: "w_d1", label: "Trading 01", addr: "TRX9aLmK2pQ7Vn4Df8sWc1Eb6Yh3Zt5Ju", balance: 310000, type: "main", group: "dirty", synced: "2 мин назад" },
  { id: "w_d2", label: "Payments 02", addr: "TQp3Mw7Kd1Rv9Zn2Lc8Fb4Yh6Et5Su0Ja", balance: 185000, type: "main", group: "dirty", synced: "3 мин назад" },
  { id: "w_d3", label: "Reserve 03", addr: "TLk6Vn2Qp9Mw1Rd7Zc4Fb8Yh3Et5Su2Jb", balance: 96500, type: "main", group: "dirty", synced: "2 мин назад" },
  { id: "w_d4", label: "Ops 04", addr: "TMx2Kd8Qw1Vn7Rp4Zc9Fb6Yh2Et3Su5Jc", balance: 54200, type: "main", group: "dirty", synced: "5 мин назад" },
  { id: "w_d5", label: "Buffer 05", addr: "TNy7Vn3Qp2Mw9Rd1Zc6Fb4Yh8Et2Su7Jd", balance: 38900, type: "main", group: "dirty", synced: "4 мин назад" },
  { id: "w_s1", label: "Hot 06", addr: "TPa4Kd9Qw3Vn1Rp8Zc2Fb7Yh5Et4Su9Je", balance: 4800, type: "small", group: "dirty", synced: "6 мин назад" },
  { id: "w_s2", label: "Hot 07", addr: "TRb8Vn1Qp6Mw4Rd2Zc9Fb3Yh7Et1Su8Jf", balance: 3200, type: "small", group: "dirty", synced: "7 мин назад" },
  { id: "w_s3", label: "Hot 08", addr: "TSc2Kd6Qw9Vn3Rp1Zc8Fb5Yh4Et2Su6Jg", balance: 2100, type: "small", group: "dirty", synced: "9 мин назад" },
  { id: "w_s4", label: "Hot 09", addr: "TUd9Vn4Qp1Mw7Rd6Zc3Fb2Yh8Et5Su1Jh", balance: 1450, type: "small", group: "dirty", synced: "11 мин назад" },
  { id: "w_s5", label: "Hot 10", addr: "TVe1Kd7Qw2Vn9Rp3Zc6Fb8Yh1Et4Su3Ji", balance: 890, type: "small", group: "dirty", synced: "14 мин назад" },
  { id: "w_s6", label: "Hot 11", addr: "TWf6Vn2Qp8Mw1Rd4Zc7Fb3Yh9Et2Su5Jk", balance: 520, type: "small", group: "dirty", synced: "18 мин назад" },
  { id: "w_s7", label: "Hot 12", addr: "TXg3Kd1Qw7Vn5Rp2Zc4Fb9Yh6Et8Su2Jl", balance: 310, type: "small", group: "dirty", synced: "22 мин назад" },
  { id: "w_s8", label: "Hot 13", addr: "TYh8Vn5Qp3Mw2Rd9Zc1Fb6Yh4Et7Su9Jm", balance: 95, type: "small", group: "dirty", synced: "26 мин назад" },
];

export const AGENCIES: Agency[] = [
  { id: "a1", platform: "Meta Ads", name: "Agency Alpha", balance: 128400, updated: "сегодня", staleDays: 0, by: "Анна" },
  { id: "a2", platform: "Google Ads", name: "Agency Beta", balance: 86200, updated: "1 день назад", staleDays: 1, by: "Анна" },
  { id: "a3", platform: "TikTok Ads", name: "Agency Gamma", balance: 42750, updated: "3 дня назад", staleDays: 3, by: "Игорь" },
  { id: "a4", platform: "Microsoft Ads", name: "Agency Delta", balance: 18300, updated: "5 дней назад", staleDays: 5, by: "Игорь" },
  { id: "a5", platform: "X / Twitter", name: "Agency Epsilon", balance: 9100, updated: "сегодня", staleDays: 0, by: "Анна" },
];

export const HISTORY: HistoryPoint[] = [
  { week: "10 мар", value: 1042000 }, { week: "17 мар", value: 1078000 }, { week: "24 мар", value: 1061000 },
  { week: "31 мар", value: 1115000 }, { week: "7 апр", value: 1154000 }, { week: "14 апр", value: 1132000 },
  { week: "21 апр", value: 1189000 }, { week: "28 апр", value: 1207000 }, { week: "5 мая", value: 1198000 },
  { week: "12 мая", value: 1235000 }, { week: "19 мая", value: 1258000 }, { week: "26 мая", value: 1271715 },
];

export const DEFAULT_RESERVES: Reserves = { salaryWeekly: 24000, salaryWeeks: 4, tech: 35000, agencyReserve: 0 };
