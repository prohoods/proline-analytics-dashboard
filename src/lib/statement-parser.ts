// KeyBank statement parser. Takes raw extracted PDF text and returns
// structured transactions + statement metadata.
//
// KeyBank statement format (observed from Jan/Feb/Mar 2026 statements):
//
//   Account 440521000115 (or 440521002285)
//   Statement period: MM/DD/YYYY through MM/DD/YYYY
//   Beginning balance: $XX,XXX.XX
//   Ending balance: $XX,XXX.XX
//
//   Date   Description                             Amount        Balance
//   MM/DD  Vendor name / ACH description          $X,XXX.XX   $XX,XXX.XX
//
// We don't rely on exact column positions — we pattern-match dates and
// numeric amounts line-by-line.

export interface ParsedTransaction {
  date: string;                 // ISO date YYYY-MM-DD
  description: string;          // Raw description from statement
  amount: number;               // Positive = credit/deposit, Negative = debit/withdrawal
  type: "credit" | "debit";
  raw: string;                  // Original raw line for debugging
  category?: string;            // Assigned by categorizeTransaction
  pending?: boolean;            // Categorization confidence flag
}

export interface ParsedStatement {
  account: string;              // Last 4 digits of account number
  accountFull?: string;         // Full account number if found
  periodStart: string;          // ISO date
  periodEnd: string;            // ISO date
  beginBalance: number | null;
  endBalance: number | null;
  totalCredits: number;
  totalDebits: number;
  transactions: ParsedTransaction[];
  warnings: string[];           // Anything we couldn't parse confidently
}

// Remove currency formatting and parse. Returns null for invalid.
function parseCurrency(raw: string): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[,$\s]/g, "").trim();
  if (!cleaned) return null;
  // Handle parenthesized negatives: (1,234.56) = -1234.56
  const isNeg = /^\(.*\)$/.test(cleaned) || cleaned.startsWith("-");
  const numStr = cleaned.replace(/[()\-]/g, "");
  const n = parseFloat(numStr);
  if (isNaN(n)) return null;
  return isNeg ? -n : n;
}

// Parse M/D/YYYY or MM/DD/YYYY into YYYY-MM-DD.
// Optionally accept a fallback year (e.g. for "02/14" without year).
function parseDate(raw: string, fallbackYear?: number): string | null {
  const match = raw.match(/^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?$/);
  if (!match) return null;
  const mm = parseInt(match[1]);
  const dd = parseInt(match[2]);
  let yyyy: number;
  if (match[3]) {
    yyyy = parseInt(match[3]);
    if (yyyy < 100) yyyy += 2000;
  } else if (fallbackYear) {
    yyyy = fallbackYear;
  } else {
    return null;
  }
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
  return `${yyyy.toString().padStart(4, "0")}-${mm.toString().padStart(2, "0")}-${dd.toString().padStart(2, "0")}`;
}

// Extract last 4 digits of an account reference from a block of text.
function extractAccountLast4(text: string): string | null {
  // KeyBank patterns: "Account 440521000115", "Account Number: 440521002285", "...0115", "*****0115"
  const patterns = [
    /Account\s*(?:Number|#)?[:\s]*\d{0,12}(\d{4})/i,
    /\*{3,}(\d{4})/,
    /\.{3,}(\d{4})/,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return m[1];
  }
  return null;
}

function extractStatementPeriod(text: string): { start: string; end: string } | null {
  // "Statement Period: 01/01/2026 through 01/31/2026"
  // "Statement dates: Jan 1, 2026 - Jan 31, 2026"
  const patterns = [
    /(?:Statement\s*Period|Statement\s*Date[s]?)[:\s]*(\d{1,2}\/\d{1,2}\/\d{2,4})\s*(?:through|to|-|–)\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i,
    /Period[:\s]*(\d{1,2}\/\d{1,2}\/\d{2,4})\s*[-–]\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) {
      const start = parseDate(m[1]);
      const end = parseDate(m[2]);
      if (start && end) return { start, end };
    }
  }
  return null;
}

function extractBalances(text: string): { begin: number | null; end: number | null } {
  const begin = text.match(/(?:Beginning|Previous)\s*Balance[:\s]*\$?([\d,]+\.\d{2})/i);
  const end = text.match(/(?:Ending|New|Current|Closing)\s*Balance[:\s]*\$?([\d,]+\.\d{2})/i);
  return {
    begin: begin ? parseCurrency(begin[1]) : null,
    end: end ? parseCurrency(end[1]) : null,
  };
}

/**
 * Parse raw statement text into structured data.
 * Best-effort: what we can't parse goes into `warnings`.
 */
export function parseStatementText(text: string): ParsedStatement {
  const warnings: string[] = [];

  const account = extractAccountLast4(text) ?? "????";
  const period = extractStatementPeriod(text);
  if (!period) warnings.push("Could not find statement period — dates may be wrong");
  const balances = extractBalances(text);
  if (balances.begin === null) warnings.push("Could not find beginning balance");
  if (balances.end === null) warnings.push("Could not find ending balance");

  const periodYear = period ? parseInt(period.end.substring(0, 4)) : new Date().getFullYear();

  // Line-by-line transaction extraction.
  // Look for lines that start (roughly) with MM/DD and contain a dollar amount.
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

  const transactions: ParsedTransaction[] = [];

  for (const line of lines) {
    // Skip header/footer-ish noise
    if (/^(Date|Description|Amount|Balance|Page|Total)/i.test(line)) continue;
    if (/^(BEGINNING|ENDING|NEW BALANCE)/i.test(line)) continue;

    // Try to find a leading date
    const dateMatch = line.match(/^(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)\s+(.+)/);
    if (!dateMatch) continue;

    const date = parseDate(dateMatch[1], periodYear);
    if (!date) continue;

    const rest = dateMatch[2];

    // Find a dollar amount near the end of the line.
    // KeyBank rows typically have: description  amount  running-balance
    // Grab the last two $ amounts, first is txn amount, second is balance.
    const amountMatches = [...rest.matchAll(/\$?([\d,]+\.\d{2})/g)];
    if (amountMatches.length === 0) continue;

    // If there are 2+ amounts, the transaction amount is the second-to-last.
    // If only 1, it's that one.
    const amtStr = amountMatches.length >= 2
      ? amountMatches[amountMatches.length - 2][1]
      : amountMatches[amountMatches.length - 1][1];
    const amount = parseCurrency(amtStr);
    if (amount === null) continue;

    // Description is everything before the first amount match
    const firstAmtIdx = rest.indexOf(amountMatches[0][0]);
    const description = (firstAmtIdx > 0 ? rest.substring(0, firstAmtIdx) : rest).trim();
    if (!description) continue;

    // Infer credit vs debit by context. KeyBank statements usually list deposits
    // and withdrawals in separate sections, or with explicit +/- in description.
    // Heuristic: words like "DEPOSIT", "CREDIT", "TRANSFER FROM", "REFUND" = credit.
    const isCredit = /DEPOSIT|CREDIT|TRANSFER FROM|REFUND|RETURN|REVERSAL|INTEREST/i.test(description);

    transactions.push({
      date,
      description,
      amount: isCredit ? Math.abs(amount) : -Math.abs(amount),
      type: isCredit ? "credit" : "debit",
      raw: line,
    });
  }

  if (transactions.length === 0) {
    warnings.push("No transactions found — PDF text extraction may have failed or format is unexpected");
  }

  const totalCredits = transactions.filter(t => t.type === "credit").reduce((s, t) => s + t.amount, 0);
  const totalDebits = Math.abs(transactions.filter(t => t.type === "debit").reduce((s, t) => s + t.amount, 0));

  // Sanity check: begin + credits - debits should ≈ end
  if (balances.begin !== null && balances.end !== null) {
    const computed = balances.begin + totalCredits - totalDebits;
    const diff = Math.abs(computed - balances.end);
    if (diff > 1) {
      warnings.push(`Balance check off by ${diff.toFixed(2)} — some transactions may be missing or mis-typed`);
    }
  }

  return {
    account,
    periodStart: period?.start ?? "",
    periodEnd: period?.end ?? "",
    beginBalance: balances.begin,
    endBalance: balances.end,
    totalCredits,
    totalDebits,
    transactions,
    warnings,
  };
}
