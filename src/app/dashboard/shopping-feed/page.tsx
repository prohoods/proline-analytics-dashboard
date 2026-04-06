"use client";

import { useEffect, useState, useMemo } from "react";
import MetricCard from "@/components/MetricCard";

interface ShoppingFeedRow {
  campaignName: string;
  channel: string;
  productId: string;
  impressions: number;
  clicks: number;
  cost: number;
  conversions: number;
  revenue: number;
  roas: number;
  ctr: number;
  cpc: number;
}

interface Totals {
  impressions: number;
  clicks: number;
  cost: number;
  conversions: number;
  revenue: number;
  roas: number;
  ctr: number;
  cpc: number;
}

interface ApiData {
  rows: ShoppingFeedRow[];
  totals: Totals;
  rowCount: number;
}

type SortKey = keyof ShoppingFeedRow;

function fmtCurrency(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(n);
}
function fmtNum(n: number) {
  return new Intl.NumberFormat("en-US").format(Math.round(n));
}
function roasColor(roas: number) {
  if (roas >= 5) return "text-green-400";
  if (roas >= 3) return "text-yellow-400";
  return "text-red-400";
}

export default function ShoppingFeedPage() {
  const [data, setData] = useState<ApiData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [channelFilter, setChannelFilter] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("revenue");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  useEffect(() => {
    fetch("/api/sheets/shopping-feed")
      .then(r => r.json())
      .then(d => { if (d.error) throw new Error(d.error); setData(d); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, []);

  const channels = useMemo(() => {
    if (!data) return [];
    return Array.from(new Set(data.rows.map(r => r.channel).filter(Boolean)));
  }, [data]);

  const filtered = useMemo(() => {
    if (!data) return [];
    return data.rows
      .filter(r => channelFilter === "all" || r.channel === channelFilter)
      .filter(r => !search || r.productId.toLowerCase().includes(search.toLowerCase()) || r.campaignName.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => {
        const av = a[sortKey] as number;
        const bv = b[sortKey] as number;
        return sortDir === "desc" ? bv - av : av - bv;
      });
  }, [data, channelFilter, search, sortKey, sortDir]);

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir(d => d === "desc" ? "asc" : "desc");
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  function SortIcon({ k }: { k: SortKey }) {
    if (sortKey !== k) return <span className="text-gray-600 ml-1">↕</span>;
    return <span className="text-blue-400 ml-1">{sortDir === "desc" ? "↓" : "↑"}</span>;
  }

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Product Ad Performance</h1>
        <p className="text-gray-400 mt-1">Shopping Feed — product-level ad metrics by campaign</p>
        <div className="mt-2 inline-flex items-center gap-2 bg-blue-900/20 border border-blue-700/30 rounded-lg px-3 py-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-blue-400" />
          <span className="text-blue-400 text-xs font-medium">Google Sheets — Synced hourly</span>
        </div>
      </div>

      {loading && <div className="text-gray-400">Loading...</div>}
      {error && <div className="text-red-400 bg-red-900/20 rounded-lg p-4 mb-6 text-sm">{error}</div>}

      {!loading && !error && data && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <MetricCard
              label="Total Revenue"
              value={fmtCurrency(data.totals.revenue)}
              subtext={`${fmtNum(data.totals.conversions)} conversions`}
              highlight
            />
            <MetricCard
              label="Total Ad Spend"
              value={fmtCurrency(data.totals.cost)}
              subtext={`${fmtNum(data.totals.clicks)} clicks`}
            />
            <MetricCard
              label="Blended ROAS"
              value={`${data.totals.roas.toFixed(2)}x`}
              subtext="Revenue / Cost"
              trend={data.totals.roas >= 4 ? "up" : data.totals.roas >= 2 ? undefined : "down"}
            />
            <MetricCard
              label="Products Tracked"
              value={data.rowCount.toString()}
              subtext={`${fmtNum(data.totals.impressions)} impressions`}
            />
          </div>

          {/* Filters */}
          <div className="flex flex-wrap gap-3 mb-4">
            <input
              type="text"
              placeholder="Search product ID or campaign..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
            />
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => setChannelFilter("all")}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${channelFilter === "all" ? "bg-blue-600/20 text-blue-400 border border-blue-600/30" : "text-gray-400 hover:text-gray-100 hover:bg-gray-800"}`}
              >
                All Channels
              </button>
              {channels.map(ch => (
                <button
                  key={ch}
                  onClick={() => setChannelFilter(ch)}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${channelFilter === ch ? "bg-blue-600/20 text-blue-400 border border-blue-600/30" : "text-gray-400 hover:text-gray-100 hover:bg-gray-800"}`}
                >
                  {ch.replace(/_/g, " ")}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-white">Product-Level Ad Performance</h2>
              <span className="text-xs text-gray-500">{filtered.length} products</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-gray-500 text-xs uppercase tracking-wider bg-gray-800/50 border-b border-gray-800">
                    <th className="py-3 px-4 text-left">Product ID</th>
                    <th className="py-3 px-4 text-left">Campaign</th>
                    <th className="py-3 px-4 text-right cursor-pointer hover:text-gray-300" onClick={() => handleSort("impressions")}>
                      Impressions <SortIcon k="impressions" />
                    </th>
                    <th className="py-3 px-4 text-right cursor-pointer hover:text-gray-300" onClick={() => handleSort("clicks")}>
                      Clicks <SortIcon k="clicks" />
                    </th>
                    <th className="py-3 px-4 text-right cursor-pointer hover:text-gray-300" onClick={() => handleSort("ctr")}>
                      CTR <SortIcon k="ctr" />
                    </th>
                    <th className="py-3 px-4 text-right cursor-pointer hover:text-gray-300" onClick={() => handleSort("cost")}>
                      Cost <SortIcon k="cost" />
                    </th>
                    <th className="py-3 px-4 text-right cursor-pointer hover:text-gray-300" onClick={() => handleSort("cpc")}>
                      CPC <SortIcon k="cpc" />
                    </th>
                    <th className="py-3 px-4 text-right cursor-pointer hover:text-gray-300" onClick={() => handleSort("conversions")}>
                      Conv. <SortIcon k="conversions" />
                    </th>
                    <th className="py-3 px-4 text-right cursor-pointer hover:text-gray-300" onClick={() => handleSort("revenue")}>
                      Revenue <SortIcon k="revenue" />
                    </th>
                    <th className="py-3 px-4 text-right cursor-pointer hover:text-gray-300" onClick={() => handleSort("roas")}>
                      ROAS <SortIcon k="roas" />
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {filtered.map((row, i) => (
                    <tr key={`${row.productId}-${i}`} className="text-gray-300 hover:bg-gray-800/40">
                      <td className="py-2.5 px-4 font-mono text-xs text-gray-400 max-w-[180px] truncate">
                        {row.productId || <span className="text-gray-600 italic">—</span>}
                      </td>
                      <td className="py-2.5 px-4 text-xs text-gray-400 max-w-[160px] truncate">{row.campaignName}</td>
                      <td className="py-2.5 px-4 text-right">{fmtNum(row.impressions)}</td>
                      <td className="py-2.5 px-4 text-right">{fmtNum(row.clicks)}</td>
                      <td className="py-2.5 px-4 text-right text-gray-400">{row.ctr.toFixed(2)}%</td>
                      <td className="py-2.5 px-4 text-right">{fmtCurrency(row.cost)}</td>
                      <td className="py-2.5 px-4 text-right text-gray-400">{fmtCurrency(row.cpc)}</td>
                      <td className="py-2.5 px-4 text-right">{row.conversions.toFixed(1)}</td>
                      <td className="py-2.5 px-4 text-right text-green-400 font-medium">{fmtCurrency(row.revenue)}</td>
                      <td className={`py-2.5 px-4 text-right font-semibold ${roasColor(row.roas)}`}>
                        {row.roas > 0 ? `${row.roas.toFixed(2)}x` : <span className="text-gray-600">—</span>}
                      </td>
                    </tr>
                  ))}
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={10} className="py-8 text-center text-gray-500">No products match your filter</td>
                    </tr>
                  )}
                </tbody>
                {filtered.length > 0 && (
                  <tfoot>
                    <tr className="bg-gray-800/50 border-t border-gray-700 text-xs font-semibold text-gray-300">
                      <td colSpan={2} className="py-3 px-4 text-gray-400">Totals ({filtered.length} products)</td>
                      <td className="py-3 px-4 text-right">{fmtNum(filtered.reduce((s, r) => s + r.impressions, 0))}</td>
                      <td className="py-3 px-4 text-right">{fmtNum(filtered.reduce((s, r) => s + r.clicks, 0))}</td>
                      <td className="py-3 px-4 text-right text-gray-400">
                        {(() => {
                          const imp = filtered.reduce((s, r) => s + r.impressions, 0);
                          const clk = filtered.reduce((s, r) => s + r.clicks, 0);
                          return imp > 0 ? `${((clk / imp) * 100).toFixed(2)}%` : "—";
                        })()}
                      </td>
                      <td className="py-3 px-4 text-right">{fmtCurrency(filtered.reduce((s, r) => s + r.cost, 0))}</td>
                      <td className="py-3 px-4 text-right text-gray-400">
                        {(() => {
                          const clk = filtered.reduce((s, r) => s + r.clicks, 0);
                          const cost = filtered.reduce((s, r) => s + r.cost, 0);
                          return clk > 0 ? fmtCurrency(cost / clk) : "—";
                        })()}
                      </td>
                      <td className="py-3 px-4 text-right">{filtered.reduce((s, r) => s + r.conversions, 0).toFixed(1)}</td>
                      <td className="py-3 px-4 text-right text-green-400">{fmtCurrency(filtered.reduce((s, r) => s + r.revenue, 0))}</td>
                      <td className={`py-3 px-4 text-right font-bold ${roasColor((() => { const c = filtered.reduce((s,r)=>s+r.cost,0); const rv = filtered.reduce((s,r)=>s+r.revenue,0); return c>0?rv/c:0; })())}`}>
                        {(() => {
                          const c = filtered.reduce((s, r) => s + r.cost, 0);
                          const rv = filtered.reduce((s, r) => s + r.revenue, 0);
                          return c > 0 ? `${(rv / c).toFixed(2)}x` : "—";
                        })()}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
