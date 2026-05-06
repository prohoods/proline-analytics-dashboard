"use client";

import { useState } from "react";
import { CATEGORY_COLORS, CATEGORY_TEXT, type MonthData } from "@/lib/financial-data";
import { useFinancialData } from "@/lib/use-financial-data";

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

const ALL_MONTHS = "All Months";

export default function ExpensesPage() {
  const { statements } = useFinancialData();
  const monthOptions = [ALL_MONTHS, ...statements.map(m => m.month)];
  const [selectedMonth, setSelectedMonth] = useState(ALL_MONTHS);

  const activeMths: MonthData[] = selectedMonth === ALL_MONTHS
    ? statements
    : statements.filter(m => m.month === selectedMonth);

  // Flatten all expense line items for the selected months
  const rows = activeMths.flatMap(m =>
    m.expenses.map(e => ({ ...e, month: m.shortMonth }))
  );

  // Sort: confirmed first, then by amount desc
  rows.sort((a, b) => {
    if (!!a.pending !== !!b.pending) return a.pending ? 1 : -1;
    return b.amount - a.amount;
  });

  const totalShown = rows.reduce((s, r) => s + r.amount, 0);
  const confirmedRows = rows.filter(r => !r.pending);
  const pendingRows = rows.filter(r => r.pending);
  const confirmedTotal = confirmedRows.reduce((s, r) => s + r.amount, 0);
  const pendingTotal = pendingRows.reduce((s, r) => s + r.amount, 0);

  // Category summary for sidebar
  const catSummary: Record<string, number> = {};
  for (const r of rows) {
    catSummary[r.category] = (catSummary[r.category] ?? 0) + r.amount;
  }
  const sortedCats = Object.entries(catSummary).sort((a, b) => b[1] - a[1]);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Expenses</h1>
          <p className="text-gray-400 text-sm mt-1">Bank statement outflows — categorized from KeyBank data</p>
        </div>
        {/* Month filter */}
        <div className="flex gap-2 flex-wrap justify-end">
          {monthOptions.map(m => (
            <button
              key={m}
              onClick={() => setSelectedMonth(m)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                selectedMonth === m
                  ? "bg-emerald-600/20 text-emerald-400 border border-emerald-700/40"
                  : "text-gray-400 hover:text-gray-200 hover:bg-gray-800 border border-transparent"
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Total Outflows</div>
          <div className="text-xl font-bold text-white">{fmt(totalShown)}</div>
          <div className="text-xs text-gray-500 mt-1">{selectedMonth}</div>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Confirmed</div>
          <div className="text-xl font-bold text-emerald-400">{fmt(confirmedTotal)}</div>
          <div className="text-xs text-gray-500 mt-1">{confirmedRows.length} line items</div>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Pending Review</div>
          <div className="text-xl font-bold text-yellow-400">{fmt(pendingTotal)}</div>
          <div className="text-xs text-gray-500 mt-1">Boss clarifying categories</div>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Largest Single Item</div>
          <div className="text-xl font-bold text-white">
            {rows[0] ? fmt(rows[0].amount) : "—"}
          </div>
          <div className="text-xs text-gray-500 mt-1 truncate">{rows[0]?.vendor ?? "—"}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Category summary */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-white mb-4">By Category</h2>
          <div className="space-y-3">
            {sortedCats.map(([cat, amt]) => {
              const pct = totalShown > 0 ? (amt / totalShown) * 100 : 0;
              return (
                <div key={cat}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className={CATEGORY_TEXT[cat] ?? "text-gray-400"} title={cat}>
                      {cat.length > 24 ? cat.slice(0, 22) + "…" : cat}
                    </span>
                    <span className="text-white">{fmt(amt)}</span>
                  </div>
                  <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${CATEGORY_COLORS[cat] ?? "bg-gray-600"} ${cat === "Pending Review" ? "opacity-40" : ""}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Expense table */}
        <div className="lg:col-span-2 bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-500 text-xs uppercase tracking-wider bg-gray-800/50 border-b border-gray-800">
                  <th className="py-2.5 px-4 text-left">Vendor / Description</th>
                  <th className="py-2.5 px-4 text-left">Category</th>
                  <th className="py-2.5 px-4 text-left">Month</th>
                  <th className="py-2.5 px-4 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {rows.map((row, i) => (
                  <tr key={i} className={`hover:bg-gray-800/30 ${row.pending ? "opacity-60" : ""}`}>
                    <td className="py-2.5 px-4">
                      <div className="font-medium text-white">{row.vendor}</div>
                      {row.notes && <div className="text-xs text-gray-500 mt-0.5">{row.notes}</div>}
                    </td>
                    <td className="py-2.5 px-4">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        row.pending
                          ? "bg-yellow-900/30 text-yellow-500"
                          : "bg-gray-800 " + (CATEGORY_TEXT[row.category] ?? "text-gray-400")
                      }`}>
                        {row.pending ? "⚠ Pending" : row.category.split(" ")[0]}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-gray-400">{row.month}</td>
                    <td className="py-2.5 px-4 text-right font-medium text-white">{fmt(row.amount)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-700 bg-gray-800/50 font-bold text-white">
                  <td className="py-3 px-4" colSpan={3}>Total</td>
                  <td className="py-3 px-4 text-right">{fmt(totalShown)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
