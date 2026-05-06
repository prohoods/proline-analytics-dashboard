// Convert uploaded bank statement PDFs into the MonthData shape the
// finance pages already consume. One MonthData per (year, month), built
// from however many account-statements landed for that month.
//
// Inputs: PersistedStatement[] (one per uploaded PDF — typically 0115,
// 2285, and 6013 per month). Outputs: MonthData[] sorted oldest-first.
//
// Account 6013 is small (started April 2026) — its activity is folded
// into the 2285 totals so existing pages keep working without schema
// changes. Each 6013 expense is still tagged with `account: "2285"` but
// its `notes` carry "(account 6013)" for traceability.

import type { PersistedStatement } from "./persisted-statements";
import type { MonthData, ExpenseLineItem } from "./financial-data";
import { categorizeDescription } from "./transaction-categorizer";

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const TRANSFER_TO_2285 = /internet\s*trf\s*to\s*dda\s*0+44052100?2285/i;
const TRANSFER_FROM_115 = /internet\s*trf\s*fr\s*dda\s*0+44052100?0115/i;

function monthKey(periodEnd: string): string {
  // periodEnd is YYYY-MM-DD — return YYYY-MM
  return periodEnd.substring(0, 7);
}

function accountTag(last4: string): "115" | "2285" | "6013" | "other" {
  if (last4 === "0115") return "115";
  if (last4 === "2285") return "2285";
  if (last4 === "6013") return "6013";
  return "other";
}

function cleanDescription(raw: string): string {
  return raw
    .replace(/^bill\s*pay\s*[:.]?\s*/i, "")
    .replace(/\s+n\/a\s+sb.*$/i, "")
    .replace(/\s+ref\s*#?\s*\d+.*$/i, "")
    .replace(/\s+\d{6,}.*$/i, "") // strip long trailing reference numbers
    .replace(/\s+/g, " ")
    .trim();
}

function vendorKey(description: string): string {
  // Aggregate similar transactions: lowercase, first 3 meaningful words
  const words = description.toLowerCase().split(/\s+/).filter(w => w.length > 1);
  return words.slice(0, 3).join(" ");
}

interface AccountTotals {
  begin: number;
  end: number;
  credits: number;
  debits: number;
  fees: number;
  transfersTo2285: number;
}

function emptyTotals(): AccountTotals {
  return { begin: 0, end: 0, credits: 0, debits: 0, fees: 0, transfersTo2285: 0 };
}

export function buildMonthsFromUploads(uploads: PersistedStatement[]): MonthData[] {
  // Group uploads by YYYY-MM, keep latest upload per (month, account) so
  // re-uploading the same statement overrides the older copy.
  const byMonthAccount = new Map<string, Map<string, PersistedStatement>>();

  for (const u of uploads) {
    if (!u.parsed.periodEnd) continue;
    const mk = monthKey(u.parsed.periodEnd);
    const acct = u.parsed.account;
    if (!byMonthAccount.has(mk)) byMonthAccount.set(mk, new Map());
    const inner = byMonthAccount.get(mk)!;
    const existing = inner.get(acct);
    if (!existing || u.uploadedAt > existing.uploadedAt) {
      inner.set(acct, u);
    }
  }

  const months: MonthData[] = [];

  for (const [mk, accounts] of byMonthAccount) {
    const [yearStr, monthStr] = mk.split("-");
    const year = parseInt(yearStr);
    const monthIdx = parseInt(monthStr) - 1;
    if (isNaN(year) || monthIdx < 0 || monthIdx > 11) continue;

    const totals: Record<"115" | "2285" | "6013", AccountTotals> = {
      "115": emptyTotals(),
      "2285": emptyTotals(),
      "6013": emptyTotals(),
    };

    // Aggregate expenses by (cleaned-vendor, category)
    const expenseAgg = new Map<string, ExpenseLineItem>();

    for (const upload of accounts.values()) {
      const tag = accountTag(upload.parsed.account);
      if (tag === "other") continue; // skip unknown accounts

      const t = totals[tag];
      t.begin = upload.parsed.beginBalance ?? 0;
      t.end = upload.parsed.endBalance ?? 0;
      t.credits = upload.parsed.totalCredits;
      t.debits = upload.parsed.totalDebits;

      for (const tx of upload.parsed.transactions) {
        // Identify inter-account transfers to net them out of P&L
        if (tag === "115" && tx.type === "debit" && TRANSFER_TO_2285.test(tx.description)) {
          t.transfersTo2285 += Math.abs(tx.amount);
          continue; // not a real expense
        }
        if (tag === "2285" && tx.type === "credit" && TRANSFER_FROM_115.test(tx.description)) {
          continue; // matching addition — already counted in 115's transfersTo2285
        }

        // Bank fees go to the dedicated fees field
        if (tx.type === "debit" && (tx.category === "Bank Fees" || /overdraft|wire\s*fee/i.test(tx.description))) {
          t.fees += Math.abs(tx.amount);
        }

        // Skip credits — they're revenue, not expenses
        if (tx.type === "credit") continue;

        // Categorize expense (categorizer should have done this on upload, but re-do as backstop)
        const category = tx.category ?? categorizeDescription(tx.description).category;
        const cleaned = cleanDescription(tx.description);
        const vk = vendorKey(cleaned);
        const accountForExpense: "115" | "2285" = tag === "115" ? "115" : "2285";
        const noteSuffix = tag === "6013" ? " (account 6013)" : "";

        const aggKey = `${accountForExpense}|${category}|${vk}`;
        const existing = expenseAgg.get(aggKey);
        if (existing) {
          existing.amount += Math.abs(tx.amount);
        } else {
          expenseAgg.set(aggKey, {
            vendor: cleaned || "(unlabeled)",
            amount: Math.abs(tx.amount),
            category,
            notes: `From ${SHORT_MONTHS[monthIdx]} ${year} bank statement${noteSuffix}`,
            account: accountForExpense,
            pending: tx.pending,
          });
        }
      }
    }

    const expenses = Array.from(expenseAgg.values()).sort((a, b) => b.amount - a.amount);

    months.push({
      month: MONTH_NAMES[monthIdx],
      shortMonth: SHORT_MONTHS[monthIdx],
      year,
      acct115BeginBalance: totals["115"].begin,
      acct115EndBalance: totals["115"].end,
      acct115Deposits: totals["115"].credits,
      acct115Withdrawals: totals["115"].debits,
      acct115TransfersTo2285: totals["115"].transfersTo2285,
      // Fold 6013 into 2285 totals so existing helpers don't need a new account dimension
      acct2285BeginBalance: totals["2285"].begin + totals["6013"].begin,
      acct2285EndBalance: totals["2285"].end + totals["6013"].end,
      acct2285Additions: totals["2285"].credits + totals["6013"].credits,
      acct2285Subtractions: totals["2285"].debits + totals["6013"].debits,
      acct2285Fees: totals["2285"].fees + totals["6013"].fees,
      expenses,
    });
  }

  return months.sort((a, b) => {
    if (a.year !== b.year) return a.year - b.year;
    return MONTH_NAMES.indexOf(a.month) - MONTH_NAMES.indexOf(b.month);
  });
}

/** Merge hardcoded baseline with uploaded months. Uploaded data wins for any
 * (year, month) that exists in both, so once you upload a month, the
 * dashboard shows the live numbers instead of the hardcoded estimate. */
export function mergeStatements(baseline: MonthData[], uploaded: MonthData[]): MonthData[] {
  const byKey = new Map<string, MonthData>();
  for (const m of baseline) byKey.set(`${m.year}-${m.month}`, m);
  for (const m of uploaded) byKey.set(`${m.year}-${m.month}`, m);
  return Array.from(byKey.values()).sort((a, b) => {
    if (a.year !== b.year) return a.year - b.year;
    return MONTH_NAMES.indexOf(a.month) - MONTH_NAMES.indexOf(b.month);
  });
}
