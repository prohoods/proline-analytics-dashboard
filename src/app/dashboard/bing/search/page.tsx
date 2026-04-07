"use client";

import { useEffect, useState } from "react";
import MetricCard from "@/components/MetricCard";

interface BingRow {
  month: string; campaign: string; type: string;
  impressions: number; clicks: number; cost: number;
  conversions: number; revenue: number; roas: number; ctr: number; cpc: number;
}

const fmt = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
const fmtN = (n: number) => new Intl.NumberFormat("en-US").format(Math.round(n));
const roasColor = (r: number) => r >= 5 ? "text-green-400" : r >= 3 ? "text-yellow-400" : "text-red-400";

export default function BingSearchPage() {
  const [rows, setRows] = useState<BingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/sheets/bing")
      .then(r => r.json())
      .then(d => { if (d.error) throw new Error(d.error); setRows(d.rows.filter((r: BingRow) => r.type === "Search")); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, []);

  const imp = rows.reduce((s, r) => s + r.impressions, 0);
  const clk = rows.reduce((s, r) => s + r.clicks, 0);
  const cost = rows.reduce((s, r) => s + r.cost, 0);
  const conv = rows.reduce((s, r) => s + r.conversions, 0);
  const rev = rows.reduce((s, r) => s + r.revenue, 0);
  const roas = cost > 0 ? rev / cost : 0;

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Bing — Branded &amp; Search</h1>
        <p className="text-gray-400 mt-1">Nonbranded Search, Branded Search, Branded SKU campaigns</p>
        <div className="mt-2 inline-flex items-center gap-2 bg-yellow-900/20 border border-yellow-700/30 rounded-lg px-3 py-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-yellow-400" />
          <span className="text-yellow-400 text-xs font-medium">Manual data — Google Sheets</span>
        </div>
      </div>
      {loading && <div className="text-gray-400">Loading...</div>}
      {error && <div className="text-red-400 bg-red-900/20 rounded-lg p-4 mb-6 text-sm">{error}</div>}
      {!loading && !error && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <MetricCard label="Total Revenue" value={fmt(rev)} subtext={`${fmtN(conv)} conversions`} highlight />
            <MetricCard label="Total Spend" value={fmt(cost)} subtext={`${fmtN(clk)} clicks`} />
            <MetricCard label="ROAS" value={`${roas.toFixed(2)}x`} subtext="Revenue / Cost" trend={roas >= 4 ? "up" : undefined} />
            <MetricCard label="Impressions" value={fmtN(imp)} subtext={`${imp > 0 ? ((clk / imp) * 100).toFixed(2) : 0}% CTR`} />
          </div>
          <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-white">Search Campaigns by Month</h2>
              <span className="text-xs text-gray-500">{rows.length} rows</span>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-500 text-xs uppercase tracking-wider bg-gray-800/50 border-b border-gray-800">
                  <th className="py-3 px-4 text-left">Month</th>
                  <th className="py-3 px-4 text-left">Campaign</th>
                  <th className="py-3 px-4 text-right">Impressions</th>
                  <th className="py-3 px-4 text-right">Clicks</th>
                  <th className="py-3 px-4 text-right">CTR</th>
                  <th className="py-3 px-4 text-right">Cost</th>
                  <th className="py-3 px-4 text-right">Revenue</th>
                  <th className="py-3 px-4 text-right">ROAS</th>
                  <th className="py-3 px-4 text-right">Conv.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {rows.length === 0 ? (
                  <tr><td colSpan={9} className="py-8 text-center text-gray-500">No Search data — add rows with Type = Search in the Bing Ads sheet tab</td></tr>
                ) : rows.map((r, i) => (
                  <tr key={i} className="text-gray-300 hover:bg-gray-800/40">
                    <td className="py-2.5 px-4 text-gray-400">{r.month}</td>
                    <td className="py-2.5 px-4 font-medium text-white">{r.campaign}</td>
                    <td className="py-2.5 px-4 text-right">{fmtN(r.impressions)}</td>
                    <td className="py-2.5 px-4 text-right">{fmtN(r.clicks)}</td>
                    <td className="py-2.5 px-4 text-right text-gray-400">{r.ctr.toFixed(2)}%</td>
                    <td className="py-2.5 px-4 text-right">{fmt(r.cost)}</td>
                    <td className="py-2.5 px-4 text-right text-green-400 font-medium">{fmt(r.revenue)}</td>
                    <td className={`py-2.5 px-4 text-right font-semibold ${roasColor(r.roas)}`}>{r.roas > 0 ? `${r.roas.toFixed(2)}x` : "—"}</td>
                    <td className="py-2.5 px-4 text-right">{r.conversions}</td>
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
