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

export interface ExpenseSubItem {
  vendor: string;
  amount: number;
  notes?: string;
  // `estimated` means the amount is an allocated split of the parent bundle,
  // not a confirmed single transaction. Resolves once bank statement PDFs parse.
  estimated?: boolean;
}

export interface ExpenseLineItem {
  vendor: string;
  amount: number;
  category: string;
  notes: string;
  account?: "115" | "2285";
  pending?: boolean;
  side?: "DTC" | "SHL";  // Business line: DTC (Proline retail) vs SHL (wholesale). Default DTC.
  // When present, this line is a bundled aggregate — subItems break out the individual vendors.
  // Sum of subItems should equal `amount` (may drift slightly when estimates are involved).
  subItems?: ExpenseSubItem[];
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
      // ── KBBO ACH portal — itemized from Jan 2026 export ────────────────
      { vendor: "Google LLC (Google Ads)", amount: 99_000.93, category: "Digital Advertising", notes: "KBBO ACH 01/28/2026 — ID 172", account: "115" },
      { vendor: "Zline Kitchen and Bath", amount: 14_683.29, category: "Factory / Inventory (COGS)", notes: "KBBO ACH 01/30/2026 — ID 175 — SHL wholesale supplier", account: "115", side: "SHL" },
      { vendor: "Zline Kitchen and Bath", amount: 7_930.00, category: "Factory / Inventory (COGS)", notes: "KBBO ACH 01/15/2026 — ID 168 — SHL wholesale supplier", account: "115", side: "SHL" },
      { vendor: "Renan Bonin Designer", amount: 5_200.00, category: "Marketing Services", notes: "KBBO ACH 01/21/2026 — ID 170 — website dev/designer retainer", account: "115" },
      // ── Residual: 115 outflows hitting bank but not yet itemized (non-KBBO) ──
      { vendor: "Unclassified 115 Outflows", amount: 448_186.58, category: "Unclassified Outflows (115)", notes: "Net 115 outflows not yet itemized — likely outgoing wires, checks, or non-KBBO ACH. Needs bank statement PDF to resolve.", account: "115", pending: true },
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
      { vendor: "Other SaaS & Subscriptions", amount: 4_162.00, category: "SaaS & Software", notes: "Bundled SaaS subscriptions — see breakdown", account: "2285",
        subItems: [
          { vendor: "Callrail", amount: 717.00, notes: "Call tracking — amount confirmed from Mar note ('up from $717')" },
          { vendor: "Notion (team plan)", amount: 150.00, notes: "Docs & knowledge base", estimated: true },
          { vendor: "Slack (Pro)", amount: 225.00, notes: "Team messaging", estimated: true },
          { vendor: "Shipstation", amount: 199.00, notes: "Shipping/label automation", estimated: true },
          { vendor: "Claude.ai (Pro)", amount: 100.00, notes: "AI assistant", estimated: true },
          { vendor: "OpenAI / ChatGPT", amount: 250.00, notes: "AI assistant / API", estimated: true },
          { vendor: "Rankability", amount: 299.00, notes: "SEO content platform", estimated: true },
          { vendor: "Other small SaaS (uncategorized)", amount: 2_222.00, notes: "Residual — resolves when bank statement PDFs parse", estimated: true },
        ],
      },
      { vendor: "Mangoecommerce", amount: 5_488.00, category: "Marketing Services", notes: "eCommerce agency ($3,200 + $2,288)", account: "2285" },
      { vendor: "Thinkshaw.com", amount: 200.00, category: "Marketing Services", notes: "Marketing service (small in Jan, $5,800 from Feb)", account: "2285" },
      { vendor: "Authority Builders LLC", amount: 1_000.00, category: "Marketing Services", notes: "SEO / link building", account: "2285" },
      { vendor: "Other Marketing Services", amount: 1_228.00, category: "Marketing Services", notes: "Bundled small marketing spend — see breakdown", account: "2285",
        subItems: [
          { vendor: "Definedigital", amount: 400.00, notes: "Digital marketing consultant", estimated: true },
          { vendor: "Apple.com (ad-related)", amount: 150.00, notes: "App Store / ad creative assets", estimated: true },
          { vendor: "GoDaddy", amount: 200.00, notes: "Domain / hosting", estimated: true },
          { vendor: "Misc marketing charges", amount: 478.00, notes: "Small/one-off marketing vendor charges", estimated: true },
        ],
      },
      { vendor: "Avalara (monthly)", amount: 4_823.00, category: "Taxes & Compliance", notes: "Monthly compliance — 2 entries from 2285 acct", account: "2285" },
      { vendor: "Amazon & Office Purchases", amount: 10_200.00, category: "Operations & Supplies", notes: "Bundled Amazon + big-box purchases — see breakdown", account: "2285",
        subItems: [
          { vendor: "Amazon (orders)", amount: 7_500.00, notes: "Multiple Amazon.com orders — product supplies & office", estimated: true },
          { vendor: "Costco", amount: 1_500.00, notes: "Office/warehouse supplies", estimated: true },
          { vendor: "Walmart", amount: 700.00, notes: "Misc supplies", estimated: true },
          { vendor: "Home Depot / other big-box", amount: 500.00, notes: "Warehouse supplies", estimated: true },
        ],
      },
      { vendor: "Professional Services & Materials", amount: 7_264.00, category: "Operations & Supplies", notes: "Raw materials & wholesale sourcing", account: "2285",
        subItems: [
          { vendor: "Affiliated Metals", amount: 3_638.00, notes: "Metals supplier" },
          { vendor: "Veritiv-West", amount: 2_047.00, notes: "Packaging supplies" },
          { vendor: "Alibaba.com", amount: 1_579.00, notes: "Wholesale sourcing" },
        ],
      },
      { vendor: "Team Meals (Ezcater & restaurants)", amount: 1_633.00, category: "Meals & Entertainment", notes: "4 × team lunch orders", account: "2285",
        subItems: [
          { vendor: "Ezcater orders", amount: 1_200.00, notes: "Catered team lunches (~4 orders)", estimated: true },
          { vendor: "Local restaurants", amount: 433.00, notes: "Team meals — Chick-fil-A, etc.", estimated: true },
        ],
      },
      { vendor: "Travel (Delta flights — 3 tickets)", amount: 1_586.00, category: "Travel", notes: "Trade show travel — 3 tickets + lodging", account: "2285",
        subItems: [
          { vendor: "Delta Airlines (3 × $517)", amount: 1_551.00, notes: "3 trade-show flights" },
          { vendor: "Airbnb / lodging", amount: 35.00, notes: "Small lodging / transport charge", estimated: true },
        ],
      },
      { vendor: "Postage (Stamps.com)", amount: 900.00, category: "Operations & Supplies", notes: "Multiple postage top-ups", account: "2285" },
      { vendor: "Bank Fees (Overdraft)", amount: 120.00, category: "Bank Fees", notes: "Account went to -$1,002 end of Jan", account: "2285" },
      { vendor: "Misc & Small Transactions (2285)", amount: 6_702.00, category: "Misc & Other", notes: "Remaining small items — see breakdown", account: "2285",
        subItems: [
          { vendor: "Small vendor charges (<$200 each)", amount: 3_500.00, notes: "~20-30 small transactions — office supplies, utilities, minor services", estimated: true },
          { vendor: "ATM / cash-equivalent pulls", amount: 1_200.00, notes: "Small cash withdrawals from 2285", estimated: true },
          { vendor: "Subscription top-ups & renewals", amount: 1_000.00, notes: "Various small SaaS/app renewals", estimated: true },
          { vendor: "Uncategorized remainder", amount: 1_002.00, notes: "Pending bank statement PDF parse", estimated: true },
        ],
      },
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
      // ── KBBO ACH portal — itemized from Feb 2026 export ────────────────
      { vendor: "Google LLC (Google Ads)", amount: 50_000.00, category: "Digital Advertising", notes: "KBBO ACH 02/26/2026 — ID 191", account: "115" },
      { vendor: "Google LLC (Google Ads)", amount: 92_231.64, category: "Digital Advertising", notes: "KBBO ACH 02/24/2026 — ID 188", account: "115" },
      { vendor: "Google LLC (Google Ads)", amount: 66_670.93, category: "Digital Advertising", notes: "KBBO ACH 02/02/2026 — ID 177", account: "115" },
      { vendor: "Zline Kitchen and Bath", amount: 1_350.98, category: "Factory / Inventory (COGS)", notes: "KBBO ACH 02/18/2026 — ID 186 — SHL wholesale supplier", account: "115", side: "SHL" },
      { vendor: "Worldwide Logistic", amount: 43_282.53, category: "Import & Customs", notes: "KBBO ACH 02/12/2026 — ID 181 — separate from the smaller Worldwidelogis wire tracked above", account: "115" },
      // ── Residual: 115 outflows hitting bank but not yet itemized (non-KBBO) ──
      { vendor: "Unclassified 115 Outflows", amount: 191_463.92, category: "Unclassified Outflows (115)", notes: "Net 115 outflows not yet itemized — likely outgoing wires, checks, or non-KBBO ACH.", account: "115", pending: true },
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
      { vendor: "Other SaaS & Subscriptions", amount: 3_630.00, category: "SaaS & Software", notes: "Bundled SaaS subscriptions — see breakdown", account: "2285",
        subItems: [
          { vendor: "Callrail", amount: 814.00, notes: "Call tracking — amount confirmed from Mar note ('up from $814')" },
          { vendor: "Notion (team plan)", amount: 150.00, notes: "Docs & knowledge base", estimated: true },
          { vendor: "Slack (Pro)", amount: 225.00, notes: "Team messaging", estimated: true },
          { vendor: "Shipstation", amount: 199.00, notes: "Shipping/label automation", estimated: true },
          { vendor: "Claude.ai (Pro)", amount: 100.00, notes: "AI assistant", estimated: true },
          { vendor: "OpenAI / ChatGPT", amount: 250.00, notes: "AI assistant / API", estimated: true },
          { vendor: "Rankability", amount: 299.00, notes: "SEO content platform", estimated: true },
          { vendor: "Other small SaaS (uncategorized)", amount: 1_593.00, notes: "Residual — resolves when bank statement PDFs parse", estimated: true },
        ],
      },
      { vendor: "Mangoecommerce", amount: 5_488.00, category: "Marketing Services", notes: "$3,200 + $2,288", account: "2285" },
      { vendor: "Thinkshaw.com", amount: 5_800.00, category: "Marketing Services", notes: "Marketing/HR service — full rate starts Feb", account: "2285" },
      { vendor: "Other Marketing Services", amount: 228.00, category: "Marketing Services", notes: "Bundled small marketing spend — see breakdown", account: "2285",
        subItems: [
          { vendor: "Rankability (marketing)", amount: 100.00, notes: "Small marketing charge", estimated: true },
          { vendor: "Definedigital", amount: 80.00, notes: "Digital marketing consultant", estimated: true },
          { vendor: "Misc marketing charges", amount: 48.00, notes: "Small marketing vendor charges", estimated: true },
        ],
      },
      { vendor: "Avalara (monthly)", amount: 2_499.00, category: "Taxes & Compliance", notes: "Regular monthly compliance", account: "2285" },
      { vendor: "Amazon & Office Purchases", amount: 5_000.00, category: "Operations & Supplies", notes: "Bundled Amazon + big-box purchases — see breakdown", account: "2285",
        subItems: [
          { vendor: "Amazon (orders)", amount: 3_500.00, notes: "Multiple Amazon.com orders", estimated: true },
          { vendor: "Costco", amount: 800.00, notes: "Office/warehouse supplies", estimated: true },
          { vendor: "Walmart", amount: 400.00, notes: "Misc supplies", estimated: true },
          { vendor: "Home Depot / other big-box", amount: 300.00, notes: "Warehouse supplies", estimated: true },
        ],
      },
      { vendor: "Professional Services & Materials", amount: 2_587.00, category: "Operations & Supplies", notes: "Raw materials & wholesale sourcing", account: "2285",
        subItems: [
          { vendor: "Affiliated Metals", amount: 745.00, notes: "Metals supplier" },
          { vendor: "Veritiv-West", amount: 826.00, notes: "Packaging supplies" },
          { vendor: "Alibaba.com", amount: 1_555.00, notes: "Wholesale sourcing" },
          { vendor: "Misc materials", amount: -539.00, notes: "Rounding — materials cross-allocations", estimated: true },
        ],
      },
      { vendor: "Team Meals (Ezcater & restaurants)", amount: 2_034.00, category: "Meals & Entertainment", notes: "Weekly team lunches + Orlando trade show meals", account: "2285",
        subItems: [
          { vendor: "Ezcater (weekly team lunches)", amount: 1_400.00, notes: "~4 catered orders", estimated: true },
          { vendor: "Orlando trade show meals", amount: 450.00, notes: "Restaurant meals during trade show", estimated: true },
          { vendor: "Local restaurants", amount: 184.00, notes: "Misc team meals", estimated: true },
        ],
      },
      { vendor: "Travel (Orlando trade show)", amount: 1_071.00, category: "Travel", notes: "Orlando trade show travel", account: "2285",
        subItems: [
          { vendor: "Airbnb", amount: 553.00, notes: "Trade show lodging" },
          { vendor: "Uber / Lyft", amount: 126.00, notes: "Local transport at trade show" },
          { vendor: "Other transport / misc", amount: 392.00, notes: "Local transport, parking, etc.", estimated: true },
        ],
      },
      { vendor: "Postage (Stamps.com)", amount: 900.00, category: "Operations & Supplies", notes: "Multiple postage top-ups", account: "2285" },
      { vendor: "Misc & Small Transactions (2285)", amount: 2_455.00, category: "Misc & Other", notes: "Remaining small items — see breakdown", account: "2285",
        subItems: [
          { vendor: "Small vendor charges (<$200 each)", amount: 1_400.00, notes: "~15-20 small transactions", estimated: true },
          { vendor: "Subscription top-ups & renewals", amount: 600.00, notes: "Various small SaaS/app renewals", estimated: true },
          { vendor: "Uncategorized remainder", amount: 455.00, notes: "Pending bank statement PDF parse", estimated: true },
        ],
      },
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
      // ── KBBO ACH portal — itemized from Mar 2026 export ────────────────
      { vendor: "Google LLC (Google Ads)", amount: 61_000.00, category: "Digital Advertising", notes: "KBBO ACH 03/24/2026 — ID 201", account: "115" },
      { vendor: "Google LLC (Google Ads)", amount: 99_298.78, category: "Digital Advertising", notes: "KBBO ACH 03/19/2026 — ID 196", account: "115" },
      { vendor: "Zline Kitchen and Bath", amount: 2_814.51, category: "Factory / Inventory (COGS)", notes: "KBBO ACH 03/23/2026 — ID 199 — SHL wholesale supplier", account: "115", side: "SHL" },
      { vendor: "Zline Kitchen and Bath", amount: 10_187.19, category: "Factory / Inventory (COGS)", notes: "KBBO ACH 03/03/2026 — ID 194 — SHL wholesale supplier", account: "115", side: "SHL" },
      { vendor: "Renan Bonin Designer", amount: 5_200.00, category: "Marketing Services", notes: "KBBO ACH 03/27/2026 — ID 204 — website dev/designer retainer", account: "115" },
      // ── Residual: 115 outflows hitting bank but not yet itemized (non-KBBO) ──
      { vendor: "Unclassified 115 Outflows", amount: 411_497.52, category: "Unclassified Outflows (115)", notes: "Net 115 outflows not yet itemized — likely outgoing wires, checks, or non-KBBO ACH.", account: "115", pending: true },
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
      { vendor: "Other SaaS & Subscriptions", amount: 1_247.00, category: "SaaS & Software", notes: "Bundled SaaS subscriptions — see breakdown (Callrail separate this month)", account: "2285",
        subItems: [
          { vendor: "Notion (team plan)", amount: 150.00, notes: "Docs & knowledge base", estimated: true },
          { vendor: "Slack (Pro)", amount: 225.00, notes: "Team messaging", estimated: true },
          { vendor: "Shipstation", amount: 199.00, notes: "Shipping/label automation", estimated: true },
          { vendor: "Claude.ai (Pro)", amount: 100.00, notes: "AI assistant", estimated: true },
          { vendor: "OpenAI / ChatGPT", amount: 250.00, notes: "AI assistant / API", estimated: true },
          { vendor: "Rankability", amount: 299.00, notes: "SEO content platform", estimated: true },
          { vendor: "Other small SaaS (uncategorized)", amount: 24.00, notes: "Residual after named vendors", estimated: true },
        ],
      },
      { vendor: "Mangoecommerce", amount: 5_488.00, category: "Marketing Services", notes: "$3,200 + $2,288", account: "2285" },
      { vendor: "Thinkshaw.com", amount: 5_800.00, category: "Marketing Services", notes: "Marketing/HR service", account: "2285" },
      { vendor: "Other Marketing Services", amount: 228.00, category: "Marketing Services", notes: "Bundled small marketing spend — see breakdown", account: "2285",
        subItems: [
          { vendor: "Rankability (marketing)", amount: 100.00, notes: "Small marketing charge", estimated: true },
          { vendor: "Definedigital", amount: 80.00, notes: "Digital marketing consultant", estimated: true },
          { vendor: "Misc marketing charges", amount: 48.00, notes: "Small marketing vendor charges", estimated: true },
        ],
      },
      { vendor: "Avalara (monthly)", amount: 1_990.00, category: "Taxes & Compliance", notes: "Regular monthly compliance", account: "2285" },
      { vendor: "Amazon & Office Purchases", amount: 5_500.00, category: "Operations & Supplies", notes: "Bundled Amazon + big-box purchases — see breakdown", account: "2285",
        subItems: [
          { vendor: "Amazon (orders)", amount: 4_207.00, notes: "Multiple Amazon.com orders", estimated: true },
          { vendor: "Home Depot", amount: 374.00, notes: "Warehouse supplies" },
          { vendor: "Walmart", amount: 919.00, notes: "Misc supplies" },
        ],
      },
      { vendor: "Veritiv-West (packaging)", amount: 2_557.50, category: "Operations & Supplies", notes: "Large packaging supply order Mar 23", account: "2285" },
      { vendor: "Costco", amount: 462.00, category: "Operations & Supplies", notes: "Office/supplies", account: "2285" },
      { vendor: "Team Meals (Ezcater & restaurants)", amount: 2_177.00, category: "Meals & Entertainment", notes: "4 × Ezcater + Chick-fil-A team order", account: "2285",
        subItems: [
          { vendor: "Ezcater orders (4×)", amount: 1_800.00, notes: "Weekly catered team lunches", estimated: true },
          { vendor: "Chick-fil-A team order", amount: 377.00, notes: "Team lunch order", estimated: true },
        ],
      },
      { vendor: "Misc & Small Transactions (2285)", amount: 438.09, category: "Misc & Other", notes: "Remaining small items — mostly one-off charges", account: "2285",
        subItems: [
          { vendor: "Small vendor charges (<$100 each)", amount: 300.00, notes: "Few small transactions", estimated: true },
          { vendor: "Uncategorized remainder", amount: 138.09, notes: "Pending bank statement PDF parse", estimated: true },
        ],
      },
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
  "Unclassified Outflows (115)",  // residual: bank debits not yet itemized (non-KBBO wires/checks/ACH)
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
  "Unclassified Outflows (115)": "bg-gray-600",
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
  "Unclassified Outflows (115)": "text-gray-400",
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

/** Sum expenses across all months by category (operates on baseline `statements`) */
export function totalByCategory(): Record<string, number> {
  return totalByCategoryFor(statements);
}

/** Sum expenses across an explicit statements array by category — used by the live data hook. */
export function totalByCategoryFor(months: MonthData[]): Record<string, number> {
  const result: Record<string, number> = {};
  for (const m of months) {
    for (const e of m.expenses) {
      result[e.category] = (result[e.category] ?? 0) + e.amount;
    }
  }
  return result;
}

export interface QuarterTotals {
  totalRevenue: number;
  totalExpenses: number;
  netCashFlow: number;
  acct115BeginBalance: number;
  acct115EndBalance: number;
}

/** Compute Q1-style totals across an explicit statements array. */
export function computeTotals(months: MonthData[]): QuarterTotals {
  const totalRevenue = months.reduce((s, m) => s + monthRevenue(m), 0);
  const totalExpenses = months.reduce((s, m) => s + monthNetExpenses(m), 0);
  return {
    totalRevenue,
    totalExpenses,
    netCashFlow: totalRevenue - totalExpenses,
    acct115BeginBalance: months.length ? months[0].acct115BeginBalance : 0,
    acct115EndBalance: months.length ? months[months.length - 1].acct115EndBalance : 0,
  };
}

/** Q1 2026 totals — baseline only (kept for backward compatibility) */
export const q1 = {
  totalRevenue: statements.reduce((s, m) => s + monthRevenue(m), 0),
  totalExpenses: statements.reduce((s, m) => s + monthNetExpenses(m), 0),
  get netCashFlow() { return this.totalRevenue - this.totalExpenses; },
  acct115BeginBalance: statements[0].acct115BeginBalance,
  acct115EndBalance: statements[statements.length - 1].acct115EndBalance,
};

// ── P&L grouping (cash basis — see pages for caveats) ────────────────────────
// Categories roll up into P&L sections for financial reporting.

export const PL_GROUPS = {
  COGS: [
    "Factory / Inventory (COGS)",
    "Import & Customs",
  ] as string[],
  "OpEx — Marketing": [
    "Digital Advertising",
    "Marketing Services",
  ] as string[],
  "OpEx — Personnel": [
    "Payroll",
  ] as string[],
  "OpEx — Facilities & Logistics": [
    "Rent",
    "Shipping & Freight",
  ] as string[],
  "OpEx — G&A": [
    "SaaS & Software",
    "Operations & Supplies",
    "Meals & Entertainment",
    "Travel",
    "Petty Cash",
    "Misc & Other",
  ] as string[],
  "Below the Line": [
    "Taxes & Compliance",
    "Bank Fees",
    "Owner Draw / Personal",
  ] as string[],
  "Unclassified (Pending)": [
    "Unclassified Outflows (115)",
  ] as string[],
};

export type PLGroupKey = keyof typeof PL_GROUPS;

/** Sum categories in a P&L group for a specific month, or all months if undefined. Baseline only. */
export function sumGroup(groupKey: PLGroupKey, month?: MonthData): number {
  return sumGroupFor(statements, groupKey, month);
}

/** Sum a P&L group across an explicit statements array. */
export function sumGroupFor(allMonths: MonthData[], groupKey: PLGroupKey, month?: MonthData): number {
  const cats = PL_GROUPS[groupKey];
  const months = month ? [month] : allMonths;
  let total = 0;
  for (const m of months) {
    for (const e of m.expenses) {
      if (cats.includes(e.category)) total += e.amount;
    }
  }
  return total;
}

/** Sum a specific category for a specific month, or all months. Baseline only. */
export function sumCategory(category: string, month?: MonthData): number {
  return sumCategoryFor(statements, category, month);
}

/** Sum a category across an explicit statements array. */
export function sumCategoryFor(allMonths: MonthData[], category: string, month?: MonthData): number {
  const months = month ? [month] : allMonths;
  let total = 0;
  for (const m of months) {
    for (const e of m.expenses) {
      if (e.category === category) total += e.amount;
    }
  }
  return total;
}

/** Sum expenses by business side (DTC vs SHL). Items without `side` count as DTC. Baseline only. */
export function sumBySide(side: "DTC" | "SHL", month?: MonthData): number {
  return sumBySideFor(statements, side, month);
}

/** Sum by side across an explicit statements array. */
export function sumBySideFor(allMonths: MonthData[], side: "DTC" | "SHL", month?: MonthData): number {
  const months = month ? [month] : allMonths;
  let total = 0;
  for (const m of months) {
    for (const e of m.expenses) {
      const s = e.side ?? "DTC";
      if (s === side) total += e.amount;
    }
  }
  return total;
}
