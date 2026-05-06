"use client";

// Live finance data hook with date-range filtering. Pages call
// useFinancialData(rangeKey) to get the merged + filtered view:
// hardcoded baseline (Q1 2026) overlaid with whatever bank statements
// have been uploaded, then narrowed to the selected period.
//
// Pages render immediately with the baseline (filtered), then upgrade
// once /api/finance/statements-merged returns. The selected range is
// applied client-side, so changing the dropdown is instant.

import { useEffect, useMemo, useState } from "react";
import { getRange, type RangeKey, type DateRange } from "./date-ranges";
import {
  statements as baseline,
  computeTotals,
  totalByCategoryFor,
  sumGroupFor,
  sumCategoryFor,
  sumBySideFor,
  monthRevenue,
  monthNetExpenses,
  sumByCategory,
  type MonthData,
  type PLGroupKey,
  type QuarterTotals,
} from "./financial-data";

const MONTH_LIST = ["January", "February", "March", "April", "May", "June",
                    "July", "August", "September", "October", "November", "December"];

function monthYM(m: MonthData): string {
  const idx = MONTH_LIST.indexOf(m.month);
  return `${m.year}-${String(idx + 1).padStart(2, "0")}`;
}

function filterByRange(months: MonthData[], range: DateRange): MonthData[] {
  return months.filter(m => {
    const ym = monthYM(m);
    return ym >= range.startYM && ym <= range.endYM;
  });
}

export interface FinancialDataView {
  /** Months filtered to the selected range. */
  statements: MonthData[];
  /** Unfiltered set — useful if a page needs Jan/Feb/Mar regardless of selection. */
  allStatements: MonthData[];
  /** Active date range info (start/end/label). */
  range: DateRange;
  /** Totals across the filtered set. Replaces the static `q1` export. */
  totals: QuarterTotals;
  /** Alias for `totals` — kept so existing pages calling `q1.totalRevenue` still work. */
  q1: QuarterTotals;
  totalByCategory: () => Record<string, number>;
  sumGroup: (key: PLGroupKey, month?: MonthData) => number;
  sumCategory: (category: string, month?: MonthData) => number;
  sumBySide: (side: "DTC" | "SHL", month?: MonthData) => number;
  monthRevenue: typeof monthRevenue;
  monthNetExpenses: typeof monthNetExpenses;
  sumByCategory: typeof sumByCategory;
  loading: boolean;
  isLive: boolean;
}

export function useFinancialData(rangeKey: RangeKey = "ytd"): FinancialDataView {
  const [allStatements, setAllStatements] = useState<MonthData[]>(baseline);
  const [loading, setLoading] = useState(true);
  const [isLive, setIsLive] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/finance/statements-merged", { cache: "no-store" })
      .then(r => r.json())
      .then((data: { statements?: MonthData[] }) => {
        if (cancelled) return;
        if (Array.isArray(data.statements) && data.statements.length > 0) {
          setAllStatements(data.statements);
          setIsLive(true);
        }
      })
      .catch(() => { /* fall back to baseline */ })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  return useMemo<FinancialDataView>(() => {
    const range = getRange(rangeKey);
    const filtered = filterByRange(allStatements, range);
    const totals = computeTotals(filtered);
    return {
      statements: filtered,
      allStatements,
      range,
      totals,
      q1: totals,
      totalByCategory: () => totalByCategoryFor(filtered),
      sumGroup: (key, month) => sumGroupFor(filtered, key, month),
      sumCategory: (category, month) => sumCategoryFor(filtered, category, month),
      sumBySide: (side, month) => sumBySideFor(filtered, side, month),
      monthRevenue,
      monthNetExpenses,
      sumByCategory,
      loading,
      isLive,
    };
  }, [allStatements, rangeKey, loading, isLive]);
}
