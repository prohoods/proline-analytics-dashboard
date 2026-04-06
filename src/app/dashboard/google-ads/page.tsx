"use client";

import { useEffect, useState } from "react";
import MetricCard from "@/components/MetricCard";

interface GoogleMonthRow {
  month: string;
  googleShoppingCost: number;
  cogsAndTariffs: number;
  companyRefunds: number;
  convValue: number;
  sitePlusPhone: number;
  reportedGoogleRoas: number;
  roi: number;
  netRevenue: number;
  margin: number;
}

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}
function fmtPct(n: number) {
  return `${(n * 100).toFixed(1)}%`;
}

const CAMPAIGN_TYPES = ["All Campaigns", "PMAX", "Shopping", "Search", "Display", "Video"];

export default function GoogleAdsPage() {
  const [year, setYear] = useState("2026");
  const [campaignFilter, setCampaignFilter] = useState("All Campaigns");
  const [data, setData] = useState<GoogleMonthRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    setError("");
    fetch(`/api/sheets/google-monthly?year=${year}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) { setError(d.error); } else { setData(d); }
        setLoading(false);
      })
      .catch((e) => { setError(e.message); setLoading(false); });
  }, [year]);

  const totalSpend = data.reduce((s, r) => s + r.googleShoppingCost, 0);
  const totalConvValue = data.reduce((s, r) => s + r.convValue, 0);
  const totalNetRevenue = data.reduce((s, r) => s + r.netRevenue, 0);
  const avgRoas = totalSpend > 0 ? totalConvValue / totalSpend : 0;
  const latest = data[data.length - 1];

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8 flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Google Ads</h1>
          <p className="text-gray-400 mt-1">Customer ID: 329-838-9676 — monthly performance</p>
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

      {/* Campaign type filter */}
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
        {campaignFilter !== "All Campaigns" && (
          <div className="ml-2 flex items-center gap-1.5 bg-yellow-900/20 border border-yellow-700/30 rounded-lg px-3 py-1.5">
            <span className="text-yellow-400 text-xs">Campaign-level data coming with Google Ads API</span>
          </div>
        )}
      </div>

      {loading && <div className="text-gray-400">Loading...</div>}
      {error && (
        <div className="text-red-400 bg-red-900/20 rounded-lg p-4 mb-6">
          {error}
          {error.includes("Unable to parse range") && (
            <p className="mt-2 text-xs text-red-300">
              Make sure your sheet has a tab named exactly: <strong>Google Monthly Performance</strong>
            </p>
          )}
        </div>
      )}

      {!loading && !error && (
        <>
          {/* KPI cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <MetricCard label={`${year} Total Spend`} value={fmt(totalSpend)} subtext="Google Shopping" highlight />
            <MetricCard label="Reported ROAS" value={`${avgRoas.toFixed(2)}x`} subtext="Conv value / spend" trend="up" trendValue="Google reported" />
            <MetricCard label="Total Conv Value" value={fmt(totalConvValue)} subtext={`${data.length} months`} />
            <MetricCard label="Net Revenue" value={fmt(totalNetRevenue)} subtext="After COGS + refunds" />
          </div>

          {/* Monthly performance table */}
          <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden mb-6">
            <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-white">Monthly Performance — {year}</h2>
              <span className="text-xs text-gray-500">Data from Google Monthly Performance sheet</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-gray-500 text-xs uppercase tracking-wider bg-gray-800/50 border-b border-gray-800">
                    <th className="py-3 px-4 text-left">Month</th>
                    <th className="py-3 px-4 text-right">Ad Spend</th>
                    <th className="py-3 px-4 text-right">Conv Value</th>
                    <th className="py-3 px-4 text-right">Reported ROAS</th>
                    <th className="py-3 px-4 text-right">Site + Phone</th>
                    <th className="py-3 px-4 text-right">COGS + Tariffs</th>
                    <th className="py-3 px-4 text-right">Refunds</th>
                    <th className="py-3 px-4 text-right">Net Revenue</th>
                    <th className="py-3 px-4 text-right">Margin</th>
                    <th className="py-3 px-4 text-right">ROI</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {data.map((row) => (
                    <tr key={row.month} className="text-gray-300 hover:bg-gray-800/40">
                      <td className="py-2.5 px-4 font-medium text-white">{row.month}</td>
                      <td className="py-2.5 px-4 text-right">{fmt(row.googleShoppingCost)}</td>
                      <td className="py-2.5 px-4 text-right text-green-400">{fmt(row.convValue)}</td>
                      <td className="py-2.5 px-4 text-right text-blue-400">
                        {row.reportedGoogleRoas > 0 ? `${row.reportedGoogleRoas.toFixed(2)}x` : "—"}
                      </td>
                      <td className="py-2.5 px-4 text-right">{fmt(row.sitePlusPhone)}</td>
                      <td className="py-2.5 px-4 text-right text-red-400">{fmt(row.cogsAndTariffs)}</td>
                      <td className="py-2.5 px-4 text-right text-red-400">{fmt(row.companyRefunds)}</td>
                      <td className="py-2.5 px-4 text-right font-medium text-white">{fmt(row.netRevenue)}</td>
                      <td className="py-2.5 px-4 text-right">
                        {row.margin > 0 ? (
                          <span className={row.margin > 0.15 ? "text-green-400" : "text-yellow-400"}>
                            {fmtPct(row.margin)}
                          </span>
                        ) : "—"}
                      </td>
                      <td className="py-2.5 px-4 text-right">
                        {row.roi > 0 ? <span className="text-emerald-400">{row.roi.toFixed(2)}x</span> : "—"}
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
                    <td className="py-3 px-4 text-right">{fmt(data.reduce((s, r) => s + r.sitePlusPhone, 0))}</td>
                    <td className="py-3 px-4 text-right text-red-400">{fmt(data.reduce((s, r) => s + r.cogsAndTariffs, 0))}</td>
                    <td className="py-3 px-4 text-right text-red-400">{fmt(data.reduce((s, r) => s + r.companyRefunds, 0))}</td>
                    <td className="py-3 px-4 text-right">{fmt(totalNetRevenue)}</td>
                    <td className="py-3 px-4" />
                    <td className="py-3 px-4" />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Google Ads API upgrade notice */}
          <div className="bg-blue-900/10 border border-blue-700/30 rounded-xl p-5">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-blue-600/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                <svg className="w-4 h-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <div>
                <div className="text-sm font-semibold text-white mb-1">Google Ads API — Coming Next</div>
                <p className="text-xs text-gray-400">
                  Once connected, this page will show live campaign-level breakdowns: PMAX vs Shopping vs Search,
                  daily spend, impression share, quality scores, and real-time ROAS — no manual sheet updates needed.
                </p>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
