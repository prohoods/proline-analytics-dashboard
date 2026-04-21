// Pattern-based categorization for bank transactions.
// Rules are ordered — first match wins. More specific rules first.

import type { ParsedTransaction } from "./statement-parser";

export interface CategoryRule {
  pattern: RegExp;
  category: string;
  confidence: "high" | "medium" | "low";
  notes?: string;
}

// Rules derived from Q1 2026 statement analysis. Extend as new vendors show up.
export const CATEGORIZATION_RULES: CategoryRule[] = [
  // ── Factory / Inventory (China wires) ────────────────────────────────────
  { pattern: /shaoxing/i,                            category: "Factory / Inventory (COGS)", confidence: "high" },
  { pattern: /ningbo/i,                              category: "Factory / Inventory (COGS)", confidence: "high" },
  { pattern: /shenzhen/i,                            category: "Factory / Inventory (COGS)", confidence: "high" },
  { pattern: /zhejiang/i,                            category: "Factory / Inventory (COGS)", confidence: "high" },
  { pattern: /\bgraces\b/i,                          category: "Factory / Inventory (COGS)", confidence: "high" },
  { pattern: /feishida/i,                            category: "Factory / Inventory (COGS)", confidence: "high" },
  { pattern: /yingqi/i,                              category: "Factory / Inventory (COGS)", confidence: "high" },
  { pattern: /dapeng/i,                              category: "Factory / Inventory (COGS)", confidence: "high" },
  { pattern: /seng/i,                                category: "Factory / Inventory (COGS)", confidence: "medium" },
  { pattern: /zline|z-line/i,                        category: "Factory / Inventory (COGS)", confidence: "high", notes: "SHL wholesale supplier — tag side=SHL" },

  // ── Import & Customs ──────────────────────────────────────────────────────
  { pattern: /worldwidelogis|world\s*wide\s*logist/i, category: "Import & Customs", confidence: "high" },
  { pattern: /customs\s*broker/i,                     category: "Import & Customs", confidence: "high" },

  // ── Payroll ──────────────────────────────────────────────────────────────
  { pattern: /\bcbiz\b/i,                            category: "Payroll", confidence: "high", notes: "CBIZ payroll processor" },
  { pattern: /selecthealth/i,                        category: "Payroll", confidence: "high", notes: "Employee health insurance" },
  { pattern: /paychex|gusto|adp\b/i,                 category: "Payroll", confidence: "high" },

  // ── Rent ─────────────────────────────────────────────────────────────────
  { pattern: /kws\s*compan/i,                        category: "Rent", confidence: "high" },
  { pattern: /marental|landlord/i,                   category: "Rent", confidence: "medium" },

  // ── Shipping & Freight ───────────────────────────────────────────────────
  { pattern: /saia\s*motor|saia\s*freight/i,         category: "Shipping & Freight", confidence: "high" },
  { pattern: /\bxpo\b/i,                             category: "Shipping & Freight", confidence: "high" },
  { pattern: /estes\s*express/i,                     category: "Shipping & Freight", confidence: "high" },
  { pattern: /ups\s*bill|upsbill/i,                  category: "Shipping & Freight", confidence: "high" },
  { pattern: /tforce\s*freight/i,                    category: "Shipping & Freight", confidence: "high" },
  { pattern: /\bdsv\s+freight/i,                     category: "Shipping & Freight", confidence: "high" },
  { pattern: /freightpop/i,                          category: "Shipping & Freight", confidence: "high" },
  { pattern: /fedex|ups\b.*shipping/i,               category: "Shipping & Freight", confidence: "medium" },

  // ── Taxes & Compliance ───────────────────────────────────────────────────
  { pattern: /avalara/i,                             category: "Taxes & Compliance", confidence: "high" },
  { pattern: /\birs\b|internal\s*revenue/i,          category: "Taxes & Compliance", confidence: "high" },
  { pattern: /state\s*tax|dept\s*of\s*revenue/i,     category: "Taxes & Compliance", confidence: "high" },

  // ── Digital Advertising ──────────────────────────────────────────────────
  { pattern: /google\s*ads|googleads/i,              category: "Digital Advertising", confidence: "high" },
  { pattern: /\bgoogle\s*llc\b/i,                    category: "Digital Advertising", confidence: "high", notes: "KBBO ACH payee — Google Ads" },
  { pattern: /microsoft.*ad|bing.*ad|ms\s*ad/i,      category: "Digital Advertising", confidence: "high" },
  { pattern: /connexity/i,                           category: "Digital Advertising", confidence: "high" },
  { pattern: /facebook.*ad|meta.*ad|fb.*ad/i,        category: "Digital Advertising", confidence: "high" },
  { pattern: /pinterest/i,                           category: "Digital Advertising", confidence: "high" },
  { pattern: /tiktok/i,                              category: "Digital Advertising", confidence: "high" },
  { pattern: /\bksl\b|ksl\.com/i,                    category: "Digital Advertising", confidence: "high" },
  { pattern: /grow\s*my\s*ads/i,                     category: "Digital Advertising", confidence: "high" },
  { pattern: /wf.*ph-?ad|wells.*phone.*ad/i,         category: "Digital Advertising", confidence: "high" },

  // ── SaaS & Software ──────────────────────────────────────────────────────
  { pattern: /shopify/i,                             category: "SaaS & Software", confidence: "high" },
  { pattern: /klaviyo/i,                             category: "SaaS & Software", confidence: "high" },
  { pattern: /google.*workspace|google.*suite/i,     category: "SaaS & Software", confidence: "high" },
  { pattern: /adobe/i,                               category: "SaaS & Software", confidence: "high" },
  { pattern: /nexcess|liquid\s*web/i,                category: "SaaS & Software", confidence: "high" },
  { pattern: /microsoft\s*365|microsoft.*subs/i,     category: "SaaS & Software", confidence: "high" },
  { pattern: /notion\.so|notionlab/i,                category: "SaaS & Software", confidence: "high" },
  { pattern: /slack\.com/i,                          category: "SaaS & Software", confidence: "high" },
  { pattern: /callrail/i,                            category: "SaaS & Software", confidence: "high" },
  { pattern: /shipstation/i,                         category: "SaaS & Software", confidence: "high" },
  { pattern: /claude\.ai|anthropic/i,                category: "SaaS & Software", confidence: "high" },
  { pattern: /openai/i,                              category: "SaaS & Software", confidence: "high" },
  { pattern: /rankability/i,                         category: "SaaS & Software", confidence: "high" },
  { pattern: /godaddy/i,                             category: "SaaS & Software", confidence: "medium" },

  // ── Marketing Services ───────────────────────────────────────────────────
  { pattern: /mangoecom|mango\s*ecom/i,              category: "Marketing Services", confidence: "high" },
  { pattern: /thinkshaw/i,                           category: "Marketing Services", confidence: "high" },
  { pattern: /authority\s*builder/i,                 category: "Marketing Services", confidence: "high" },
  { pattern: /definedigital/i,                       category: "Marketing Services", confidence: "high" },
  { pattern: /renan\s*bonin/i,                       category: "Marketing Services", confidence: "high", notes: "Website developer/designer retainer" },

  // ── Operations & Supplies ────────────────────────────────────────────────
  { pattern: /amazon(?!\s*ads)/i,                    category: "Operations & Supplies", confidence: "medium" },
  { pattern: /costco/i,                              category: "Operations & Supplies", confidence: "high" },
  { pattern: /walmart/i,                             category: "Operations & Supplies", confidence: "high" },
  { pattern: /home\s*depot/i,                        category: "Operations & Supplies", confidence: "high" },
  { pattern: /veritiv/i,                             category: "Operations & Supplies", confidence: "high" },
  { pattern: /affiliated\s*metals/i,                 category: "Operations & Supplies", confidence: "high" },
  { pattern: /alibaba/i,                             category: "Operations & Supplies", confidence: "high" },
  { pattern: /stamps\.com|postage/i,                 category: "Operations & Supplies", confidence: "high" },

  // ── Meals & Entertainment ─────────────────────────────────────────────────
  { pattern: /ezcater/i,                             category: "Meals & Entertainment", confidence: "high" },
  { pattern: /chick[-\s]*fil[-\s]*a/i,               category: "Meals & Entertainment", confidence: "high" },
  { pattern: /doordash|ubereats|grubhub/i,           category: "Meals & Entertainment", confidence: "high" },

  // ── Travel ───────────────────────────────────────────────────────────────
  { pattern: /delta\s*air|delta\.com/i,              category: "Travel", confidence: "high" },
  { pattern: /airbnb/i,                              category: "Travel", confidence: "high" },
  { pattern: /uber(?!\s*eats)|lyft/i,                category: "Travel", confidence: "high" },
  { pattern: /united\s*airlines|american\s*airlines|southwest/i, category: "Travel", confidence: "high" },
  { pattern: /marriott|hilton|hyatt|hotel/i,         category: "Travel", confidence: "medium" },

  // ── Petty Cash ───────────────────────────────────────────────────────────
  { pattern: /branch\s*(?:cash)?\s*(?:withdraw|withdrawal)|cash\s*withdraw|atm/i, category: "Petty Cash", confidence: "high" },

  // ── Owner Draw / Personal ─────────────────────────────────────────────────
  { pattern: /lgs1997byu|byu.*tuition/i,             category: "Owner Draw / Personal", confidence: "high" },
  { pattern: /owner\s*draw|distribution/i,           category: "Owner Draw / Personal", confidence: "medium" },

  // ── Bank Fees ────────────────────────────────────────────────────────────
  { pattern: /overdraft|nsf\s*fee|returned\s*check/i, category: "Bank Fees", confidence: "high" },
  { pattern: /service\s*charge|monthly\s*fee/i,       category: "Bank Fees", confidence: "medium" },
  { pattern: /wire\s*fee|international\s*fee/i,       category: "Bank Fees", confidence: "high" },

  // ── Credit card payments (go to the card statement for detail) ────────────
  { pattern: /chase.*(?:credit|crdepay|crd\s*epay)/i, category: "Misc & Other", confidence: "low", notes: "Chase credit card payment — real categorization lives on the card statement" },

  // ── KBBO ACH catch-all — only fires if we can't match by beneficiary name.
  // Real KBBO debits are now itemized (Google, Zline, Renan Bonin, Worldwide).
  { pattern: /kbbo|key\s*business\s*banking/i,       category: "Unclassified Outflows (115)", confidence: "low", notes: "KBBO ACH without recognizable payee — add a rule once vendor is known" },

  // ── Revenue inflows ──────────────────────────────────────────────────────
  // Shopify/Stripe payouts go into …0115 and count as revenue — don't categorize these as expenses
  // We let revenue flow through untouched; only credit-type txns here should be rare vendor refunds
];

export interface CategorizationResult {
  category: string;
  confidence: "high" | "medium" | "low" | "none";
  matchedRule?: CategoryRule;
}

/**
 * Apply categorization rules to a single transaction description.
 * Returns the best match or "Misc & Other" with "none" confidence.
 */
export function categorizeDescription(description: string): CategorizationResult {
  for (const rule of CATEGORIZATION_RULES) {
    if (rule.pattern.test(description)) {
      return { category: rule.category, confidence: rule.confidence, matchedRule: rule };
    }
  }
  return { category: "Misc & Other", confidence: "none" };
}

/**
 * Apply categorization to every transaction in a list, mutating in place.
 * Only debit-type transactions get categorized; credits are left alone
 * (they're revenue deposits, not expenses).
 */
export function categorizeTransactions(transactions: ParsedTransaction[]): void {
  for (const tx of transactions) {
    if (tx.type === "credit") continue; // revenue, not expense
    const result = categorizeDescription(tx.description);
    tx.category = result.category;
    tx.pending = result.confidence === "low" || result.confidence === "none";
  }
}

/**
 * Summary of categorization results for a parsed statement.
 */
export function categorizationSummary(transactions: ParsedTransaction[]) {
  const byCategory: Record<string, { count: number; total: number; pending: number }> = {};
  let uncategorized = 0;
  for (const tx of transactions) {
    if (tx.type === "credit") continue;
    const cat = tx.category ?? "Misc & Other";
    if (!byCategory[cat]) byCategory[cat] = { count: 0, total: 0, pending: 0 };
    byCategory[cat].count += 1;
    byCategory[cat].total += Math.abs(tx.amount);
    if (tx.pending) {
      byCategory[cat].pending += 1;
      if (cat === "Misc & Other") uncategorized += 1;
    }
  }
  return { byCategory, uncategorized };
}
