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

// Returns the same-length window immediately before the given range
export function getPreviousRange(key: RangeKey): DateRange {
  const cur = getRange(key);
  const startMs = new Date(cur.start).getTime();
  const endMs   = new Date(cur.end).getTime();
  const days    = Math.round((endMs - startMs) / 86400000);

  const prevEnd   = new Date(startMs - 86400000);
  const prevStart = new Date(prevEnd.getTime() - days * 86400000);

  return {
    start:   toDateStr(prevStart),
    end:     toDateStr(prevEnd),
    label:   `Prev ${days + 1} days`,
    year:    String(prevStart.getFullYear()),
    startYM: toYM(prevStart),
    endYM:   toYM(prevEnd),
  };
}

// Returns the same window shifted back exactly one year (year-over-year compare)
export function getYearOverYearRange(key: RangeKey): DateRange {
  const cur = getRange(key);
  const shift = (s: string) => {
    const d = new Date(s + "T12:00:00Z");
    d.setUTCFullYear(d.getUTCFullYear() - 1);
    return toDateStr(new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  };
  const start = shift(cur.start);
  const end   = shift(cur.end);
  return {
    start, end,
    label:   `${start.substring(0,4)} same window`,
    year:    start.substring(0, 4),
    startYM: start.substring(0, 7),
    endYM:   end.substring(0, 7),
  };
}

// Five concrete compare windows the user picks from. Each one is a fixed
// past window that's independent of the current range — so "Prev 7 days" is
// always the 7 days right before today, regardless of what the table shows.
export type CompareMode =
  | "off"
  | "prev_7d"      // 7 days ending the day before today
  | "prev_30d"     // 30 days ending the day before today
  | "last_month"   // previous full calendar month
  | "yoy"          // current window shifted back exactly one year (length matches)
  | "ytd_last"     // Jan 1 → matching day last year
;

export function getCompareRange(key: RangeKey, mode: CompareMode): DateRange | null {
  if (mode === "off") return null;
  const now = new Date();
  const today = toDateStr(now);

  if (mode === "yoy") return getYearOverYearRange(key);

  if (mode === "prev_7d") {
    const end = new Date(now); end.setDate(end.getDate() - 1);
    const start = new Date(end); start.setDate(start.getDate() - 6);
    return rangeFrom(start, end, "Previous 7 days");
  }
  if (mode === "prev_30d") {
    const end = new Date(now); end.setDate(end.getDate() - 1);
    const start = new Date(end); start.setDate(start.getDate() - 29);
    return rangeFrom(start, end, "Previous 30 days");
  }
  if (mode === "last_month") {
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const end   = new Date(now.getFullYear(), now.getMonth(), 0); // last day of prev month
    return rangeFrom(start, end, `${MONTHS[start.getMonth()]} ${start.getFullYear()}`);
  }
  if (mode === "ytd_last") {
    const ly = now.getFullYear() - 1;
    const start = new Date(ly, 0, 1);
    const end   = new Date(ly, now.getMonth(), now.getDate());
    return rangeFrom(start, end, `YTD ${ly} (through ${MONTHS[now.getMonth()].slice(0,3)} ${now.getDate()})`);
  }
  // exhaustive — TS will catch missing cases
  void today;
  return null;
}

function rangeFrom(start: Date, end: Date, label: string): DateRange {
  const s = toDateStr(start);
  const e = toDateStr(end);
  return {
    start: s, end: e, label,
    year: String(start.getFullYear()),
    startYM: toYM(start),
    endYM: toYM(end),
  };
}

// Default compare mode when a user toggles compare on. YoY is the most
// useful for period-anchored ranges (YTD / quarter / specific month);
// rolling windows get the equivalent previous-N-days window.
export function defaultCompareMode(key: RangeKey): CompareMode {
  if (key === "ytd" || key === "quarter" || key === "prev_year") return "yoy";
  if (/^\d{4}-\d{2}$/.test(key)) return "yoy";
  if (key === "7d") return "prev_7d";
  return "prev_30d";
}

// Human-readable label for the compare button.
export function compareLabel(_key: RangeKey, mode: CompareMode): string {
  switch (mode) {
    case "off":        return "Compare";
    case "prev_7d":    return "vs prev 7 days";
    case "prev_30d":   return "vs prev 30 days";
    case "last_month": {
      const now = new Date();
      const m = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      return `vs ${MONTHS[m.getMonth()].slice(0,3)} ${m.getFullYear()}`;
    }
    case "yoy":        return "vs same window last year";
    case "ytd_last": {
      const ly = new Date().getFullYear() - 1;
      return `vs YTD ${ly}`;
    }
  }
}

export const COMPARE_OPTIONS: { key: CompareMode; label: string; sub: string }[] = [
  { key: "off",         label: "Off",                      sub: "Hide comparison" },
  { key: "prev_7d",     label: "Previous 7 days",          sub: "Last 7 days ending yesterday" },
  { key: "prev_30d",    label: "Previous 30 days",         sub: "Last 30 days ending yesterday" },
  { key: "last_month",  label: "Last month",               sub: "Previous full calendar month" },
  { key: "yoy",         label: "Year over year",           sub: "Same window shifted back 1 year" },
  { key: "ytd_last",    label: "Year to date (last year)", sub: "Jan 1 → today's date last year" },
];

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
