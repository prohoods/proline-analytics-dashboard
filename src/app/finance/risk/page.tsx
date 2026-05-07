"use client";

import { useState } from "react";
import { useFinancialData } from "@/lib/use-financial-data";
import type { RangeKey } from "@/lib/date-ranges";
import type { MonthData } from "@/lib/financial-data";
import CategoryDrillDown from "@/components/CategoryDrillDown";
import DateRangeDropdown from "@/components/DateRangeDropdown";
import InfoTooltip from "@/components/InfoTooltip";

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

// Normalize vendor names so "KWS Companies" across months aggregates correctly
function normVendor(v: string): string {
  return v.trim().toLowerCase();
}

interface VendorAgg {
  vendor: string;
  category: string;
  total: number;
  txCount: number;
  months: Set<string>;
  largestTx: number;
  mean: number;
  txs: Array<{ amount: number; month: string; notes: string }>;
}

function aggregateByVendor(statements: MonthData[]) {
  const map = new Map<string, VendorAgg>();
  for (const m of statements) {
    for (const e of m.expenses) {
      const key = normVendor(e.vendor);
      const existing = map.get(key);
      if (existing) {
        existing.total += e.amount;
        existing.txCount += 1;
        existing.months.add(m.shortMonth);
        existing.largestTx = Math.max(existing.largestTx, e.amount);
        existing.txs.push({ amount: e.amount, month: `${m.shortMonth} ${m.year}`, notes: e.notes });
      } else {
        map.set(key, {
          vendor: e.vendor,
          category: e.category,
          total: e.amount,
          txCount: 1,
          months: new Set([m.shortMonth]),
          largestTx: e.amount,
          mean: 0,
          txs: [{ amount: e.amount, month: `${m.shortMonth} ${m.year}`, notes: e.notes }],
        });
      }
    }
  }
  // Compute mean per vendor
  for (const v of map.values()) v.mean = v.total / v.txCount;
  return Array.from(map.values());
}

export default function RiskPage() {
  const [rangeKey, setRangeKey] = useState<RangeKey>("ytd");
  const { statements, q1, range } = useFinancialData(rangeKey);
  const [drillCategory, setDrillCategory] = useState<string | null>(null);

  const hasData = statements.length > 0;
  const vendors = aggregateByVendor(statements).sort((a, b) => b.total - a.total);
  const topVendors = vendors.slice(0, 10);
  const totalSpend = q1.totalExpenses;
  const top5Share = totalSpend > 0 ? vendors.slice(0, 5).reduce((s, v) => s + v.total, 0) / totalSpend * 100 : 0;
  const top10Share = totalSpend > 0 ? vendors.slice(0, 10).reduce((s, v) => s + v.total, 0) / totalSpend * 100 : 0;

  // Supplier concentration — COGS-only vendors
  const suppliers = vendors.filter(v => v.category === "Factory / Inventory (COGS)");
  const totalCogs = suppliers.reduce((s, v) => s + v.total, 0);
  const topSupplier = suppliers[0];
  const topSupplierShare = topSupplier ? (topSupplier.total / totalCogs) * 100 : 0;

  // Anomaly detection — flag vendors where largestTx > 2x their own mean AND they appear > 1x
  const anomalies = vendors
    .filter(v => v.txCount > 1 && v.largestTx > v.mean * 2)
    .map(v => {
      const deviation = (v.largestTx - v.mean) / v.mean;
      const anomalousTx = v.txs.find(t => t.amount === v.largestTx);
      return { ...v, deviation, anomalousTx };
    })
    .sort((a, b) => b.deviation - a.deviation)
    .slice(0, 10);

  return (
    <div className="p-6 space-y-6">
      <CategoryDrillDown category={drillCategory} statements={statements} rangeLabel={range.label} onClose={() => setDrillCategory(null)} />

      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-900/40 border border-emerald-800/40 flex items-center justify-center text-xl">🛡️</div>
          <div>
            <div className="flex items-center">
              <h1 className="text-2xl font-bold text-white">Risk &amp; Controls</h1>
              <InfoTooltip title="Risk &amp; Controls">
                <p className="mb-2">This page surfaces where the business is most exposed financially — and whether anything looks unusual.</p>
                <p className="mb-2"><strong>Concentration risk</strong> = how much of period spend went to a small number of vendors. If one vendor goes down (factory delay, billing dispute), how much of the business is affected?</p>
                <p className="mb-2"><strong>Anomaly detection</strong> = transactions that are far above or below their category&apos;s typical range. Useful for catching duplicate payments, fraud, or one-off spikes that need an explanation.</p>
                <p>Why it matters: knowing where you&apos;re concentrated and what looks off is the foundation of operating discipline.</p>
              </InfoTooltip>
            </div>
            <p className="text-gray-500 text-sm mt-0.5">Concentration risk, anomaly detection, and internal controls — {range.label}</p>
          </div>
        </div>
        <DateRangeDropdown value={rangeKey} onChange={setRangeKey} />
      </div>

      {!hasData && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center text-gray-400">
          No statements in this period yet. Upload a bank statement on the <a href="/finance/upload" className="text-blue-400 hover:underline">upload page</a>, or pick a different range.
        </div>
      )}

      {/* Risk KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <RiskKpi label="Top 5 Vendor Share" value={`${top5Share.toFixed(1)}%`} sub="Of total period spend" severity={top5Share > 60 ? "high" : top5Share > 40 ? "medium" : "low"} />
        <RiskKpi label="Top 10 Vendor Share" value={`${top10Share.toFixed(1)}%`} sub="Of total period spend" severity={top10Share > 80 ? "high" : top10Share > 60 ? "medium" : "low"} />
        <RiskKpi label="Top Supplier Share" value={`${topSupplierShare.toFixed(0)}%`} sub={`${topSupplier?.vendor ?? "—"} of COGS`} severity={topSupplierShare > 60 ? "high" : topSupplierShare > 35 ? "medium" : "low"} />
        <RiskKpi label="Anomalies Detected" value={String(anomalies.length)} sub="Transactions > 2× vendor mean" severity={anomalies.length > 5 ? "medium" : "low"} />
      </div>

      {/* Vendor concentration */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-800">
          <h2 className="text-sm font-semibold text-white">Vendor Concentration — Top 10 by {range.label} Spend</h2>
          <p className="text-xs text-gray-500 mt-0.5">High concentration in a single vendor is a business continuity risk</p>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-500 text-xs uppercase tracking-wider bg-gray-800/40 border-b border-gray-800">
              <th className="py-2.5 px-4 text-left">#</th>
              <th className="py-2.5 px-4 text-left">Vendor</th>
              <th className="py-2.5 px-4 text-left">Category</th>
              <th className="py-2.5 px-4 text-right">{range.label} Total</th>
              <th className="py-2.5 px-4 text-right">% of Spend</th>
              <th className="py-2.5 px-4 text-center">Transactions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {topVendors.map((v, i) => {
              const share = (v.total / totalSpend) * 100;
              return (
                <tr
                  key={v.vendor}
                  onClick={() => setDrillCategory(v.category)}
                  className="hover:bg-gray-800/50 cursor-pointer transition-colors"
                >
                  <td className="py-3 px-4 text-gray-500 text-xs font-mono">{i + 1}</td>
                  <td className="py-3 px-4 text-white font-medium">{v.vendor}</td>
                  <td className="py-3 px-4 text-gray-400 text-xs">{v.category}</td>
                  <td className="py-3 px-4 text-right text-white font-semibold">{fmt(v.total)}</td>
                  <td className="py-3 px-4 text-right">
                    <div className="inline-flex items-center gap-2">
                      <div className="w-16 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${share > 15 ? "bg-red-500" : share > 8 ? "bg-yellow-500" : "bg-emerald-500"}`} style={{ width: `${Math.min(share * 3, 100)}%` }} />
                      </div>
                      <span className="text-xs text-gray-300 w-10 text-right">{share.toFixed(1)}%</span>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-center text-xs text-gray-400">{v.txCount} · {v.months.size} mo</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Supplier concentration callout */}
      {topSupplier && (
        <div className={`bg-gray-900 border ${topSupplierShare > 60 ? "border-red-800/40" : "border-gray-800"} rounded-xl p-5`}>
          <div className="flex items-start gap-3">
            <div className="text-2xl">🏭</div>
            <div className="flex-1">
              <h2 className="text-sm font-semibold text-white mb-1">Supplier Concentration — Single-Source Risk</h2>
              <p className="text-sm text-gray-300 leading-relaxed">
                <span className="text-white font-semibold">{topSupplier.vendor}</span> accounts for <span className={`font-semibold ${topSupplierShare > 60 ? "text-red-400" : "text-yellow-400"}`}>{topSupplierShare.toFixed(0)}%</span> of
                your {range.label} factory spend ({fmt(topSupplier.total)} of {fmt(totalCogs)} total COGS).
                {topSupplierShare > 50 && " This represents a concentration risk — supplier disruption would directly impact inventory availability."}
              </p>
              <div className="mt-3 space-y-2">
                {suppliers.slice(0, 5).map(s => {
                  const share = (s.total / totalCogs) * 100;
                  return (
                    <div key={s.vendor} className="flex items-center gap-3">
                      <div className="w-40 text-xs text-gray-400 truncate">{s.vendor}</div>
                      <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                        <div className="h-full rounded-full bg-blue-500" style={{ width: `${Math.min(share, 100)}%` }} />
                      </div>
                      <div className="text-xs text-white w-20 text-right">{fmt(s.total)}</div>
                      <div className="text-xs text-gray-500 w-10 text-right">{share.toFixed(0)}%</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Anomaly detection */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-800">
          <h2 className="text-sm font-semibold text-white">Transaction Anomalies</h2>
          <p className="text-xs text-gray-500 mt-0.5">Vendors whose largest transaction is &gt;2× their average — could be billing errors, duplicate payments, or one-time events</p>
        </div>
        {anomalies.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-500">No anomalies detected with current {range.label} data.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-500 text-xs uppercase tracking-wider bg-gray-800/40 border-b border-gray-800">
                <th className="py-2.5 px-4 text-left">Vendor</th>
                <th className="py-2.5 px-4 text-right">Vendor Mean</th>
                <th className="py-2.5 px-4 text-right">Largest Tx</th>
                <th className="py-2.5 px-4 text-right">Deviation</th>
                <th className="py-2.5 px-4 text-left">When</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {anomalies.map(a => (
                <tr
                  key={a.vendor}
                  onClick={() => setDrillCategory(a.category)}
                  className="hover:bg-gray-800/50 cursor-pointer transition-colors"
                >
                  <td className="py-3 px-4">
                    <div className="text-white font-medium">{a.vendor}</div>
                    <div className="text-xs text-gray-500 mt-0.5">{a.category}</div>
                  </td>
                  <td className="py-3 px-4 text-right text-gray-400">{fmt(a.mean)}</td>
                  <td className="py-3 px-4 text-right text-white font-semibold">{fmt(a.largestTx)}</td>
                  <td className="py-3 px-4 text-right">
                    <span className={`font-semibold ${a.deviation > 5 ? "text-red-400" : a.deviation > 2 ? "text-yellow-400" : "text-gray-400"}`}>
                      +{(a.deviation * 100).toFixed(0)}%
                    </span>
                  </td>
                  <td className="py-3 px-4 text-xs text-gray-400">{a.anomalousTx?.month ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Controls status */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-white mb-4">Internal Controls — Current State</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <ControlCard title="Authorization Matrix" status="missing" body="No formal dollar-threshold approval policy documented. Owner-operator approves most spend." />
          <ControlCard title="Segregation of Duties" status="watch" body="Small team — one person likely initiates and approves same transaction. Risk acceptable at current scale." />
          <ControlCard title="Monthly Reconciliation" status="watch" body="Reconciliation page exists in app but not confirmed as monthly cadence with sign-off." />
          <ControlCard title="Dual-Control Wires" status="missing" body="International wires >$100K to China — confirm KeyBank wire approval is dual-control." />
          <ControlCard title="Vendor Master Review" status="missing" body="No quarterly review of active vendor list against payments to catch dormant or fraud-created vendors." />
          <ControlCard title="Cash Sweep Policy" status="missing" body="Excess cash in operating account (up to $260K) not being swept to interest-bearing savings." />
        </div>
      </div>
    </div>
  );
}

function RiskKpi({ label, value, sub, severity }: { label: string; value: string; sub: string; severity: "low" | "medium" | "high" }) {
  const color = severity === "high" ? "text-red-400" : severity === "medium" ? "text-yellow-400" : "text-emerald-400";
  const border = severity === "high" ? "border-red-900/40" : severity === "medium" ? "border-yellow-900/40" : "border-gray-800";
  return (
    <div className={`bg-gray-900 border rounded-xl p-5 ${border}`}>
      <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">{label}</div>
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      <div className="text-xs text-gray-500 mt-1">{sub}</div>
    </div>
  );
}

function ControlCard({ title, status, body }: { title: string; status: "ok" | "watch" | "missing"; body: string }) {
  const style = {
    ok:      { color: "text-emerald-400", bg: "bg-emerald-900/40", border: "border-emerald-800/40", dot: "bg-emerald-400", label: "OK" },
    watch:   { color: "text-yellow-400",  bg: "bg-yellow-900/40",  border: "border-yellow-800/40",  dot: "bg-yellow-400",  label: "Watch" },
    missing: { color: "text-red-400",     bg: "bg-red-900/40",     border: "border-red-800/40",     dot: "bg-red-400",     label: "Missing" },
  }[status];
  return (
    <div className="bg-gray-800/40 border border-gray-800 rounded-lg p-3">
      <div className="flex items-center justify-between mb-1">
        <div className="text-white text-sm font-medium">{title}</div>
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${style.bg} ${style.color} border ${style.border}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
          {style.label}
        </span>
      </div>
      <div className="text-xs text-gray-400 leading-relaxed">{body}</div>
    </div>
  );
}
