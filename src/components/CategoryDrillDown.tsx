"use client";

import { useEffect } from "react";
import { statements, CATEGORY_TEXT, type ExpenseLineItem, type MonthData } from "@/lib/financial-data";

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(n);
}

export interface DrillDownTransaction extends ExpenseLineItem {
  month: string;
  shortMonth: string;
  year: number;
}

/** Collect all transactions across statements for a given category (optionally filtered by month). */
export function getTransactionsForCategory(category: string, month?: MonthData): DrillDownTransaction[] {
  const months = month ? [month] : statements;
  const rows: DrillDownTransaction[] = [];
  for (const m of months) {
    for (const e of m.expenses) {
      if (e.category === category) {
        rows.push({ ...e, month: m.month, shortMonth: m.shortMonth, year: m.year });
      }
    }
  }
  return rows.sort((a, b) => b.amount - a.amount);
}

interface Props {
  category: string | null;
  month?: MonthData;
  onClose: () => void;
}

export default function CategoryDrillDown({ category, month, onClose }: Props) {
  useEffect(() => {
    if (!category) return;
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [category, onClose]);

  if (!category) return null;

  const transactions = getTransactionsForCategory(category, month);
  const total = transactions.reduce((s, t) => s + t.amount, 0);
  const confirmedTotal = transactions.filter(t => !t.pending).reduce((s, t) => s + t.amount, 0);
  const pendingTotal = transactions.filter(t => t.pending).reduce((s, t) => s + t.amount, 0);
  const textColor = CATEGORY_TEXT[category] ?? "text-gray-300";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-4xl max-h-[85vh] overflow-hidden flex flex-col shadow-2xl">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-800 flex items-start justify-between">
          <div>
            <div className={`text-xs uppercase tracking-wide ${textColor}`}>{month ? `${month.shortMonth} ${month.year}` : "Q1 2026"}</div>
            <h2 className="text-lg font-semibold text-white mt-0.5">{category}</h2>
            <div className="text-xs text-gray-500 mt-1">
              {transactions.length} transaction{transactions.length === 1 ? "" : "s"} · Total {fmt(total)}
              {pendingTotal > 0 && <span className="text-yellow-500"> · {fmt(pendingTotal)} pending review</span>}
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-white transition-colors p-1"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Summary bar */}
        <div className="px-6 py-3 bg-gray-800/40 border-b border-gray-800 grid grid-cols-3 gap-4 text-xs">
          <div>
            <div className="text-gray-500 uppercase tracking-wide">Confirmed</div>
            <div className="text-white font-semibold mt-0.5">{fmt(confirmedTotal)}</div>
          </div>
          <div>
            <div className="text-gray-500 uppercase tracking-wide">Pending Review</div>
            <div className="text-yellow-400 font-semibold mt-0.5">{fmt(pendingTotal)}</div>
          </div>
          <div>
            <div className="text-gray-500 uppercase tracking-wide">Total</div>
            <div className={`font-semibold mt-0.5 ${textColor}`}>{fmt(total)}</div>
          </div>
        </div>

        {/* Transactions */}
        <div className="flex-1 overflow-y-auto">
          {transactions.length === 0 ? (
            <div className="p-10 text-center text-gray-500 text-sm">
              No transactions in this category for the selected period.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-gray-900 border-b border-gray-800">
                <tr className="text-gray-500 text-xs uppercase tracking-wider">
                  <th className="py-2.5 px-5 text-left">Month</th>
                  <th className="py-2.5 px-5 text-left">Vendor / Description</th>
                  <th className="py-2.5 px-3 text-left">Acct</th>
                  <th className="py-2.5 px-3 text-center">Status</th>
                  <th className="py-2.5 px-5 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {transactions.map((t, i) => (
                  <tr key={`${t.vendor}-${i}`} className="hover:bg-gray-800/40 transition-colors">
                    <td className="py-3 px-5 text-gray-400 text-xs whitespace-nowrap">
                      {t.shortMonth} {t.year}
                    </td>
                    <td className="py-3 px-5">
                      <div className="text-white font-medium">{t.vendor}</div>
                      {t.notes && <div className="text-xs text-gray-500 mt-0.5">{t.notes}</div>}
                    </td>
                    <td className="py-3 px-3 text-xs text-gray-500 font-mono">
                      {t.account ? `…${t.account}` : "—"}
                    </td>
                    <td className="py-3 px-3 text-center">
                      {t.pending ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-yellow-900/40 text-yellow-400 border border-yellow-800/40">
                          <span className="w-1.5 h-1.5 rounded-full bg-yellow-400" />
                          Pending
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-900/40 text-emerald-400 border border-emerald-800/40">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                          Confirmed
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-5 text-right text-white font-semibold whitespace-nowrap">
                      {fmt(t.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-700 bg-gray-800/50 font-bold text-white">
                  <td className="py-3 px-5" colSpan={4}>Total</td>
                  <td className="py-3 px-5 text-right">{fmt(total)}</td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>

        <div className="px-6 py-3 border-t border-gray-800 bg-gray-800/30 flex items-center justify-between text-xs text-gray-500">
          <span>Press <kbd className="px-1.5 py-0.5 bg-gray-800 border border-gray-700 rounded text-gray-300 font-mono text-[10px]">Esc</kbd> to close</span>
          <span>Source: KeyBank statements · categorization rules in financial-data.ts</span>
        </div>
      </div>
    </div>
  );
}
