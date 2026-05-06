"use client";

// Live finance data hook. Pages call useFinancialData() to get the merged
// view: hardcoded baseline (Jan/Feb/Mar 2026) overlaid with whatever bank
// statements have been uploaded. Renders immediately with the baseline,
// then upgrades once /api/finance/statements-merged returns.

import { useEffect, useMemo, useState } from "react";
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

export interface FinancialDataView {
  statements: MonthData[];
  /** Q1-style aggregate for the loaded set (replaces the static `q1` export). */
  q1: QuarterTotals;
  totalByCategory: () => Record<string, number>;
  sumGroup: (key: PLGroupKey, month?: MonthData) => number;
  sumCategory: (category: string, month?: MonthData) => number;
  sumBySide: (side: "DTC" | "SHL", month?: MonthData) => number;
  monthRevenue: typeof monthRevenue;
  monthNetExpenses: typeof monthNetExpenses;
  sumByCategory: typeof sumByCategory;
  /** True while the live API call is still in flight. */
  loading: boolean;
  /** Becomes false once live data has replaced the baseline. */
  isLive: boolean;
}

export function useFinancialData(): FinancialDataView {
  const [statements, setStatements] = useState<MonthData[]>(baseline);
  const [loading, setLoading] = useState(true);
  const [isLive, setIsLive] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/finance/statements-merged", { cache: "no-store" })
      .then(r => r.json())
      .then((data: { statements?: MonthData[] }) => {
        if (cancelled) return;
        if (Array.isArray(data.statements) && data.statements.length > 0) {
          setStatements(data.statements);
          setIsLive(true);
        }
      })
      .catch(() => { /* fall back to baseline */ })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  return useMemo<FinancialDataView>(() => ({
    statements,
    q1: computeTotals(statements),
    totalByCategory: () => totalByCategoryFor(statements),
    sumGroup: (key, month) => sumGroupFor(statements, key, month),
    sumCategory: (category, month) => sumCategoryFor(statements, category, month),
    sumBySide: (side, month) => sumBySideFor(statements, side, month),
    monthRevenue,
    monthNetExpenses,
    sumByCategory,
    loading,
    isLive,
  }), [statements, loading, isLive]);
}
