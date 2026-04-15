// DZV Distributing LLC — KeyBank Q1 2026
//
// TWO ACCOUNTS:
//   115 = 440521000115  Main operating/revenue account
//   2285 = 440521002285 Payroll & expense account (funded by transfers from 115)
//
// P&L treatment:
//   - "Internet Trf To DDA 0000440521002285" in account 115 = EXCLUDED (internal funding move)
//   - All actual spending in account 2285 = INCLUDED as real expenses
//   - Inter-account transfers cancel; combined expenses = 115 (ex-transfers) + 2285 actuals
//
// Categorization rules (confirmed):
//   Chinese supplier names (Shaoxing, Shenzhen, Ningbo, Zhejiang) = Factory / Inventory (COGS)
//   KWS Companies                                                   = Rent
//   CBIZ                                                            = Payroll
//   Saia Motor, Estes, XPO, Tforce, DSV, Freightpop                = Shipping & Freight
//   Avalara                                                         = Taxes & Compliance
//   Connexity, MS Ads, Grow My Ads, Pinterest, Facebook, KSL        = Digital Advertising
//   Shopify, Klaviyo, Adobe, Nexcess, Liquid Web, SaaS tools        = SaaS & Software
//   Mangoecommerce, Thinkshaw, Callrail, Authority Builders         = Marketing Services
//   All remaining account 115 items                                 = Pending Review (boss clarifying)

export interface ExpenseLineItem {
  vendor: string;
  amount: number;
  category: string;
  notes: string;
  account?: "115" | "2285";
  pending?: boolean;
}

export interface MonthData {
  month: string;
  shortMonth: string;
  year: number;
  // Account 115 (main)
  acct115BeginBalance: number;
  acct115EndBalance: number;
  acct115Deposits: number;
  acct115Withdrawals: number;        // raw, includes inter-account transfers
  acct115TransfersTo2285: number;    // to exclude from P&L
  // Account 2285 (payroll/expense)
  acct2285BeginBalance: number;
  acct2285EndBalance: number;
  acct2285Additions: number;         // includes transfers from 115 + Amazon refunds
  acct2285Subtractions: number;      // actual expenses
  acct2285Fees: number;
  // Expense line items (both accounts combined, ex inter-account)
  expenses: ExpenseLineItem[];
}

export const statements: MonthData[] = [
  {
    month: "January",
    shortMonth: "Jan",
    year: 2026,
    // Account 115
    acct115BeginBalance: 47_916.58,
    acct115EndBalance: 224_049.85,
    acct115Deposits: 1_121_615.22,
    acct115Withdrawals: 945_291.65,
    acct115TransfersTo2285: 10_001.20,
    // Account 2285
    acct2285BeginBalance: 66_487.98,
    acct2285EndBalance: -1_001.72,
    acct2285Additions: 10_956.52,
    acct2285Subtractions: 78_326.22,
    acct2285Fees: 120.00,
    expenses: [
      // ── Account 115 — confirmed large items ────────────────────────────
      { vendor: "Avalara (backfiling)", amount: 108_582.84, category: "Taxes & Compliance", notes: "Sales tax backfiling — one-time catch-up", account: "115" },
      { vendor: "DSV Freight", amount: 53_684.19, category: "Shipping & Freight", notes: "LTL carrier", account: "115" },
      { vendor: "CBIZ Payroll", amount: 84_000.00, category: "Payroll", notes: "Est. — CBIZ ACH payroll runs", account: "115", pending: true },
      { vendor: "Shenzhen Dapeng", amount: 20_000.00, category: "Factory / Inventory (COGS)", notes: "Wire transfer", account: "115" },
      { vendor: "Shenzhen Dapeng", amount: 11_654.00, category: "Factory / Inventory (COGS)", notes: "Wire transfer", account: "115" },
      { vendor: "KWS Companies", amount: 62_319.05, category: "Rent", notes: "Warehouse/office lease — est. Jan amount", account: "115", pending: true },
      { vendor: "Vendor Payments — KBBO ACH", amount: 565_000.00, category: "Vendor Payments (KBBO)", notes: "KBBO ACH debits — Google Ads, contractors, Zline, others. Exact split TBD.", account: "115", pending: true },
      { vendor: "Worldwidelogis Dzurov", amount: 11_549.57, category: "Import & Customs", notes: "Import & customs broker for Chinese factory shipments", account: "115", pending: true },
      { vendor: "Branch Cash Withdrawal (0052 Utah)", amount: 7_000.00, category: "Petty Cash", notes: "Regular cash withdrawal — petty cash", account: "115", pending: true },
      { vendor: "LGS1997BYU PayPal (Nate tuition)", amount: 1_500.00, category: "Owner Draw / Personal", notes: "Owner's child tuition payments via PayPal", account: "115", pending: true },
      // ── Account 2285 — categorized from statement review ───────────────
      { vendor: "Microsoft Ads", amount: 12_851.00, category: "Digital Advertising", notes: "5 charges in Jan, Bing/MS Ads campaigns", account: "2285" },
      { vendor: "Grow My Ads LLC", amount: 7_939.00, category: "Digital Advertising", notes: "Google Ads management agency", account: "2285" },
      { vendor: "Connexity", amount: 3_995.00, category: "Digital Advertising", notes: "Shopping comparison ad network (~23 charges)", account: "2285" },
      { vendor: "Facebook / Meta Ads", amount: 427.00, category: "Digital Advertising", notes: "Facebook ad spend", account: "2285" },
      { vendor: "KSL.com", amount: 725.00, category: "Digital Advertising", notes: "Local Utah advertising", account: "2285" },
      { vendor: "Wf *Ph-Ad (Wells Fargo Phone Ads)", amount: 1_000.00, category: "Digital Advertising", notes: "Phone/display advertising", account: "2285" },
      { vendor: "TikTok Promote", amount: 25.00, category: "Digital Advertising", notes: "", account: "2285" },
      { vendor: "Shopify Platform Fees", amount: 4_716.00, category: "SaaS & Software", notes: "Platform + app charges (4 invoices)", account: "2285" },
      { vendor: "Google Workspace", amount: 438.00, category: "SaaS & Software", notes: "2 accounts (Proline + Prohoods)", account: "2285" },
      { vendor: "Klaviyo", amount: 932.67, category: "SaaS & Software", notes: "Email marketing platform", account: "2285" },
      { vendor: "Adobe", amount: 508.00, category: "SaaS & Software", notes: "Creative Cloud", account: "2285" },
      { vendor: "Nexcess / Liquid Web", amount: 1_039.00, category: "SaaS & Software", notes: "Web hosting — multiple charges", account: "2285" },
      { vendor: "Microsoft 365", amount: 1_010.00, category: "SaaS & Software", notes: "Business subscription", account: "2285" },
      { vendor: "Other SaaS & Subscriptions", amount: 4_162.00, category: "SaaS & Software", notes: "Notion, Slack, Callrail, Shipstation, Claude.ai, OpenAI, Adobe, Rankability, etc.", account: "2285" },
      { vendor: "Mangoecommerce", amount: 5_488.00, category: "Marketing Services", notes: "eCommerce agency ($3,200 + $2,288)", account: "2285" },
      { vendor: "Thinkshaw.com", amount: 200.00, category: "Marketing Services", notes: "Marketing service (small in Jan, $5,800 from Feb)", account: "2285" },
      { vendor: "Authority Builders LLC", amount: 1_000.00, category: "Marketing Services", notes: "SEO / link building", account: "2285" },
      { vendor: "Other Marketing Services", amount: 1_228.00, category: "Marketing Services", notes: "Callrail, KSL (already counted above), Definedigital, Apple.com, GoDaddy, etc.", account: "2285" },
      { vendor: "Avalara (monthly)", amount: 4_823.00, category: "Taxes & Compliance", notes: "Monthly compliance — 2 entries from 2285 acct", account: "2285" },
      { vendor: "Amazon & Office Purchases", amount: 10_200.00, category: "Operations & Supplies", notes: "Amazon orders, Costco, Walmart — incl. product-related supplies", account: "2285" },
      { vendor: "Professional Services & Materials", amount: 7_264.00, category: "Operations & Supplies", notes: "Affiliated Metals $3,638 + Veritiv-West $2,047 + Alibaba.com $1,579", account: "2285" },
      { vendor: "Team Meals (Ezcater & restaurants)", amount: 1_633.00, category: "Meals & Entertainment", notes: "4 × team lunch orders", account: "2285" },
      { vendor: "Travel (Delta flights — 3 tickets)", amount: 1_586.00, category: "Travel", notes: "3 × $517 Delta + Airbnb — likely trade show", account: "2285" },
      { vendor: "Postage (Stamps.com)", amount: 900.00, category: "Operations & Supplies", notes: "Multiple postage top-ups", account: "2285" },
      { vendor: "Bank Fees (Overdraft)", amount: 120.00, category: "Bank Fees", notes: "Account went to -$1,002 end of Jan", account: "2285" },
      { vendor: "Misc & Small Transactions (2285)", amount: 6_702.00, category: "Misc & Other", notes: "Remaining small items not individually broken out", account: "2285" },
    ],
  },
  {
    month: "February",
    shortMonth: "Feb",
    year: 2026,
    // Account 115
    acct115BeginBalance: 224_049.85,
    acct115EndBalance: 261_731.28,
    acct115Deposits: 913_648.00,
    acct115Withdrawals: 875_886.29,
    acct115TransfersTo2285: 80_012.95,
    // Account 2285
    acct2285BeginBalance: -1_001.72,
    acct2285EndBalance: 17_579.15,
    acct2285Additions: 81_677.16,
    acct2285Subtractions: 63_096.29,
    acct2285Fees: 0,
    expenses: [
      // ── Account 115 ─────────────────────────────────────────────────────
      { vendor: "Ningbo Feishida", amount: 100_000.00, category: "Factory / Inventory (COGS)", notes: "Wire transfer — inventory", account: "115" },
      { vendor: "KWS Companies", amount: 62_319.05, category: "Rent", notes: "Warehouse/office lease", account: "115" },
      { vendor: "CBIZ Payroll", amount: 87_500.00, category: "Payroll", notes: "Est. — CBIZ ACH payroll runs", account: "115", pending: true },
      { vendor: "Saia Motor Freight", amount: 52_119.45, category: "Shipping & Freight", notes: "LTL freight carrier", account: "115" },
      { vendor: "Avalara (large remittance)", amount: 32_399.10, category: "Taxes & Compliance", notes: "Sales tax remittance", account: "115" },
      { vendor: "Vendor Payments — KBBO ACH", amount: 445_000.00, category: "Vendor Payments (KBBO)", notes: "KBBO ACH debits — Google Ads, contractors, Zline, others. Exact split TBD.", account: "115", pending: true },
      { vendor: "Worldwidelogis Dzurov", amount: 8_035.74, category: "Import & Customs", notes: "Import & customs broker for Chinese factory shipments", account: "115", pending: true },
      { vendor: "Branch Cash Withdrawal (0052 Utah)", amount: 7_000.00, category: "Petty Cash", notes: "Regular cash withdrawal — petty cash", account: "115", pending: true },
      { vendor: "LGS1997BYU PayPal (Nate tuition)", amount: 1_500.00, category: "Owner Draw / Personal", notes: "Owner's child tuition payments via PayPal", account: "115", pending: true },
      // ── Account 2285 ─────────────────────────────────────────────────────
      { vendor: "Microsoft Ads", amount: 10_536.00, category: "Digital Advertising", notes: "4 charges — Bing/MS Ads campaigns", account: "2285" },
      { vendor: "Grow My Ads LLC", amount: 7_179.00, category: "Digital Advertising", notes: "Google Ads management agency", account: "2285" },
      { vendor: "Connexity", amount: 3_971.00, category: "Digital Advertising", notes: "Shopping comparison — ~24 charges", account: "2285" },
      { vendor: "Facebook / Meta Ads", amount: 916.00, category: "Digital Advertising", notes: "Facebook campaigns", account: "2285" },
      { vendor: "Pinterest Ads", amount: 550.00, category: "Digital Advertising", notes: "", account: "2285" },
      { vendor: "KSL.com", amount: 725.00, category: "Digital Advertising", notes: "Local Utah advertising", account: "2285" },
      { vendor: "Wf *Ph-Ad", amount: 1_000.00, category: "Digital Advertising", notes: "Phone/display advertising", account: "2285" },
      { vendor: "TikTok Promote", amount: 29.00, category: "Digital Advertising", notes: "", account: "2285" },
      { vendor: "Shopify Platform Fees", amount: 4_722.00, category: "SaaS & Software", notes: "Platform + app charges", account: "2285" },
      { vendor: "Google Workspace", amount: 429.00, category: "SaaS & Software", notes: "2 accounts", account: "2285" },
      { vendor: "Klaviyo", amount: 932.67, category: "SaaS & Software", notes: "Email marketing platform", account: "2285" },
      { vendor: "Adobe", amount: 475.77, category: "SaaS & Software", notes: "Creative Cloud", account: "2285" },
      { vendor: "Nexcess / Liquid Web", amount: 917.00, category: "SaaS & Software", notes: "Web hosting", account: "2285" },
      { vendor: "Other SaaS & Subscriptions", amount: 3_630.00, category: "SaaS & Software", notes: "Notion, Slack, Callrail, Shipstation, Claude.ai, OpenAI, Rankability, etc.", account: "2285" },
      { vendor: "Mangoecommerce", amount: 5_488.00, category: "Marketing Services", notes: "$3,200 + $2,288", account: "2285" },
      { vendor: "Thinkshaw.com", amount: 5_800.00, category: "Marketing Services", notes: "Marketing/HR service — full rate starts Feb", account: "2285" },
      { vendor: "Other Marketing Services", amount: 228.00, category: "Marketing Services", notes: "Rankability, Definedigital, etc.", account: "2285" },
      { vendor: "Avalara (monthly)", amount: 2_499.00, category: "Taxes & Compliance", notes: "Regular monthly compliance", account: "2285" },
      { vendor: "Amazon & Office Purchases", amount: 5_000.00, category: "Operations & Supplies", notes: "Amazon, Costco, Walmart — office and operational", account: "2285" },
      { vendor: "Professional Services & Materials", amount: 2_587.00, category: "Operations & Supplies", notes: "Affiliated Metals $745 + Veritiv-West $826 + Alibaba $1,555 + misc", account: "2285" },
      { vendor: "Team Meals (Ezcater & restaurants)", amount: 2_034.00, category: "Meals & Entertainment", notes: "Weekly team lunches + Orlando trade show meals", account: "2285" },
      { vendor: "Travel (Orlando trade show)", amount: 1_071.00, category: "Travel", notes: "Airbnb $553 + Uber/Lyft $126 + local transport", account: "2285" },
      { vendor: "Postage (Stamps.com)", amount: 900.00, category: "Operations & Supplies", notes: "Multiple postage top-ups", account: "2285" },
      { vendor: "Misc & Small Transactions (2285)", amount: 2_455.00, category: "Misc & Other", notes: "Remaining small items", account: "2285" },
    ],
  },
  {
    month: "March",
    shortMonth: "Mar",
    year: 2026,
    // Account 115
    acct115BeginBalance: 261_731.28,
    acct115EndBalance: 187_110.58,
    acct115Deposits: 1_214_118.04,
    acct115Withdrawals: 1_288_738.74,
    acct115TransfersTo2285: 57_015.82,
    // Account 2285
    acct2285BeginBalance: 17_579.15,
    acct2285EndBalance: 8_841.71,
    acct2285Additions: 57_074.82,
    acct2285Subtractions: 65_812.26,
    acct2285Fees: 0,
    expenses: [
      // ── Account 115 ─────────────────────────────────────────────────────
      { vendor: "Shaoxing Graces", amount: 100_000.00, category: "Factory / Inventory (COGS)", notes: "Wire transfer #1", account: "115" },
      { vendor: "Shaoxing Graces", amount: 100_000.00, category: "Factory / Inventory (COGS)", notes: "Wire transfer #2", account: "115" },
      { vendor: "Shaoxing Graces", amount: 100_000.00, category: "Factory / Inventory (COGS)", notes: "Wire transfer #3", account: "115" },
      { vendor: "KWS Companies", amount: 64_108.36, category: "Rent", notes: "Warehouse/office lease (Mar 3)", account: "115" },
      { vendor: "KWS Companies", amount: 64_108.36, category: "Rent", notes: "Warehouse/office lease (Mar 31) — double payment this month", account: "115" },
      { vendor: "CBIZ Payroll", amount: 117_000.00, category: "Payroll", notes: "Est. — higher Mar run (bonuses/hires?)", account: "115", pending: true },
      { vendor: "Avalara (large remittance)", amount: 42_903.42, category: "Taxes & Compliance", notes: "Sales tax remittance", account: "115" },
      { vendor: "Saia Motor Freight", amount: 38_000.00, category: "Shipping & Freight", notes: "Est. — combined LTL runs", account: "115", pending: true },
      { vendor: "Vendor Payments — KBBO ACH", amount: 590_000.00, category: "Vendor Payments (KBBO)", notes: "KBBO ACH debits — Google Ads, contractors, Zline, others. Exact split TBD.", account: "115", pending: true },
      { vendor: "Worldwidelogis Dzurov", amount: 7_104.78, category: "Import & Customs", notes: "Import & customs broker for Chinese factory shipments", account: "115", pending: true },
      { vendor: "Branch Cash Withdrawal (0052 Utah)", amount: 7_000.00, category: "Petty Cash", notes: "Regular cash withdrawal — petty cash", account: "115", pending: true },
      { vendor: "LGS1997BYU PayPal (Nate tuition)", amount: 1_500.00, category: "Owner Draw / Personal", notes: "Owner's child tuition payments via PayPal", account: "115", pending: true },
      // ── Account 2285 ─────────────────────────────────────────────────────
      { vendor: "Microsoft Ads", amount: 11_346.00, category: "Digital Advertising", notes: "5 charges — Bing/MS Ads campaigns", account: "2285" },
      { vendor: "Grow My Ads LLC", amount: 7_694.00, category: "Digital Advertising", notes: "Google Ads management agency", account: "2285" },
      { vendor: "Connexity", amount: 5_872.00, category: "Digital Advertising", notes: "Includes $4,028 large charge on 3/19", account: "2285" },
      { vendor: "Pinterest Ads", amount: 2_059.00, category: "Digital Advertising", notes: "2 charges: $1,025 + $1,034", account: "2285" },
      { vendor: "Facebook / Meta Ads", amount: 2_824.00, category: "Digital Advertising", notes: "Multiple campaigns ($678+$294+$900+$900+$52)", account: "2285" },
      { vendor: "KSL.com", amount: 725.00, category: "Digital Advertising", notes: "Local Utah advertising", account: "2285" },
      { vendor: "Wf *Ph-Ad", amount: 1_000.00, category: "Digital Advertising", notes: "Phone/display advertising", account: "2285" },
      { vendor: "Shopify Platform Fees", amount: 5_057.00, category: "SaaS & Software", notes: "Platform + app charges (4 invoices including $4,382)", account: "2285" },
      { vendor: "Google Workspace", amount: 412.00, category: "SaaS & Software", notes: "2 accounts", account: "2285" },
      { vendor: "Klaviyo", amount: 932.67, category: "SaaS & Software", notes: "Email marketing platform", account: "2285" },
      { vendor: "Adobe", amount: 508.00, category: "SaaS & Software", notes: "Creative Cloud (2 charges)", account: "2285" },
      { vendor: "Nexcess / Liquid Web", amount: 999.00, category: "SaaS & Software", notes: "Web hosting — multiple charges", account: "2285" },
      { vendor: "Callrail", amount: 1_095.00, category: "SaaS & Software", notes: "Call tracking — up from $717/$814 prior months", account: "2285" },
      { vendor: "Other SaaS & Subscriptions", amount: 1_247.00, category: "SaaS & Software", notes: "Notion, Slack, Claude.ai, OpenAI, Rankability, Avalara monthly, etc.", account: "2285" },
      { vendor: "Mangoecommerce", amount: 5_488.00, category: "Marketing Services", notes: "$3,200 + $2,288", account: "2285" },
      { vendor: "Thinkshaw.com", amount: 5_800.00, category: "Marketing Services", notes: "Marketing/HR service", account: "2285" },
      { vendor: "Other Marketing Services", amount: 228.00, category: "Marketing Services", notes: "Rankability, Definedigital, etc.", account: "2285" },
      { vendor: "Avalara (monthly)", amount: 1_990.00, category: "Taxes & Compliance", notes: "Regular monthly compliance", account: "2285" },
      { vendor: "Amazon & Office Purchases", amount: 5_500.00, category: "Operations & Supplies", notes: "Amazon orders, Home Depot $374, Walmart $919", account: "2285" },
      { vendor: "Veritiv-West (packaging)", amount: 2_557.50, category: "Operations & Supplies", notes: "Large packaging supply order Mar 23", account: "2285" },
      { vendor: "Costco", amount: 462.00, category: "Operations & Supplies", notes: "Office/supplies", account: "2285" },
      { vendor: "Team Meals (Ezcater & restaurants)", amount: 2_177.00, category: "Meals & Entertainment", notes: "4 × Ezcater + Chick-fil-A team order", account: "2285" },
      { vendor: "Misc & Small Transactions (2285)", amount: 438.09, category: "Misc & Other", notes: "Remaining small items", account: "2285" },
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
  "Digital Advertising",
  "SaaS & Software",
  "Marketing Services",
  "Operations & Supplies",
  "Import & Customs",
  "Meals & Entertainment",
  "Travel",
  "Petty Cash",
  "Owner Draw / Personal",
  "Bank Fees",
  "Misc & Other",
  "Vendor Payments (KBBO)",  // pending breakdown — Google Ads, contractors, Zline
] as const;

export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_COLORS: Record<string, string> = {
  "Factory / Inventory (COGS)": "bg-blue-500",
  "Payroll": "bg-purple-500",
  "Rent": "bg-orange-500",
  "Shipping & Freight": "bg-cyan-500",
  "Taxes & Compliance": "bg-yellow-500",
  "Digital Advertising": "bg-red-500",
  "SaaS & Software": "bg-indigo-500",
  "Marketing Services": "bg-pink-500",
  "Operations & Supplies": "bg-teal-500",
  "Import & Customs": "bg-violet-500",
  "Meals & Entertainment": "bg-amber-500",
  "Travel": "bg-sky-500",
  "Petty Cash": "bg-stone-500",
  "Owner Draw / Personal": "bg-rose-500",
  "Bank Fees": "bg-gray-500",
  "Misc & Other": "bg-slate-500",
  "Vendor Payments (KBBO)": "bg-gray-600",
};

export const CATEGORY_TEXT: Record<string, string> = {
  "Factory / Inventory (COGS)": "text-blue-400",
  "Payroll": "text-purple-400",
  "Rent": "text-orange-400",
  "Shipping & Freight": "text-cyan-400",
  "Taxes & Compliance": "text-yellow-400",
  "Digital Advertising": "text-red-400",
  "SaaS & Software": "text-indigo-400",
  "Marketing Services": "text-pink-400",
  "Operations & Supplies": "text-teal-400",
  "Import & Customs": "text-violet-400",
  "Meals & Entertainment": "text-amber-400",
  "Travel": "text-sky-400",
  "Petty Cash": "text-stone-400",
  "Owner Draw / Personal": "text-rose-400",
  "Bank Fees": "text-gray-400",
  "Misc & Other": "text-slate-400",
  "Vendor Payments (KBBO)": "text-gray-400",
};

/** Real expenses for a month (excludes inter-account transfers) */
export function monthNetExpenses(m: MonthData): number {
  return (m.acct115Withdrawals - m.acct115TransfersTo2285) + m.acct2285Subtractions + m.acct2285Fees;
}

/** Revenue (deposits to account 115 — the operating account) */
export function monthRevenue(m: MonthData): number {
  return m.acct115Deposits;
}

/** Sum expenses for a month by category */
export function sumByCategory(m: MonthData): Record<string, number> {
  const result: Record<string, number> = {};
  for (const e of m.expenses) {
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
  totalRevenue: statements.reduce((s, m) => s + monthRevenue(m), 0),
  totalExpenses: statements.reduce((s, m) => s + monthNetExpenses(m), 0),
  get netCashFlow() { return this.totalRevenue - this.totalExpenses; },
  acct115BeginBalance: statements[0].acct115BeginBalance,
  acct115EndBalance: statements[statements.length - 1].acct115EndBalance,
};
