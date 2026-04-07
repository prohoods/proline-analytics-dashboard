"use client";

import { useEffect, useState } from "react";
import MetricCard from "@/components/MetricCard";

interface ConnexityRow { month: string; clicks: number; cost: number; orders: number; revenue: number; roas: number; cpc: number; convRate: number; }
interface Totals { clicks: number; cost: number; orders: number; revenue: number; roas: number; cpc: number; convRate: number; }
interface ApiData { rows: ConnexityRow[]; totals: Totals; months: string[]; }

const fmt = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
const fmtN = (n: number) => new Intl.NumberFormat("en-US").format(Math.round(n));
const roasColor = (r: number) => r >= 5 ? "text-green-400" : r >= 3 ? "text-yellow-400" : "text-red-400";

export default function ConnexityPage() {
  const [data, setData] = useState<ApiData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/sheets/connexity")
      .then(r => r.json())
      .then(d => { if (d.error) throw new Error(d.error); setData(d); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, []);

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Connexity</h1>
        <p className="text-gray-400 mt-1">Comparison shopping network — monthly performance</p>
        <div className="mt-2 inline-flex items-center gap-2 bg-yellow-900/20 border border-yellow-700/30 rounded-lg px-3 py-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-yellow-400" />
          <span className="text-yellow-400 text-xs font-medium">Manual data — Google Sheets</span>
        </div>
      </div>
      {loading && <div className="text-gray-400">Loading...</div>}
      {error && <div className="text-red-400 bg-red-900/20 rounded-lg p-4 mb-6 text-sm">{error}</div>}
      {!loading && !error && data && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <MetricCard label="Total Revenue" value={fmt(data.totals.revenue)} subtext={`${fmtN(data.totals.orders)} orders`} highlight />
            <MetricCard label="Total Spend" value={fmt(data.totals.cost)} subtext={`${fmtN(data.totals.clicks)} clicks`} />
            <MetricCard label="ROAS" value={`${data.totals.roas.toFixed(2)}x`} subtext="Revenue / Cost" trend={data.totals.roas >= 4 ? "up" : undefined} />
            <MetricCard label="Conv. Rate" value={`${data.totals.convRate.toFixed(2)}%`} subtext={`$${data.totals.cpc.toFixed(2)} CPC`} />
          </div>
          <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-white">Monthly Performance</h2>
              <span className="text-xs text-gray-500">{data.rows.length} months</span>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-500 text-xs uppercase tracking-wider bg-gray-800/50 border-b border-gray-800">
                  <th className="py-3 px-4 text-left">Month</th>
                  <th className="py-3 px-4 text-right">Clicks</th>
                  <th className="py-3 px-4 text-right">CPC</th>
                  <th className="py-3 px-4 text-right">Cost</th>
                  <th className="py-3 px-4 text-right">Orders</th>
                  <th className="py-3 px-4 text-right">Conv. Rate</th>
                  <th className="py-3 px-4 text-right">Revenue</th>
                  <th className="py-3 px-4 text-right">ROAS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {data.rows.length === 0 ? (
                  <tr><td colSpan={8} className="py-8 text-center text-gray-500">No data yet — add rows to the Connexity tab in your ad data sheet</td></tr>
                ) : data.rows.map((r, i) => (
                  <tr key={i} className="text-gray-300 hover:bg-gray-800/40">
                    <td className="py-2.5 px-4 text-gray-400 font-medium">{r.month}</td>
                    <td className="py-2.5 px-4 text-right">{fmtN(r.clicks)}</td>
                    <td className="py-2.5 px-4 text-right text-gray-400">${r.cpc.toFixed(2)}</td>
                    <td className="py-2.5 px-4 text-right">{fmt(r.cost)}</td>
                    <td className="py-2.5 px-4 text-right">{r.orders}</td>
                    <td className="py-2.5 px-4 text-right text-gray-400">{r.convRate.toFixed(2)}%</td>
                    <td className="py-2.5 px-4 text-right text-green-400 font-medium">{fmt(r.revenue)}</td>
                    <td className={`py-2.5 px-4 text-right font-semibold ${roasColor(r.roas)}`}>{r.roas > 0 ? `${r.roas.toFixed(2)}x` : "—"}</td>
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
