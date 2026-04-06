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

const CAMPAIGN_TYPES = ["All", "PMAX", "Shopping", "Search", "Display", "Video", "Other"];

const TYPE_COLORS: Record<string, string> = {
  PMAX: "bg-blue-500",
  Shopping: "bg-green-500",
  Search: "bg-purple-500",
  Display: "bg-yellow-500",
  Video: "bg-red-500",
  Other: "bg-gray-500",
};

const TYPE_BADGES: Record<string, string> = {
  PMAX: "bg-blue-900/40 text-blue-400",
  Shopping: "bg-green-900/40 text-green-400",
  Search: "bg-purple-900/40 text-purple-400",
  Display: "bg-yellow-900/40 text-yellow-400",
  Video: "bg-red-900/40 text-red-400",
  Other: "bg-gray-800 text-gray-400",
};

export default function GoogleAdsPage() {
  const [year, setYear] = useState("2026");
  const [campaignFilter, setCampaignFilter] = useState("All");
  const [expandedMonth, setExpandedMonth] = useState<string | null>(null);
  const [data, setData] = useState<MonthData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [usingSheet, setUsingSheet] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError("");
    // Try live Google Ads API first
    fetch(`/api/google-ads/campaigns?year=${year}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (d.error && d.error.includes("Missing env vars")) {
          // Fall back to Google Sheets data
          setUsingSheet(true);
          return fetch(`/api/sheets/google-monthly?year=${year}`).then(r => r.json());
        }
        if (d.error) throw new Error(d.error);
        setUsingSheet(false);
        setData(d);
        setLoading(false);
        return null;
      })
      .then((sheetData) => {
        if (!sheetData) return;
        if (sheetData.error) throw new Error(sheetData.error);
        // Shape sheet data to match MonthData structure
        const shaped: MonthData[] = sheetData.map((row: {
          month: string;
          googleShoppingCost: number;
          convValue: number;
          sitePlusPhone: number;
          reportedGoogleRoas: number;
        }) => ({
          month: row.month,
          totalSpend: row.googleShoppingCost,
          totalConvValue: row.convValue,
          totalClicks: 0,
          totalImpressions: 0,
          roas: row.reportedGoogleRoas || (row.googleShoppingCost > 0 ? row.convValue / row.googleShoppingCost : 0),
          campaigns: [],
        }));
        setData(shaped);
        setLoading(false);
      })
      .catch((e) => { setError(e.message); setLoading(false); });
  }, [year]);

  // Filter campaigns by type
  const filteredData = data.map((month) => ({
    ...month,
    campaigns: campaignFilter === "All"
      ? month.campaigns
      : month.campaigns.filter((c) => c.type === campaignFilter),
    totalSpend: campaignFilter === "All"
      ? month.totalSpend
      : month.campaigns.filter((c) => c.type === campaignFilter).reduce((s, c) => s + c.spend, 0),
    totalConvValue: campaignFilter === "All"
      ? month.totalConvValue
      : month.campaigns.filter((c) => c.type === campaignFilter).reduce((s, c) => s + c.convValue, 0),
  }));

  const totalSpend = filteredData.reduce((s, m) => s + m.totalSpend, 0);
  const totalConvValue = filteredData.reduce((s, m) => s + m.totalConvValue, 0);
  const avgRoas = totalSpend > 0 ? totalConvValue / totalSpend : 0;
  const totalClicks = data.reduce((s, m) => s + m.totalClicks, 0);

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Google Ads</h1>
          <p className="text-gray-400 mt-1">Customer ID: 329-838-9676</p>
          {usingSheet ? (
            <div className="mt-2 inline-flex items-center gap-2 bg-yellow-900/20 border border-yellow-700/30 rounded-lg px-3 py-1.5">
              <span className="text-yellow-400 text-xs font-medium">Using Google Sheets data — add API credentials for live campaign breakdown</span>
            </div>
          ) : !loading && !error && (
            <div className="mt-2 inline-flex items-center gap-2 bg-green-900/20 border border-green-700/30 rounded-lg px-3 py-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
              <span className="text-green-400 text-xs font-medium">Live — Google Ads API</span>
            </div>
          )}
        </div>
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

      {/* Campaign type filter — only shown when using live API */}
      {!usingSheet && (
        <div className="flex gap-2 mb-6 flex-wrap">
          {CAMPAIGN_TYPES.map((type) => (
            <button
              key={type}
              onClick={() => setCampaignFilter(type)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                campaignFilter === type
                  ? "bg-blue-600/20 text-blue-400 border border-blue-600/30"
                  : "text-gray-400 hover:text-gray-100 hover:bg-gray-800"
              }`}
            >
              {type}
            </button>
          ))}
        </div>
      )}

      {loading && <div className="text-gray-400">Loading...</div>}
      {error && (
        <div className="text-red-400 bg-red-900/20 rounded-lg p-4 mb-6 text-sm">{error}</div>
      )}

      {!loading && !error && (
        <>
          {/* KPI cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <MetricCard label={`${year} Total Spend`} value={fmt(totalSpend)} subtext={campaignFilter === "All" ? "All campaigns" : campaignFilter} highlight />
            <MetricCard label="ROAS" value={`${avgRoas.toFixed(2)}x`} subtext="Conv value / spend" trend="up" trendValue="Google reported" />
            <MetricCard label="Conv Value" value={fmt(totalConvValue)} subtext={`${data.length} months`} />
            {totalClicks > 0
              ? <MetricCard label="Total Clicks" value={fmtNum(totalClicks)} subtext={year} />
              : <MetricCard label="Avg Monthly Spend" value={fmt(data.length > 0 ? totalSpend / data.length : 0)} subtext="Per month" />
            }
          </div>

          {/* Monthly table */}
          <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-white">Monthly Performance — {year}</h2>
              {!usingSheet && <span className="text-xs text-gray-500">Click a row to see campaign breakdown</span>}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-gray-500 text-xs uppercase tracking-wider bg-gray-800/50 border-b border-gray-800">
                    <th className="py-3 px-4 text-left">Month</th>
                    <th className="py-3 px-4 text-right">Ad Spend</th>
                    <th className="py-3 px-4 text-right">Conv Value</th>
                    <th className="py-3 px-4 text-right">ROAS</th>
                    {totalClicks > 0 && <>
                      <th className="py-3 px-4 text-right">Clicks</th>
                      <th className="py-3 px-4 text-right">Impressions</th>
                    </>}
                    {!usingSheet && <th className="py-3 px-4 text-center">Campaigns</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {filteredData.map((row) => (
                    <>
                      <tr
                        key={row.month}
                        className={`text-gray-300 transition-colors ${!usingSheet ? "cursor-pointer hover:bg-gray-800/40" : ""}`}
                        onClick={() => !usingSheet && setExpandedMonth(expandedMonth === row.month ? null : row.month)}
                      >
                        <td className="py-2.5 px-4 font-medium text-white">{row.month}</td>
                        <td className="py-2.5 px-4 text-right">{fmt(row.totalSpend)}</td>
                        <td className="py-2.5 px-4 text-right text-green-400">{fmt(row.totalConvValue)}</td>
                        <td className="py-2.5 px-4 text-right text-blue-400">
                          {row.roas > 0 ? `${row.roas.toFixed(2)}x` : "—"}
                        </td>
                        {totalClicks > 0 && <>
                          <td className="py-2.5 px-4 text-right">{fmtNum(row.totalClicks)}</td>
                          <td className="py-2.5 px-4 text-right">{fmtNum(row.totalImpressions)}</td>
                        </>}
                        {!usingSheet && (
                          <td className="py-2.5 px-4 text-center">
                            <span className="text-xs text-gray-500">
                              {expandedMonth === row.month ? "▲" : "▼"} {row.campaigns.length}
                            </span>
                          </td>
                        )}
                      </tr>

                      {/* Campaign breakdown — expanded row */}
                      {expandedMonth === row.month && row.campaigns.length > 0 && (
                        <tr key={`${row.month}-expanded`}>
                          <td colSpan={7} className="bg-gray-800/30 px-4 py-3">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="text-gray-500 uppercase tracking-wider border-b border-gray-700">
                                  <th className="pb-2 text-left">Campaign</th>
                                  <th className="pb-2 text-left">Type</th>
                                  <th className="pb-2 text-right">Spend</th>
                                  <th className="pb-2 text-right">Conv Value</th>
                                  <th className="pb-2 text-right">ROAS</th>
                                  <th className="pb-2 text-right">Clicks</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-700/50">
                                {row.campaigns.map((c) => (
                                  <tr key={c.name} className="text-gray-300">
                                    <td className="py-1.5 text-white">{c.name}</td>
                                    <td className="py-1.5">
                                      <span className={`px-2 py-0.5 rounded-full text-xs ${TYPE_BADGES[c.type] ?? TYPE_BADGES.Other}`}>
                                        {c.type}
                                      </span>
                                    </td>
                                    <td className="py-1.5 text-right">{fmt(c.spend)}</td>
                                    <td className="py-1.5 text-right text-green-400">{fmt(c.convValue)}</td>
                                    <td className="py-1.5 text-right text-blue-400">
                                      {c.spend > 0 ? `${(c.convValue / c.spend).toFixed(2)}x` : "—"}
                                    </td>
                                    <td className="py-1.5 text-right">{fmtNum(c.clicks)}</td>
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
                <tfoot>
                  <tr className="border-t-2 border-gray-700 bg-gray-800/50 font-semibold text-white">
                    <td className="py-3 px-4">Total</td>
                    <td className="py-3 px-4 text-right">{fmt(totalSpend)}</td>
                    <td className="py-3 px-4 text-right text-green-400">{fmt(totalConvValue)}</td>
                    <td className="py-3 px-4 text-right text-blue-400">{avgRoas.toFixed(2)}x</td>
                    {totalClicks > 0 && <>
                      <td className="py-3 px-4 text-right">{fmtNum(totalClicks)}</td>
                      <td className="py-3 px-4 text-right">{fmtNum(data.reduce((s, m) => s + m.totalImpressions, 0))}</td>
                    </>}
                    {!usingSheet && <td />}
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Campaign type breakdown bar chart — live API only */}
          {!usingSheet && data.length > 0 && data[0].campaigns.length > 0 && (
            <div className="mt-6 bg-gray-900 rounded-xl border border-gray-800 p-6">
              <h2 className="text-sm font-semibold text-white mb-4">Spend by Campaign Type — {data[0].month}</h2>
              {(() => {
                const latest = data[0];
                const byType: Record<string, number> = {};
                for (const c of latest.campaigns) {
                  byType[c.type] = (byType[c.type] ?? 0) + c.spend;
                }
                const sorted = Object.entries(byType).sort((a, b) => b[1] - a[1]);
                const maxSpend = sorted[0]?.[1] ?? 1;
                return (
                  <div className="space-y-3">
                    {sorted.map(([type, spend]) => (
                      <div key={type} className="flex items-center gap-3">
                        <div className="w-24 text-xs text-gray-400">{type}</div>
                        <div className="flex-1 bg-gray-800 rounded-full h-2">
                          <div
                            className={`${TYPE_COLORS[type] ?? "bg-gray-500"} rounded-full h-2`}
                            style={{ width: `${(spend / maxSpend) * 100}%` }}
                          />
                        </div>
                        <div className="w-20 text-right text-xs text-white">{fmt(spend)}</div>
                        <div className="w-12 text-right text-xs text-gray-500">
                          {latest.totalSpend > 0 ? `${((spend / latest.totalSpend) * 100).toFixed(1)}%` : "—"}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
          )}
        </>
      )}
    </div>
  );
}
