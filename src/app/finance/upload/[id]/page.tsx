"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import type { PersistedStatement } from "@/lib/persisted-statements";

const fmtCurrency = (n: number | null | undefined) =>
  typeof n === "number" ? n.toLocaleString("en-US", { style: "currency", currency: "USD" }) : "—";

const fmtDate = (iso: string) => {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

export default function StatementReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [record, setRecord] = useState<PersistedStatement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "pending" | "credits" | "debits">("all");
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/finance/statements/${id}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) setError(data.error);
        else setRecord(data.statement);
      })
      .catch(err => setError(err.message));
  }, [id]);

  if (error) {
    return (
      <div className="p-6 max-w-3xl">
        <Link href="/finance/upload" className="text-emerald-400 text-sm hover:underline">← Back to uploads</Link>
        <div className="mt-6 p-5 bg-red-900/20 border border-red-800/40 rounded-xl text-red-300 text-sm">{error}</div>
      </div>
    );
  }

  if (!record) {
    return <div className="p-6 text-gray-500 text-sm">Loading statement…</div>;
  }

  const { parsed, summary } = record;
  const transactions = parsed.transactions.filter(tx => {
    if (filter === "pending" && !tx.pending) return false;
    if (filter === "credits" && tx.type !== "credit") return false;
    if (filter === "debits" && tx.type !== "debit") return false;
    if (categoryFilter && tx.category !== categoryFilter) return false;
    return true;
  });

  const categoryEntries = Object.entries(summary.byCategory).sort((a, b) => b[1].total - a[1].total);
  const net = (parsed.beginBalance ?? 0) + parsed.totalCredits - parsed.totalDebits;
  const balanceDiff = parsed.endBalance !== null ? Math.abs(net - parsed.endBalance) : null;

  return (
    <div className="p-6 space-y-6 max-w-7xl">
      <div>
        <Link href="/finance/upload" className="text-emerald-400 text-sm hover:underline">← Back to uploads</Link>
        <h1 className="text-2xl font-bold text-white mt-2">Statement Review</h1>
        <p className="text-gray-500 text-sm mt-0.5">
          <span className="font-mono">{record.fileName}</span> · Account …{parsed.account} · {fmtDate(parsed.periodStart)} – {fmtDate(parsed.periodEnd)}
        </p>
      </div>

      {/* Warnings */}
      {parsed.warnings.length > 0 && (
        <div className="bg-yellow-900/20 border border-yellow-800/40 rounded-xl p-4">
          <h2 className="text-sm font-semibold text-yellow-300 mb-2">Parser warnings</h2>
          <ul className="list-disc list-inside text-xs text-yellow-200/80 space-y-1">
            {parsed.warnings.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        </div>
      )}

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KPICard label="Begin Balance" value={fmtCurrency(parsed.beginBalance)} />
        <KPICard label="Total Credits" value={fmtCurrency(parsed.totalCredits)} accent="emerald" />
        <KPICard label="Total Debits" value={fmtCurrency(parsed.totalDebits)} accent="red" />
        <KPICard label="End Balance" value={fmtCurrency(parsed.endBalance)} />
        <KPICard
          label="Balance Check"
          value={balanceDiff === null ? "—" : balanceDiff < 1 ? "OK" : `Off ${fmtCurrency(balanceDiff)}`}
          accent={balanceDiff !== null && balanceDiff < 1 ? "emerald" : "yellow"}
        />
      </div>

      {/* Category breakdown */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-800 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-white">Categorized Spend</h2>
            <p className="text-xs text-gray-500 mt-0.5">{parsed.transactions.length} transactions · {summary.uncategorized} uncategorized</p>
          </div>
          {categoryFilter && (
            <button onClick={() => setCategoryFilter(null)} className="text-xs text-emerald-400 hover:underline">
              Clear filter ({categoryFilter})
            </button>
          )}
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-500 text-xs uppercase tracking-wider bg-gray-800/40 border-b border-gray-800">
              <th className="py-2 px-4 text-left">Category</th>
              <th className="py-2 px-4 text-right">Count</th>
              <th className="py-2 px-4 text-right">Pending</th>
              <th className="py-2 px-4 text-right">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {categoryEntries.map(([cat, stats]) => (
              <tr
                key={cat}
                onClick={() => setCategoryFilter(cat === categoryFilter ? null : cat)}
                className={`cursor-pointer hover:bg-gray-800/40 ${categoryFilter === cat ? "bg-emerald-900/20" : ""}`}
              >
                <td className="py-2.5 px-4 text-white">{cat}</td>
                <td className="py-2.5 px-4 text-right text-gray-300">{stats.count}</td>
                <td className="py-2.5 px-4 text-right text-yellow-400">{stats.pending || ""}</td>
                <td className="py-2.5 px-4 text-right text-white font-mono">{fmtCurrency(stats.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Filter toolbar */}
      <div className="flex items-center gap-2 text-xs">
        <span className="text-gray-500">Filter:</span>
        {(["all", "pending", "credits", "debits"] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg border transition ${
              filter === f
                ? "bg-emerald-900/40 border-emerald-700/60 text-emerald-300"
                : "bg-gray-900 border-gray-800 text-gray-400 hover:border-gray-700"
            }`}
          >
            {f}
          </button>
        ))}
        <div className="ml-auto text-gray-500">{transactions.length} shown</div>
      </div>

      {/* Transactions table */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-500 text-xs uppercase tracking-wider bg-gray-800/40 border-b border-gray-800">
              <th className="py-2 px-4 text-left">Date</th>
              <th className="py-2 px-4 text-left">Description</th>
              <th className="py-2 px-4 text-left">Category</th>
              <th className="py-2 px-4 text-right">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {transactions.map((tx, i) => (
              <tr key={i} className="hover:bg-gray-800/30">
                <td className="py-2 px-4 text-gray-400 text-xs whitespace-nowrap">{fmtDate(tx.date)}</td>
                <td className="py-2 px-4 text-white text-xs font-mono truncate max-w-md" title={tx.description}>{tx.description}</td>
                <td className="py-2 px-4 text-xs">
                  <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] border ${
                    tx.pending
                      ? "bg-yellow-900/30 border-yellow-800/40 text-yellow-300"
                      : "bg-gray-800/60 border-gray-700 text-gray-300"
                  }`}>
                    {tx.category ?? "—"}
                  </span>
                </td>
                <td className={`py-2 px-4 text-right font-mono text-xs ${tx.type === "credit" ? "text-emerald-400" : "text-red-300"}`}>
                  {tx.type === "credit" ? "+" : ""}{fmtCurrency(tx.amount)}
                </td>
              </tr>
            ))}
            {transactions.length === 0 && (
              <tr><td colSpan={4} className="py-8 text-center text-gray-500 text-xs">No transactions match this filter.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function KPICard({ label, value, accent }: { label: string; value: string; accent?: "emerald" | "red" | "yellow" }) {
  const color =
    accent === "emerald" ? "text-emerald-400"
    : accent === "red" ? "text-red-300"
    : accent === "yellow" ? "text-yellow-400"
    : "text-white";
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
      <div className="text-[10px] uppercase tracking-wider text-gray-500">{label}</div>
      <div className={`text-lg font-semibold mt-1 ${color}`}>{value}</div>
    </div>
  );
}
