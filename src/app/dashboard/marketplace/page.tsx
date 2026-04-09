"use client";

import { useEffect, useState } from "react";

interface MarketplaceDay {
  date: string;
  amazon: number;
  wayfair: number;
  homeDepot: number;
  gross: number;
  returns: number;
  net: number;
}

interface MarketplaceSummary {
  amazon: number;
  wayfair: number;
  homeDepot: number;
  gross: number;
  returns: number;
  net: number;
  days: MarketplaceDay[];
}

const fmtC = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

const channels = [
  { key: "amazon" as const, label: "Amazon", color: "bg-orange-500" },
  { key: "wayfair" as const, label: "Wayfair", color: "bg-purple-500" },
  { key: "homeDepot" as const, label: "Home Depot", color: "bg-orange-700" },
];

export default function MarketplacePage() {
  const [data, setData] = useState<MarketplaceSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/sheets/marketplace")
      .then(r => r.json())
      .then(d => { if (d.error) throw new Error(d.error); setData(d); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, []);

  // Group days by month for the breakdown table
  const monthMap: Record<string, { amazon: number; wayfair: number; homeDepot: number; gross: number; returns: number; net: number }> = {};
  if (data) {
    for (const day of data.days) {
      const ym = day.date.substring(0, 7);
      if (!monthMap[ym]) monthMap[ym] = { amazon: 0, wayfair: 0, homeDepot: 0, gross: 0, returns: 0, net: 0 };
      monthMap[ym].amazon += day.amazon;
      monthMap[ym].wayfair += day.wayfair;
      monthMap[ym].homeDepot += day.homeDepot;
      monthMap[ym].gross += day.gross;
      monthMap[ym].returns += day.returns;
      monthMap[ym].net += day.net;
    }
  }
  const months = Object.entries(monthMap).sort((a, b) => b[0].localeCompare(a[0]));

  const totalNet = data?.net ?? 0;

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Marketplace Sales</h1>
        <p className="text-gray-400 mt-1">Amazon, Wayfair & Home Depot — from 2026 Daily Sales Report</p>
        <div className="mt-2 inline-flex items-center gap-2 bg-blue-900/20 border border-blue-700/30 rounded-lg px-3 py-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-blue-400" />
          <span className="text-blue-400 text-xs font-medium">Google Sheets — 15 min cache</span>
        </div>
      </div>

      {loading && <div className="text-gray-400">Loading...</div>}
      {error && <div className="text-red-400 bg-red-900/20 rounded-lg p-4 mb-6 text-sm">{error}</div>}

      {!loading && !error && data && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Total Net Revenue</div>
              <div className="text-2xl font-bold text-white">{fmtC(data.net)}</div>
              <div className="text-xs text-gray-500 mt-1">{fmtC(data.gross)} gross · {fmtC(data.returns)} returns</div>
            </div>
            {channels.map(ch => (
              <div key={ch.key} className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`w-2 h-2 rounded-full ${ch.color}`} />
                  <span className="text-xs text-gray-500 uppercase tracking-wider">{ch.label}</span>
                </div>
                <div className="text-2xl font-bold text-white">{fmtC(data[ch.key])}</div>
                <div className="text-xs text-gray-500 mt-1">
                  {totalNet > 0 ? `${((data[ch.key] / totalNet) * 100).toFixed(1)}% of total` : "—"}
                </div>
              </div>
            ))}
          </div>

          {/* Channel share bar */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-6">
            <h2 className="text-sm font-semibold text-white mb-4">Revenue Mix</h2>
            <div className="flex h-3 rounded-full overflow-hidden mb-3">
              {channels.map(ch => {
                const pct = totalNet > 0 ? (data[ch.key] / totalNet) * 100 : 0;
                return pct > 0 ? <div key={ch.key} className={`${ch.color}`} style={{ width: `${pct}%` }} /> : null;
              })}
            </div>
            <div className="flex gap-6">
              {channels.map(ch => (
                <div key={ch.key} className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${ch.color}`} />
                  <span className="text-sm text-gray-400">{ch.label}</span>
                  <span className="text-sm font-medium text-white">{fmtC(data[ch.key])}</span>
                  <span className="text-xs text-gray-500">
                    {totalNet > 0 ? `${((data[ch.key] / totalNet) * 100).toFixed(1)}%` : "—"}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Monthly breakdown */}
          <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden mb-6">
            <div className="px-6 py-4 border-b border-gray-800">
              <h2 className="text-sm font-semibold text-white">Monthly Breakdown</h2>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-500 text-xs uppercase tracking-wider bg-gray-800/50 border-b border-gray-800">
                  <th className="py-3 px-4 text-left">Month</th>
                  <th className="py-3 px-4 text-right">Amazon</th>
                  <th className="py-3 px-4 text-right">Wayfair</th>
                  <th className="py-3 px-4 text-right">Home Depot</th>
                  <th className="py-3 px-4 text-right">Gross</th>
                  <th className="py-3 px-4 text-right">Returns</th>
                  <th className="py-3 px-4 text-right">Net</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {months.map(([ym, m]) => (
                  <tr key={ym} className="text-gray-300 hover:bg-gray-800/40">
                    <td className="py-2.5 px-4 font-medium text-white">{ym}</td>
                    <td className="py-2.5 px-4 text-right text-orange-400">{fmtC(m.amazon)}</td>
                    <td className="py-2.5 px-4 text-right text-purple-400">{fmtC(m.wayfair)}</td>
                    <td className="py-2.5 px-4 text-right text-orange-300">{fmtC(m.homeDepot)}</td>
                    <td className="py-2.5 px-4 text-right">{fmtC(m.gross)}</td>
                    <td className="py-2.5 px-4 text-right text-red-400">{m.returns > 0 ? fmtC(m.returns) : "—"}</td>
                    <td className="py-2.5 px-4 text-right font-semibold text-green-400">{fmtC(m.net)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-gray-800/50 border-t border-gray-700 font-semibold text-white text-xs">
                  <td className="py-3 px-4">Total</td>
                  <td className="py-3 px-4 text-right text-orange-400">{fmtC(data.amazon)}</td>
                  <td className="py-3 px-4 text-right text-purple-400">{fmtC(data.wayfair)}</td>
                  <td className="py-3 px-4 text-right text-orange-300">{fmtC(data.homeDepot)}</td>
                  <td className="py-3 px-4 text-right">{fmtC(data.gross)}</td>
                  <td className="py-3 px-4 text-right text-red-400">{data.returns > 0 ? fmtC(data.returns) : "—"}</td>
                  <td className="py-3 px-4 text-right text-green-400">{fmtC(data.net)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Recent daily rows */}
          <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-white">Recent Daily Detail</h2>
              <span className="text-xs text-gray-500">Last 30 days</span>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-500 text-xs uppercase tracking-wider bg-gray-800/50 border-b border-gray-800">
                  <th className="py-3 px-4 text-left">Date</th>
                  <th className="py-3 px-4 text-right">Amazon</th>
                  <th className="py-3 px-4 text-right">Wayfair</th>
                  <th className="py-3 px-4 text-right">Home Depot</th>
                  <th className="py-3 px-4 text-right">Net</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {[...data.days]
                  .filter(d => d.gross > 0)
                  .sort((a, b) => b.date.localeCompare(a.date))
                  .slice(0, 30)
                  .map(day => (
                    <tr key={day.date} className="text-gray-300 hover:bg-gray-800/40">
                      <td className="py-2 px-4 text-gray-400">{day.date}</td>
                      <td className="py-2 px-4 text-right">{day.amazon > 0 ? fmtC(day.amazon) : <span className="text-gray-600">—</span>}</td>
                      <td className="py-2 px-4 text-right">{day.wayfair > 0 ? fmtC(day.wayfair) : <span className="text-gray-600">—</span>}</td>
                      <td className="py-2 px-4 text-right">{day.homeDepot > 0 ? fmtC(day.homeDepot) : <span className="text-gray-600">—</span>}</td>
                      <td className="py-2 px-4 text-right font-medium text-green-400">{fmtC(day.net)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
