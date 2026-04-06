"use client";

import { useEffect, useState } from "react";
import MetricCard from "@/components/MetricCard";

interface Campaign {
  name: string;
  type: string;
  spend: number;
  convValue: number;
  clicks: number;
  impressions: number;
}

interface MonthData {
  month: string;
  totalSpend: number;
  totalConvValue: number;
  totalClicks: number;
  totalImpressions: number;
  roas: number;
  campaigns: Campaign[];
}

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}
function fmtNum(n: number) {
  return new Intl.NumberFormat("en-US").format(n);
}

export default function SearchPage() {
  const [year, setYear] = useState("2026");
  const [data, setData] = useState<MonthData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expandedMonth, setExpandedMonth] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError("");
    fetch(`/api/google-ads/campaigns?year=${year}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error);
        // Filter to Search only
        const filtered = d.map((m: MonthData) => ({
          ...m,
          campaigns: m.campaigns.filter((c) => c.type === "Search"),
          totalSpend: m.campaigns.filter((c) => c.type === "Search").reduce((s: number, c: Campaign) => s + c.spend, 0),
          totalConvValue: m.campaigns.filter((c) => c.type === "Search").reduce((s: number, c: Campaign) => s + c.convValue, 0),
          totalClicks: m.campaigns.filter((c) => c.type === "Search").reduce((s: number, c: Campaign) => s + c.clicks, 0),
          totalImpressions: m.campaigns.filter((c) => c.type === "Search").reduce((s: number, c: Campaign) => s + c.impressions, 0),
        })).filter((m: MonthData) => m.totalSpend > 0);
        setData(filtered);
        setLoading(false);
      })
      .catch((e) => { setError(e.message); setLoading(false); });
  }, [year]);

  const totalSpend = data.reduce((s, m) => s + m.totalSpend, 0);
  const totalConvValue = data.reduce((s, m) => s + m.totalConvValue, 0);
  const totalClicks = data.reduce((s, m) => s + m.totalClicks, 0);
  const totalImpressions = data.reduce((s, m) => s + m.totalImpressions, 0);
  const avgRoas = totalSpend > 0 ? totalConvValue / totalSpend : 0;
  const avgCpc = totalClicks > 0 ? totalSpend / totalClicks : 0;
  const ctr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;

  // Campaign totals across all months
  const campaignTotals: Record<string, { name: string; spend: number; convValue: number; clicks: number; impressions: number }> = {};
  for (const month of data) {
    for (const c of month.campaigns) {
      if (!campaignTotals[c.name]) campaignTotals[c.name] = { name: c.name, spend: 0, convValue: 0, clicks: 0, impressions: 0 };
      campaignTotals[c.name].spend += c.spend;
      campaignTotals[c.name].convValue += c.convValue;
      campaignTotals[c.name].clicks += c.clicks;
      campaignTotals[c.name].impressions += c.impressions;
    }
  }
  const campaigns = Object.values(campaignTotals).sort((a, b) => b.spend - a.spend);

  return (
    <div className="p-8">
      <div className="mb-6 flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Search Campaigns</h1>
          <p className="text-gray-400 mt-1">Google Search campaigns — live Google Ads API</p>
          <div className="mt-2 inline-flex items-center gap-2 bg-green-900/20 border border-green-700/30 rounded-lg px-3 py-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
            <span className="text-green-400 text-xs font-medium">Live — Google Ads API</span>
          </div>
        </div>
        <div className="flex gap-2">
          {["2025", "2026"].map((y) => (
            <button key={y} onClick={() => setYear(y)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${year === y ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-400 hover:text-white"}`}>
              {y}
            </button>
          ))}
        </div>
      </div>

      {loading && <div className="text-gray-400">Loading...</div>}
      {error && <div className="text-red-400 bg-red-900/20 rounded-lg p-4 mb-6 text-sm">{error}</div>}

      {!loading && !error && data.length === 0 && (
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-8 text-center">
          <p className="text-gray-400">No Search campaigns found for {year}.</p>
        </div>
      )}

      {!loading && !error && data.length > 0 && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <MetricCard label={`${year} Total Spend`} value={fmt(totalSpend)} subtext="Search only" highlight />
            <MetricCard label="ROAS" value={`${avgRoas.toFixed(2)}x`} subtext="Conv value / spend" />
            <MetricCard label="Avg CPC" value={`$${avgCpc.toFixed(2)}`} subtext={`${fmtNum(totalClicks)} clicks`} />
            <MetricCard label="CTR" value={`${ctr.toFixed(2)}%`} subtext={`${fmtNum(totalImpressions)} impressions`} />
          </div>

          {/* Campaign summary */}
          <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden mb-6">
            <div className="px-6 py-4 border-b border-gray-800">
              <h2 className="text-sm font-semibold text-white">{year} Search Campaign Summary</h2>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-500 text-xs uppercase tracking-wider bg-gray-800/50 border-b border-gray-800">
                  <th className="py-3 px-4 text-left">Campaign</th>
                  <th className="py-3 px-4 text-right">Spend</th>
                  <th className="py-3 px-4 text-right">Conv Value</th>
                  <th className="py-3 px-4 text-right">ROAS</th>
                  <th className="py-3 px-4 text-right">Clicks</th>
                  <th className="py-3 px-4 text-right">Impressions</th>
                  <th className="py-3 px-4 text-right">CTR</th>
                  <th className="py-3 px-4 text-right">Avg CPC</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {campaigns.map((c) => (
                  <tr key={c.name} className="text-gray-300 hover:bg-gray-800/40">
                    <td className="py-2.5 px-4 font-medium text-white">{c.name}</td>
                    <td className="py-2.5 px-4 text-right">{fmt(c.spend)}</td>
                    <td className="py-2.5 px-4 text-right text-green-400">{fmt(c.convValue)}</td>
                    <td className="py-2.5 px-4 text-right text-blue-400">
                      {c.spend > 0 ? `${(c.convValue / c.spend).toFixed(2)}x` : "—"}
                    </td>
                    <td className="py-2.5 px-4 text-right">{fmtNum(c.clicks)}</td>
                    <td className="py-2.5 px-4 text-right">{fmtNum(c.impressions)}</td>
                    <td className="py-2.5 px-4 text-right">
                      {c.impressions > 0 ? `${((c.clicks / c.impressions) * 100).toFixed(2)}%` : "—"}
                    </td>
                    <td className="py-2.5 px-4 text-right">
                      {c.clicks > 0 ? `$${(c.spend / c.clicks).toFixed(2)}` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-700 bg-gray-800/50 font-semibold text-white">
                  <td className="py-3 px-4">Total</td>
                  <td className="py-3 px-4 text-right">{fmt(totalSpend)}</td>
                  <td className="py-3 px-4 text-right text-green-400">{fmt(totalConvValue)}</td>
                  <td className="py-3 px-4 text-right text-blue-400">{avgRoas.toFixed(2)}x</td>
                  <td className="py-3 px-4 text-right">{fmtNum(totalClicks)}</td>
                  <td className="py-3 px-4 text-right">{fmtNum(totalImpressions)}</td>
                  <td className="py-3 px-4 text-right">{ctr.toFixed(2)}%</td>
                  <td className="py-3 px-4 text-right">${avgCpc.toFixed(2)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Monthly breakdown */}
          <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-white">Monthly Breakdown</h2>
              <span className="text-xs text-gray-500">Click to expand campaigns</span>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-500 text-xs uppercase tracking-wider bg-gray-800/50 border-b border-gray-800">
                  <th className="py-3 px-4 text-left">Month</th>
                  <th className="py-3 px-4 text-right">Spend</th>
                  <th className="py-3 px-4 text-right">Conv Value</th>
                  <th className="py-3 px-4 text-right">ROAS</th>
                  <th className="py-3 px-4 text-right">Clicks</th>
                  <th className="py-3 px-4 text-right">CTR</th>
                  <th className="py-3 px-4 text-center">Campaigns</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {data.map((row) => (
                  <>
                    <tr key={row.month} className="text-gray-300 cursor-pointer hover:bg-gray-800/40"
                      onClick={() => setExpandedMonth(expandedMonth === row.month ? null : row.month)}>
                      <td className="py-2.5 px-4 font-medium text-white">{row.month}</td>
                      <td className="py-2.5 px-4 text-right">{fmt(row.totalSpend)}</td>
                      <td className="py-2.5 px-4 text-right text-green-400">{fmt(row.totalConvValue)}</td>
                      <td className="py-2.5 px-4 text-right text-blue-400">
                        {row.totalSpend > 0 ? `${(row.totalConvValue / row.totalSpend).toFixed(2)}x` : "—"}
                      </td>
                      <td className="py-2.5 px-4 text-right">{fmtNum(row.totalClicks)}</td>
                      <td className="py-2.5 px-4 text-right">
                        {row.totalImpressions > 0 ? `${((row.totalClicks / row.totalImpressions) * 100).toFixed(2)}%` : "—"}
                      </td>
                      <td className="py-2.5 px-4 text-center text-xs text-gray-500">
                        {expandedMonth === row.month ? "▲" : "▼"} {row.campaigns.length}
                      </td>
                    </tr>
                    {expandedMonth === row.month && (
                      <tr key={`${row.month}-exp`}>
                        <td colSpan={7} className="bg-gray-800/30 px-4 py-3">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="text-gray-500 uppercase tracking-wider border-b border-gray-700">
                                <th className="pb-2 text-left">Campaign</th>
                                <th className="pb-2 text-right">Spend</th>
                                <th className="pb-2 text-right">Conv Value</th>
                                <th className="pb-2 text-right">ROAS</th>
                                <th className="pb-2 text-right">Clicks</th>
                                <th className="pb-2 text-right">Avg CPC</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-700/50">
                              {row.campaigns.map((c) => (
                                <tr key={c.name} className="text-gray-300">
                                  <td className="py-1.5 text-white">{c.name}</td>
                                  <td className="py-1.5 text-right">{fmt(c.spend)}</td>
                                  <td className="py-1.5 text-right text-green-400">{fmt(c.convValue)}</td>
                                  <td className="py-1.5 text-right text-blue-400">
                                    {c.spend > 0 ? `${(c.convValue / c.spend).toFixed(2)}x` : "—"}
                                  </td>
                                  <td className="py-1.5 text-right">{fmtNum(c.clicks)}</td>
                                  <td className="py-1.5 text-right">
                                    {c.clicks > 0 ? `$${(c.spend / c.clicks).toFixed(2)}` : "—"}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
