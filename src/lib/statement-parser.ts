// KeyBank business statement parser. Takes raw extracted PDF text and returns
// structured transactions + statement metadata.
//
// Observed KeyBank format (2026 statements):
//
//   Business Banking Statement
//   April 30, 2026
//   440521000115
//   ...
//   KeyBank Basic Business Checking 440521006013
//   Beginning balance 3-31-26      $450.42
//   N Additions                    +X,XXX.XX
//   N Subtractions                 -X,XXX.XX
//   Ending balance 4-30-26         $451.92
//
//   Additions
//     Date  Serial#  Source                              Amount
//     4-2            Internet Trf Fr DDA 0000... 4451    $1,000.00
//
//   Subtractions
//     Date  Serial#  Location                            Amount
//     4-2            Bill Pay:Kent Summers   N/A Sb...   98.50
//
//   Paper Checks
//     Check  Date  Amount    Check  Date  Amount   ...
//     9150   4-3   $803.27   *9155  4-3   2,500.00
//
//   Fees and charges
//     Date          Description           Qty  Unit  Total
//     4-1-26        Outgoing Wire Fee     1    45.00 -$45.00
//
// Dates inside the statement use M-D (no year). The year is taken from the
// statement period (parsed from "Ending balance M-D-YY").

export interface ParsedTransaction {
  date: string;
  description: string;
  amount: number;
  type: "credit" | "debit";
  raw: string;
  category?: string;
  pending?: boolean;
}

export interface ParsedStatement {
  account: string;
  accountFull?: string;
  periodStart: string;
  periodEnd: string;
  beginBalance: number | null;
  endBalance: number | null;
  totalCredits: number;
  totalDebits: number;
  transactions: ParsedTransaction[];
  warnings: string[];
}

function parseCurrency(raw: string): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[,$\s]/g, "").trim();
  if (!cleaned) return null;
  const isNeg = /^\(.*\)$/.test(cleaned) || cleaned.startsWith("-");
  const numStr = cleaned.replace(/[()\-+]/g, "");
  const n = parseFloat(numStr);
  if (isNaN(n)) return null;
  return isNeg ? -n : n;
}

// "M-D" or "M-D-YY" or "M/D" → ISO YYYY-MM-DD using fallbackYear if no year.
function parseShortDate(raw: string, fallbackYear: number): string | null {
  const m = raw.match(/^(\d{1,2})[-/](\d{1,2})(?:[-/](\d{2,4}))?$/);
  if (!m) return null;
  const mm = parseInt(m[1]);
  const dd = parseInt(m[2]);
  let yyyy = fallbackYear;
  if (m[3]) {
    yyyy = parseInt(m[3]);
    if (yyyy < 100) yyyy += 2000;
  }
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
  return `${yyyy.toString().padStart(4, "0")}-${mm.toString().padStart(2, "0")}-${dd.toString().padStart(2, "0")}`;
}

const MONTH_NAMES = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

function extractAccountLast4(text: string): { last4: string; full?: string } {
  // KeyBank uses 12-digit account numbers, e.g. 440521000115
  const m = text.match(/\b(\d{12})\b/);
  if (m) return { last4: m[1].slice(-4), full: m[1] };
  // Fallback: last-4 patterns
  const masked = text.match(/(?:\.{3,}|\*{3,})(\d{4})/);
  if (masked) return { last4: masked[1] };
  return { last4: "????" };
}

function extractStatementDate(text: string): string | null {
  // "April 30, 2026" near the top of the statement
  const m = text.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(\d{4})\b/i);
  if (!m) return null;
  const month = MONTH_NAMES.indexOf(m[1].toLowerCase()) + 1;
  if (month < 1) return null;
  const day = parseInt(m[2]);
  const year = parseInt(m[3]);
  return `${year}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
}

function extractBalances(text: string): { begin: number | null; end: number | null; beginDate: string | null; endDate: string | null } {
  // "Beginning balance 3-31-26 $450.42"
  // "Ending balance 4-30-26 $451.92"
  const begin = text.match(/Beginning\s+balance\s+(\d{1,2}-\d{1,2}-\d{2,4})\s+\$?([\d,]+\.\d{2})/i);
  const end = text.match(/Ending\s+balance\s+(\d{1,2}-\d{1,2}-\d{2,4})\s+\$?([\d,]+\.\d{2})/i);
  return {
    begin: begin ? parseCurrency(begin[2]) : null,
    end: end ? parseCurrency(end[2]) : null,
    beginDate: begin ? parseShortDate(begin[1], new Date().getFullYear()) : null,
    endDate: end ? parseShortDate(end[1], new Date().getFullYear()) : null,
  };
}

type Section = "additions" | "subtractions" | "checks" | "fees" | null;

function detectSection(line: string, current: Section): Section {
  const lower = line.toLowerCase();
  // Section / sub-section headers
  if (/^additions\b/.test(lower)) return "additions";
  if (/^subtractions\b/.test(lower)) return "subtractions";
  if (/^paper\s+checks\b/.test(lower) && !/paper\s+checks\s+paid/.test(lower)) return "checks";
  if (/^fees\s+and\s+charges\b/.test(lower) || /^fees\s+and$/.test(lower)) return "fees";
  // Paper-checks subsection ends at the "Paper Checks Paid $X" footer or
  // when the Withdrawals table header reappears — both mean we're back in subtractions.
  if (current === "checks" && (/^paper\s+checks\s+paid/.test(lower) || /^withdrawals\s+date\b/.test(lower))) {
    return "subtractions";
  }
  // Withdrawals / Deposits column headers also reaffirm the active section
  if (/^withdrawals\s+date\b/.test(lower)) return "subtractions";
  if (/^deposits?\s+date\b/.test(lower)) return "additions";
  return current;
}

const NOISE_PREFIXES = [
  /^business\s+banking\s+statement/i,
  /^page\s+\d+\s+of\s+\d+/i,
  /^total\s+(additions|subtractions|fees)/i,
  /^paper\s+checks\s+paid/i,
  /^fees\s+and\s+charges\s+assessed/i,
  /^deposits?\s+date\s+serial/i,
  /^withdrawals?\s+date\s+serial/i,
  /^check\s+date\s+amount/i,
  /^date\s+quantity\s+unit/i,
  /^enroll\s+in\s+online\s+banking/i,
  /^notice\s+of\s+amendments/i,
  /^questions\s+or\s+comments/i,
  /^call\s+our\s+key\s+business/i,
];

function isNoise(line: string): boolean {
  return NOISE_PREFIXES.some(p => p.test(line));
}

// Extract the LAST currency amount from a string like "Description ... $1,234.56"
function extractTrailingAmount(line: string): { amount: number; descEnd: number } | null {
  const matches = [...line.matchAll(/\$?(-?[\d,]+\.\d{2})/g)];
  if (matches.length === 0) return null;
  const last = matches[matches.length - 1];
  const amt = parseCurrency(last[1]);
  if (amt === null) return null;
  return { amount: amt, descEnd: last.index ?? 0 };
}

export function parseStatementText(text: string): ParsedStatement {
  const warnings: string[] = [];

  const accountInfo = extractAccountLast4(text);
  const stmtDate = extractStatementDate(text);
  const balances = extractBalances(text);

  // Period: derive from balance dates if available, fall back to statement date for the month
  let periodStart = balances.beginDate ?? "";
  let periodEnd = balances.endDate ?? stmtDate ?? "";

  // If beginDate is one day before periodEnd's month start, that's normal — keep as-is.
  if (!periodStart && periodEnd) {
    const d = new Date(periodEnd);
    d.setDate(1);
    periodStart = d.toISOString().substring(0, 10);
  }

  if (balances.begin === null) warnings.push("Could not find beginning balance");
  if (balances.end === null) warnings.push("Could not find ending balance");
  if (!periodEnd) warnings.push("Could not find statement period");

  const periodYear = periodEnd ? parseInt(periodEnd.substring(0, 4)) : new Date().getFullYear();

  const transactions: ParsedTransaction[] = [];
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

  let section: Section = null;

  for (const line of lines) {
    section = detectSection(line, section);
    if (isNoise(line)) continue;

    // Skip the balance summary lines themselves
    if (/^(beginning|ending)\s+balance\b/i.test(line)) continue;
    if (/^\d+\s+(additions?|subtractions?)\b/i.test(line)) continue;
    if (/^net\s+fees\s+and\s+charges\b/i.test(line)) continue;

    if (section === "checks") {
      // Paper-check rows pack 1-3 checks per line:
      //   "9150 4-3 $803.27 *9155 4-3 2,500.00 9160 4-10 428.75"
      const checkPattern = /\*?(\d{4})\s+(\d{1,2}-\d{1,2})\s+\$?([\d,]+\.\d{2})/g;
      const checkMatches = [...line.matchAll(checkPattern)];
      for (const m of checkMatches) {
        const checkNum = m[1];
        const date = parseShortDate(m[2], periodYear);
        const amt = parseCurrency(m[3]);
        if (date && amt !== null && amt > 0) {
          transactions.push({
            date,
            description: `Paper Check #${checkNum}`,
            amount: -Math.abs(amt),
            type: "debit",
            raw: line,
          });
        }
      }
      continue;
    }

    if (section === "fees") {
      // "4-1-26 Outgoing International Wire Fee 1 45.00 -$45.00"
      const feeMatch = line.match(/^(\d{1,2}-\d{1,2}-\d{2,4})\s+(.+?)\s+\d+\s+\d+\.\d{2}\s+-?\$?([\d,]+\.\d{2})/);
      if (feeMatch) {
        const date = parseShortDate(feeMatch[1], periodYear);
        const amt = parseCurrency(feeMatch[3]);
        if (date && amt !== null && amt > 0) {
          transactions.push({
            date,
            description: feeMatch[2].trim(),
            amount: -Math.abs(amt),
            type: "debit",
            raw: line,
          });
        }
      }
      continue;
    }

    // Additions / Subtractions: line starts with "M-D" date
    const dateMatch = line.match(/^(\d{1,2}-\d{1,2})\s+(.+)/);
    if (!dateMatch) continue;

    const date = parseShortDate(dateMatch[1], periodYear);
    if (!date) continue;

    const rest = dateMatch[2];
    const trailing = extractTrailingAmount(rest);
    if (!trailing) continue;

    let description = rest.substring(0, trailing.descEnd).trim();
    description = description.replace(/\s+/g, " ").trim();
    if (!description) continue;

    // Skip lines that look like sub-headers
    if (/^serial\s*#/i.test(description)) continue;

    const isCredit = section === "additions";
    transactions.push({
      date,
      description,
      amount: isCredit ? Math.abs(trailing.amount) : -Math.abs(trailing.amount),
      type: isCredit ? "credit" : "debit",
      raw: line,
    });
  }

  if (transactions.length === 0) {
    warnings.push("No transactions found — PDF text extraction may have failed or format is unexpected");
  }

  const totalCredits = transactions.filter(t => t.type === "credit").reduce((s, t) => s + t.amount, 0);
  const totalDebits = Math.abs(transactions.filter(t => t.type === "debit").reduce((s, t) => s + t.amount, 0));

  if (balances.begin !== null && balances.end !== null) {
    const computed = balances.begin + totalCredits - totalDebits;
    const diff = Math.abs(computed - balances.end);
    if (diff > 1) {
      warnings.push(`Balance check off by $${diff.toFixed(2)} — some transactions may be missing or mis-typed`);
    }
  }

  return {
    account: accountInfo.last4,
    accountFull: accountInfo.full,
    periodStart,
    periodEnd,
    beginBalance: balances.begin,
    endBalance: balances.end,
    totalCredits,
    totalDebits,
    transactions,
    warnings,
  };
}
