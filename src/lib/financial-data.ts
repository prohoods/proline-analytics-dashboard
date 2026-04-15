// KeyBank account 440521000115 — DZV Distributing LLC
// 3-month bank statement data: January–March 2026
// Categorization rules:
//   Chinese supplier names (Shaoxing Graces, Shenzhen Dapeng, Ningbo Yingqi, etc.) = Factory / Inventory (COGS)
//   KWS Companies = Rent
//   CBIZ = Payroll
//   Freightpop, UPS, Saia Motor, XPO, Estes Express, Tforce, DSV = Shipping & Freight
//   Avalara = Taxes & Compliance
//   Items marked PENDING = boss is clarifying category

export interface ExpenseLineItem {
  vendor: string;
  amount: number;
  category: string;
  notes: string;
  pending?: boolean;
}

export interface MonthData {
  month: string;           // e.g. "January"
  shortMonth: string;      // e.g. "Jan"
  year: number;
  beginningBalance: number;
  endingBalance: number;
  totalDeposits: number;
  totalWithdrawals: number;
  expenses: ExpenseLineItem[];
}

export const statements: MonthData[] = [
  {
    month: "January",
    shortMonth: "Jan",
    year: 2026,
    beginningBalance: 47_916.58,
    endingBalance: 224_049.85,
    totalDeposits: 1_121_615.22,
    totalWithdrawals: 945_291.65,
    expenses: [
      { vendor: "Avalara", amount: 108_582.84, category: "Taxes & Compliance", notes: "Sales tax backfiling (one-time catch-up)" },
      { vendor: "DSV", amount: 53_684.19, category: "Shipping & Freight", notes: "Freight carrier" },
      { vendor: "CBIZ", amount: 84_000.00, category: "Payroll", notes: "Est. — multiple payroll runs (CBIZ ACH)", pending: true },
      { vendor: "Shenzhen Dapeng", amount: 20_000.00, category: "Factory / Inventory (COGS)", notes: "Wire transfer" },
      { vendor: "Shenzhen Dapeng", amount: 11_654.00, category: "Factory / Inventory (COGS)", notes: "Wire transfer" },
      { vendor: "KWS Companies", amount: 62_319.05, category: "Rent", notes: "Est. — warehouse/office lease", pending: true },
      { vendor: "Vendor Payments & Other", amount: 605_051.57, category: "Pending Review", notes: "KBBO ACH, internal transfers, cash withdrawals — pending boss clarification", pending: true },
    ],
  },
  {
    month: "February",
    shortMonth: "Feb",
    year: 2026,
    beginningBalance: 224_049.85,
    endingBalance: 261_731.28,
    totalDeposits: 913_648.00,
    totalWithdrawals: 875_886.29,
    expenses: [
      { vendor: "Ningbo Feishida", amount: 100_000.00, category: "Factory / Inventory (COGS)", notes: "Wire transfer — inventory" },
      { vendor: "KWS Companies", amount: 62_319.05, category: "Rent", notes: "Warehouse/office lease" },
      { vendor: "CBIZ", amount: 87_500.00, category: "Payroll", notes: "Est. — multiple payroll runs (CBIZ ACH)", pending: true },
      { vendor: "Saia Motor Freight", amount: 52_119.45, category: "Shipping & Freight", notes: "LTL freight carrier" },
      { vendor: "Avalara", amount: 32_399.10, category: "Taxes & Compliance", notes: "Sales tax remittance" },
      { vendor: "Vendor Payments & Other", amount: 541_548.69, category: "Pending Review", notes: "KBBO ACH, Dzv Distributing, internal transfers — pending boss clarification", pending: true },
    ],
  },
  {
    month: "March",
    shortMonth: "Mar",
    year: 2026,
    beginningBalance: 261_731.28,
    endingBalance: 187_110.58,
    totalDeposits: 1_214_118.04,
    totalWithdrawals: 1_288_738.74, // 261731.28 + 1214118.04 - 187110.58
    expenses: [
      { vendor: "Shaoxing Graces", amount: 100_000.00, category: "Factory / Inventory (COGS)", notes: "Wire transfer — inventory" },
      { vendor: "Shaoxing Graces", amount: 100_000.00, category: "Factory / Inventory (COGS)", notes: "Wire transfer — inventory" },
      { vendor: "Shaoxing Graces", amount: 100_000.00, category: "Factory / Inventory (COGS)", notes: "Wire transfer — inventory" },
      { vendor: "KWS Companies", amount: 64_108.36, category: "Rent", notes: "Warehouse/office lease (March 3)" },
      { vendor: "KWS Companies", amount: 64_108.36, category: "Rent", notes: "Warehouse/office lease (March 31)" },
      { vendor: "CBIZ", amount: 117_000.00, category: "Payroll", notes: "Est. — multiple payroll runs (CBIZ ACH)", pending: true },
      { vendor: "Avalara", amount: 42_903.42, category: "Taxes & Compliance", notes: "Sales tax remittance" },
      { vendor: "Saia Motor Freight", amount: 38_000.00, category: "Shipping & Freight", notes: "Est. — combined LTL runs", pending: true },
      { vendor: "Vendor Payments & Other", amount: 662_618.60, category: "Pending Review", notes: "KBBO ACH, Dzv Distributing, Worldwidelogis, Ferguson Ent, cash withdrawals — pending boss clarification", pending: true },
    ],
  },
];

// ── Derived helpers ──────────────────────────────────────────────────────────

export const CATEGORIES = [
  "Factory / Inventory (COGS)",
  "Payroll",
  "Rent",
  "Shipping & Freight",
  "Taxes & Compliance",
  "Pending Review",
] as const;

export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_COLORS: Record<string, string> = {
  "Factory / Inventory (COGS)": "bg-blue-500",
  "Payroll": "bg-purple-500",
  "Rent": "bg-orange-500",
  "Shipping & Freight": "bg-cyan-500",
  "Taxes & Compliance": "bg-yellow-500",
  "Pending Review": "bg-gray-600",
};

export const CATEGORY_TEXT: Record<string, string> = {
  "Factory / Inventory (COGS)": "text-blue-400",
  "Payroll": "text-purple-400",
  "Rent": "text-orange-400",
  "Shipping & Freight": "text-cyan-400",
  "Taxes & Compliance": "text-yellow-400",
  "Pending Review": "text-gray-400",
};

/** Sum expenses for a month by category */
export function sumByCategory(month: MonthData): Record<string, number> {
  const result: Record<string, number> = {};
  for (const e of month.expenses) {
    result[e.category] = (result[e.category] ?? 0) + e.amount;
  }
  return result;
}

/** Sum expenses across all months by category */
export function totalByCategory(): Record<string, number> {
  const result: Record<string, number> = {};
  for (const m of statements) {
    for (const e of m.expenses) {
      result[e.category] = (result[e.category] ?? 0) + e.amount;
    }
  }
  return result;
}

/** Q1 2026 totals */
export const q1 = {
  totalDeposits: statements.reduce((s, m) => s + m.totalDeposits, 0),
  totalWithdrawals: statements.reduce((s, m) => s + m.totalWithdrawals, 0),
  beginningBalance: statements[0].beginningBalance,
  endingBalance: statements[statements.length - 1].endingBalance,
};
