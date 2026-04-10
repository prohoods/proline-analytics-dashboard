// Fixed range keys
type FixedRangeKey = "7d" | "15d" | "30d" | "60d" | "90d" | "quarter" | "ytd" | "prev_year";

// Also accept YYYY-MM month strings like "2026-01", "2026-04"
export type RangeKey = FixedRangeKey | (string & {});

export interface DateRange {
  start: string;   // YYYY-MM-DD
  end: string;     // YYYY-MM-DD
  label: string;
  year: string;    // primary year for annual APIs
  startYM: string; // YYYY-MM
  endYM: string;   // YYYY-MM
}

const MONTHS = ["January", "February", "March", "April", "May", "June",
                "July", "August", "September", "October", "November", "December"];

function pad(n: number) { return String(n).padStart(2, "0"); }
function toDateStr(d: Date) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function toYM(d: Date) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; }

// Returns last day of a given YYYY-MM, capped at today
function monthEnd(year: number, month: number): string {
  const today = toDateStr(new Date());
  const lastDay = new Date(year, month, 0); // day 0 of next month = last day of this month
  const end = toDateStr(lastDay);
  return end < today ? end : today;
}

export function getRange(key: RangeKey): DateRange {
  const now = new Date();
  const today = toDateStr(now);
  const year = now.getFullYear();

  // Handle YYYY-MM month keys
  const monthMatch = key.match(/^(\d{4})-(\d{2})$/);
  if (monthMatch) {
    const y = parseInt(monthMatch[1]);
    const m = parseInt(monthMatch[2]);
    const ym = `${y}-${pad(m)}`;
    const start = `${ym}-01`;
    const end = monthEnd(y, m);
    return { start, end, label: `${MONTHS[m - 1]} ${y}`, year: String(y), startYM: ym, endYM: ym };
  }

  switch (key as FixedRangeKey) {
    case "7d": {
      const s = new Date(now); s.setDate(s.getDate() - 6);
      return { start: toDateStr(s), end: today, label: "Last 7 Days", year: String(year), startYM: toYM(s), endYM: toYM(now) };
    }
    case "15d": {
      const s = new Date(now); s.setDate(s.getDate() - 14);
      return { start: toDateStr(s), end: today, label: "Last 15 Days", year: String(year), startYM: toYM(s), endYM: toYM(now) };
    }
    case "30d": {
      const s = new Date(now); s.setDate(s.getDate() - 29);
      return { start: toDateStr(s), end: today, label: "Last 30 Days", year: String(year), startYM: toYM(s), endYM: toYM(now) };
    }
    case "60d": {
      const s = new Date(now); s.setDate(s.getDate() - 59);
      return { start: toDateStr(s), end: today, label: "Last 60 Days", year: String(year), startYM: toYM(s), endYM: toYM(now) };
    }
    case "90d": {
      const s = new Date(now); s.setDate(s.getDate() - 89);
      return { start: toDateStr(s), end: today, label: "Last 90 Days", year: String(year), startYM: toYM(s), endYM: toYM(now) };
    }
    case "quarter": {
      const qStart = new Date(year, Math.floor(now.getMonth() / 3) * 3, 1);
      return { start: toDateStr(qStart), end: today, label: "This Quarter", year: String(year), startYM: toYM(qStart), endYM: toYM(now) };
    }
    case "ytd": {
      return { start: `${year}-01-01`, end: today, label: "Year to Date", year: String(year), startYM: `${year}-01`, endYM: toYM(now) };
    }
    case "prev_year": {
      const py = year - 1;
      return { start: `${py}-01-01`, end: `${py}-12-31`, label: `${py} Full Year`, year: String(py), startYM: `${py}-01`, endYM: `${py}-12` };
    }
    default: {
      // Fallback to YTD for unknown keys
      return { start: `${year}-01-01`, end: today, label: "Year to Date", year: String(year), startYM: `${year}-01`, endYM: toYM(now) };
    }
  }
}

export const RANGE_OPTIONS: { key: RangeKey; label: string }[] = [
  { key: "7d", label: "Last 7 Days" },
  { key: "15d", label: "Last 15 Days" },
  { key: "30d", label: "Last 30 Days" },
  { key: "60d", label: "Last 60 Days" },
  { key: "90d", label: "Last 90 Days" },
  { key: "quarter", label: "This Quarter" },
  { key: "ytd", label: "Year to Date" },
  { key: "prev_year", label: "Previous Year" },
];

// Generate month options for the current year up to today
export function getMonthOptions(): { key: string; label: string }[] {
  const now = new Date();
  const year = now.getFullYear();
  const currentMonth = now.getMonth() + 1; // 1-based
  const options = [];
  for (let m = 1; m <= currentMonth; m++) {
    options.push({
      key: `${year}-${pad(m)}`,
      label: MONTHS[m - 1],
    });
  }
  return options.reverse(); // most recent first
}
