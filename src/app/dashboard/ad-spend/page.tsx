"use client";

import { useEffect, useState } from "react";
import MetricCard from "@/components/MetricCard";

interface AdSpendRow {
  month: string;
  googleShopping: number;
  connexity: number;
  bing: number;
  amazon: number;
  meta: number;
  pinterest: number;
  totalAdSpend: number;
  convValue: number;
  netRevenue: number;
  roi: number;
  blendedRoas: number;
}

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

const PLATFORMS = [
  { key: "googleShopping", label: "Google Shopping", color: "bg-blue-500" },
  { key: "bing", label: "Bing / Microsoft", color: "bg-teal-500" },
  { key: "connexity", label: "Connexity", color: "bg-purple-500" },
  { key: "meta", label: "Meta", color: "bg-indigo-500" },
  { key: "pinterest", label: "Pinterest", color: "bg-pink-500" },
  { key: "amazon", label: "Amazon Ads", color: "bg-orange-500" },
] as const;

export default function AdSpendPage() {
  const [year, setYear] = useState("2026");
  const [data, setData] = useState<AdSpendRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    setError("");
    fetch(`/api/sheets/ad-spend?year=${year}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) { setError(d.error); } else { setData(d); }
        setLoading(false);
      })
      .catch((e) => { setError(e.message); setLoading(false); });
  }, [year]);

  // Summary: use most recent month for spotlight, all months for totals
  const latest = data[data.length - 1];
  const totalSpend = data.reduce((s, r) => s + r.totalAdSpend, 0);
  const totalConvValue = data.reduce((s, r) => s + r.convValue, 0);
  const avgRoas = totalSpend > 0 ? totalConvValue / totalSpend : 0;

  // Platform totals across selected year
  const platformTotals = PLATFORMS.map((p) => ({
    ...p,
    total: data.reduce((s, r) => s + (r[p.key] as number), 0),
  })).sort((a, b) => b.total - a.total);
  const topSpend = platformTotals[0]?.total ?? 1;

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">All Ad Spend</h1>
          <p className="text-gray-400 mt-1">All platforms — monthly breakdown from Google Sheets</p>
        </div>
        {/* Year selector */}
        <div className="flex gap-2">
          {["2025", "2026"].map((y) => (
            <button
              key={y}
              onClick={() => setYear(y)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                year === y ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-400 hover:text-white"
              }`}
            >
              {y}
            </button>
          ))}
        </div>
      </div>

      {loading && <div className="text-gray-400">Loading...</div>}
      {error && <div className="text-red-400 bg-red-900/20 rounded-lg p-4 mb-6">{error}</div>}

      {!loading && !error && (
        <>
          {/* KPI cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <MetricCard label={`${year} Total Ad Spend`} value={fmt(totalSpend)} subtext="All platforms" highlight />
            <MetricCard label="Blended ROAS" value={`${avgRoas.toFixed(2)}x`} subtext="Conv value / spend" />
            <MetricCard label="Total Conv Value" value={fmt(totalConvValue)} subtext={`${data.length} months`} />
            {latest && (
              <MetricCard label={`${latest.month} Spend`} value={fmt(latest.totalAdSpend)} subtext="Most recent month" />
            )}
          </div>

          {/* Platform breakdown bar chart */}
          <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 mb-6">
            <h2 className="text-base font-semibold text-white mb-4">Spend by Platform — {year} YTD</h2>
            <div className="space-y-4">
              {platformTotals.map((p) => (
                <div key={p.key} className="flex items-center gap-4">
                  <div className="w-36 text-sm text-gray-300 flex-shrink-0">{p.label}</div>
                  <div className="flex-1 bg-gray-800 rounded-full h-2">
                    <div
                      className={`${p.color} rounded-full h-2 transition-all`}
                      style={{ width: `${topSpend > 0 ? (p.total / topSpend) * 100 : 0}%` }}
                    />
                  </div>
                  <div className="w-24 text-right text-sm text-white font-medium">{fmt(p.total)}</div>
                  <div className="w-14 text-right text-xs text-gray-500">
                    {totalSpend > 0 ? ((p.total / totalSpend) * 100).toFixed(1) : 0}%
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 pt-4 border-t border-gray-800 flex justify-between">
              <span className="text-sm text-gray-400">Total</span>
              <span className="text-sm font-bold text-white">{fmt(totalSpend)}</span>
            </div>
          </div>

          {/* Monthly trend table */}
          <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-800">
              <h2 className="text-sm font-semibold text-white">Monthly Breakdown — {year}</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-gray-500 text-xs uppercase tracking-wider bg-gray-800/50 border-b border-gray-800">
                    <th className="py-3 px-4 text-left">Month</th>
                    <th className="py-3 px-4 text-right">Google</th>
                    <th className="py-3 px-4 text-right">Bing</th>
                    <th className="py-3 px-4 text-right">Connexity</th>
                    <th className="py-3 px-4 text-right">Meta</th>
                    <th className="py-3 px-4 text-right">Pinterest</th>
                    <th className="py-3 px-4 text-right">Amazon</th>
                    <th className="py-3 px-4 text-right font-semibold text-gray-300">Total</th>
                    <th className="py-3 px-4 text-right">Conv Value</th>
                    <th className="py-3 px-4 text-right">ROAS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {data.map((row) => (
                    <tr key={row.month} className="text-gray-300 hover:bg-gray-800/40">
                      <td className="py-2.5 px-4 font-medium text-white">{row.month}</td>
                      <td className="py-2.5 px-4 text-right">{fmt(row.googleShopping)}</td>
                      <td className="py-2.5 px-4 text-right">{fmt(row.bing)}</td>
                      <td className="py-2.5 px-4 text-right">{fmt(row.connexity)}</td>
                      <td className="py-2.5 px-4 text-right">{fmt(row.meta)}</td>
                      <td className="py-2.5 px-4 text-right">{fmt(row.pinterest)}</td>
                      <td className="py-2.5 px-4 text-right">{fmt(row.amazon)}</td>
                      <td className="py-2.5 px-4 text-right font-semibold text-white">{fmt(row.totalAdSpend)}</td>
                      <td className="py-2.5 px-4 text-right text-green-400">{fmt(row.convValue)}</td>
                      <td className="py-2.5 px-4 text-right text-blue-400">
                        {row.blendedRoas > 0 ? `${row.blendedRoas.toFixed(2)}x` : row.convValue > 0 ? `${(row.convValue / row.totalAdSpend).toFixed(2)}x` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-gray-700 bg-gray-800/50 font-semibold text-white">
                    <td className="py-3 px-4">Total</td>
                    <td className="py-3 px-4 text-right">{fmt(data.reduce((s, r) => s + r.googleShopping, 0))}</td>
                    <td className="py-3 px-4 text-right">{fmt(data.reduce((s, r) => s + r.bing, 0))}</td>
                    <td className="py-3 px-4 text-right">{fmt(data.reduce((s, r) => s + r.connexity, 0))}</td>
                    <td className="py-3 px-4 text-right">{fmt(data.reduce((s, r) => s + r.meta, 0))}</td>
                    <td className="py-3 px-4 text-right">{fmt(data.reduce((s, r) => s + r.pinterest, 0))}</td>
                    <td className="py-3 px-4 text-right">{fmt(data.reduce((s, r) => s + r.amazon, 0))}</td>
                    <td className="py-3 px-4 text-right">{fmt(totalSpend)}</td>
                    <td className="py-3 px-4 text-right text-green-400">{fmt(totalConvValue)}</td>
                    <td className="py-3 px-4 text-right text-blue-400">{avgRoas.toFixed(2)}x</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
