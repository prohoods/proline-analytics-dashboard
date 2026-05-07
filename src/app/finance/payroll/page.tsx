"use client";

import { useState } from "react";
import { useFinancialData } from "@/lib/use-financial-data";
import type { RangeKey } from "@/lib/date-ranges";
import DateRangeDropdown from "@/components/DateRangeDropdown";
import InfoTooltip from "@/components/InfoTooltip";

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

export default function PayrollPage() {
  const [rangeKey, setRangeKey] = useState<RangeKey>("ytd");
  const { statements, sumCategory, monthRevenue, range } = useFinancialData(rangeKey);

  const hasData = statements.length > 0;

  const payrollByMonth = statements.map(m => {
    const cbiz = m.expenses.filter(e => e.category === "Payroll");
    return {
      month: m.month,
      shortMonth: m.shortMonth,
      year: m.year,
      amount: cbiz.reduce((s, e) => s + e.amount, 0),
      pending: cbiz.some(e => e.pending),
      revenue: monthRevenue(m),
    };
  });

  const totalPayroll = payrollByMonth.reduce((s, m) => s + m.amount, 0);
  const monthCount = payrollByMonth.length || 1;
  const avgMonthlyPayroll = totalPayroll / monthCount;

  // Largest month-over-month change in the period
  let biggestSwing: { from: typeof payrollByMonth[number]; to: typeof payrollByMonth[number]; diff: number; pct: number } | null = null;
  for (let i = 1; i < payrollByMonth.length; i++) {
    const prev = payrollByMonth[i - 1];
    const cur = payrollByMonth[i];
    const diff = cur.amount - prev.amount;
    if (!biggestSwing || Math.abs(diff) > Math.abs(biggestSwing.diff)) {
      const pct = prev.amount > 0 ? (diff / prev.amount) * 100 : 0;
      biggestSwing = { from: prev, to: cur, diff, pct };
    }
  }

  const maxMonth = Math.max(1, ...payrollByMonth.map(x => x.amount));
  const totalPayrollCat = sumCategory("Payroll");

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-900/40 border border-purple-800/40 flex items-center justify-center text-xl">👥</div>
          <div>
            <div className="flex items-center">
              <h1 className="text-2xl font-bold text-white">Payroll &amp; Benefits</h1>
              <InfoTooltip title="Payroll & Benefits">
                <p className="mb-2">CBIZ payroll ACH transactions extracted from KeyBank statements. Amounts are bank-confirmed gross outflows — they include employer taxes and benefits routed through CBIZ.</p>
                <p>Department breakdown requires the CBIZ portal export and isn&apos;t available from bank data alone.</p>
              </InfoTooltip>
            </div>
            <p className="text-gray-500 text-sm mt-0.5">{range.label} — CBIZ + benefits ACH on acct …0115</p>
          </div>
        </div>
        <DateRangeDropdown value={rangeKey} onChange={setRangeKey} />
      </div>

      {!hasData ? (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center text-gray-400">
          No statements in this period yet. Upload a bank statement on the <a href="/finance/upload" className="text-blue-400 hover:underline">upload page</a>, or pick a different range.
        </div>
      ) : (
      <>
      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">{range.label} Total Payroll</div>
          <div className="text-2xl font-bold text-purple-400">{fmt(totalPayrollCat)}</div>
          <div className="text-xs text-gray-500 mt-1">{monthCount} month{monthCount === 1 ? "" : "s"} in range</div>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Monthly Average</div>
          <div className="text-2xl font-bold text-white">{fmt(avgMonthlyPayroll)}</div>
          <div className="text-xs text-gray-500 mt-1">Across the selected range</div>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Annualized Run Rate</div>
          <div className="text-2xl font-bold text-white">{fmt(avgMonthlyPayroll * 12)}</div>
          <div className="text-xs text-gray-500 mt-1">Avg × 12</div>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Largest M/M Change</div>
          {biggestSwing ? (
            <>
              <div className={`text-2xl font-bold ${biggestSwing.diff > 0 ? "text-red-400" : "text-green-400"}`}>
                {biggestSwing.diff > 0 ? "+" : ""}{biggestSwing.pct.toFixed(0)}%
              </div>
              <div className="text-xs text-gray-500 mt-1">
                {biggestSwing.from.shortMonth} → {biggestSwing.to.shortMonth} · {biggestSwing.diff > 0 ? "↑ " : "↓ "}{fmt(Math.abs(biggestSwing.diff))}
              </div>
            </>
          ) : (
            <>
              <div className="text-2xl font-bold text-gray-500">—</div>
              <div className="text-xs text-gray-500 mt-1">Need 2+ months</div>
            </>
          )}
        </div>
      </div>

      {/* Monthly payroll breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Bar chart */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-white mb-5">Monthly Payroll (CBIZ ACH)</h2>
          <div className="space-y-4">
            {payrollByMonth.map(m => {
              const pct = totalPayroll > 0 ? (m.amount / totalPayroll) * 100 : 0;
              const barPct = (m.amount / maxMonth) * 100;
              return (
                <div key={`${m.year}-${m.month}`}>
                  <div className="flex justify-between text-sm mb-1.5">
                    <span className="text-gray-300 font-medium">{m.month} {m.year}</span>
                    <div className="text-right">
                      <span className="text-white font-semibold">{fmt(m.amount)}</span>
                      <span className="text-gray-500 text-xs ml-2">({pct.toFixed(0)}% of period)</span>
                    </div>
                  </div>
                  <div className="h-3 bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-purple-600 rounded-full transition-all"
                      style={{ width: `${barPct}%` }}
                    />
                  </div>
                  {m.pending && (
                    <p className="text-xs text-yellow-600 mt-1">⚠ Estimated from CBIZ ACH — exact breakdown pending</p>
                  )}
                </div>
              );
            })}
          </div>
          <div className="mt-5 pt-4 border-t border-gray-800 flex justify-between">
            <span className="text-sm text-gray-400">{range.label} Total</span>
            <span className="text-sm font-bold text-purple-400">{fmt(totalPayroll)}</span>
          </div>
        </div>

        {/* Notes & context */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
          <h2 className="text-sm font-semibold text-white">Notes &amp; Context</h2>

          {biggestSwing && Math.abs(biggestSwing.pct) >= 15 && (
            <div className={`${biggestSwing.diff > 0 ? "bg-red-900/20 border-red-700/30" : "bg-green-900/20 border-green-700/30"} border rounded-lg p-4`}>
              <div className="flex items-start gap-3">
                <span className={`${biggestSwing.diff > 0 ? "text-red-400" : "text-green-400"} text-lg mt-0.5`}>
                  {biggestSwing.diff > 0 ? "⚠" : "↓"}
                </span>
                <div>
                  <p className={`text-sm font-medium ${biggestSwing.diff > 0 ? "text-red-300" : "text-green-300"}`}>
                    {biggestSwing.to.shortMonth} payroll {biggestSwing.diff > 0 ? "up" : "down"} {Math.abs(biggestSwing.pct).toFixed(0)}% vs {biggestSwing.from.shortMonth}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    {fmt(biggestSwing.to.amount)} vs {fmt(biggestSwing.from.amount)}.
                    {biggestSwing.diff > 0 ? " Could reflect bonuses, additional hires, or a third payroll run. Verify with CBIZ." : " Could reflect a missed run, departure, or payroll-cycle timing."}
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="bg-gray-800/50 rounded-lg p-4">
            <p className="text-xs font-semibold text-gray-300 mb-2">Data Source</p>
            <p className="text-xs text-gray-400">
              Payroll figures are pulled directly from CBIZ ACH debit entries on the KeyBank
              statement for account …0115. These are gross bank outflows — they include employer
              taxes and benefits if processed through CBIZ.
            </p>
          </div>

          <div className="bg-gray-800/50 rounded-lg p-4">
            <p className="text-xs font-semibold text-gray-300 mb-2">To Add Department Breakdown</p>
            <ul className="text-xs text-gray-400 space-y-1 list-disc list-inside">
              <li>Export monthly payroll summary from CBIZ portal</li>
              <li>Or add a CFO Google Sheet with per-dept headcount + salary</li>
              <li>Headcount, role, and salary data can be added manually and will display here automatically</li>
            </ul>
          </div>
        </div>
      </div>

      {/* % of total revenue */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-white mb-4">Payroll as % of Revenue</h2>
        <div className={`grid gap-4 ${payrollByMonth.length <= 3 ? "grid-cols-3" : payrollByMonth.length <= 4 ? "grid-cols-2 md:grid-cols-4" : "grid-cols-2 md:grid-cols-3 lg:grid-cols-6"}`}>
          {payrollByMonth.map(m => {
            const pct = m.revenue > 0 ? (m.amount / m.revenue) * 100 : 0;
            return (
              <div key={`${m.year}-${m.month}`} className="text-center">
                <div className="text-2xl font-bold text-white mb-1">{m.revenue > 0 ? `${pct.toFixed(1)}%` : "—"}</div>
                <div className="text-sm text-gray-400">{m.shortMonth} {m.year}</div>
                <div className="text-xs text-gray-500 mt-1">{fmt(m.amount)} / {fmt(m.revenue)}</div>
                {m.revenue > 0 && (
                  <div className={`mt-2 text-xs font-medium ${pct < 10 ? "text-green-400" : pct < 15 ? "text-yellow-400" : "text-red-400"}`}>
                    {pct < 10 ? "✓ Healthy" : pct < 15 ? "Moderate" : "Review"}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      </>
      )}
    </div>
  );
}
