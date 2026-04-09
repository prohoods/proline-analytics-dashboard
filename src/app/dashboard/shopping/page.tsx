"use client";

import { useEffect, useState } from "react";
import MetricCard from "@/components/MetricCard";
import DateRangeDropdown from "@/components/DateRangeDropdown";
import { RangeKey, getRange } from "@/lib/date-ranges";

interface Campaign { name: string; type: string; spend: number; convValue: number; clicks: number; impressions: number; }
interface MonthData { month: string; totalSpend: number; totalConvValue: number; totalClicks: number; totalImpressions: number; roas: number; campaigns: Campaign[]; }

const fmt = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
const fmtNum = (n: number) => new Intl.NumberFormat("en-US").format(n);

export default function ShoppingPage() {
  const [rangeKey, setRangeKey] = useState<RangeKey>("ytd");
  const [data, setData] = useState<MonthData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const range = getRange(rangeKey);
    setLoading(true); setError("");
    fetch(`/api/google-ads/campaigns?start=${range.start}&end=${range.end}`, { cache: "no-store" })
      .then(r => r.json())
      .then(d => {
        if (d.error) throw new Error(d.error);
        const filtered = d.map((m: MonthData) => ({
          ...m,
          campaigns: m.campaigns.filter((c: Campaign) => c.type === "Shopping"),
          totalSpend: m.campaigns.filter((c: Campaign) => c.type === "Shopping").reduce((s: number, c: Campaign) => s + c.spend, 0),
          totalConvValue: m.campaigns.filter((c: Campaign) => c.type === "Shopping").reduce((s: number, c: Campaign) => s + c.convValue, 0),
          totalClicks: m.campaigns.filter((c: Campaign) => c.type === "Shopping").reduce((s: number, c: Campaign) => s + c.clicks, 0),
        })).filter((m: MonthData) => m.totalSpend > 0);
        setData(filtered); setLoading(false);
      })
      .catch(e => { setError(e.message); setLoading(false); });
  }, [rangeKey]);

  const range = getRange(rangeKey);
  const totalSpend = data.reduce((s, m) => s + m.totalSpend, 0);
  const totalConvValue = data.reduce((s, m) => s + m.totalConvValue, 0);
  const totalClicks = data.reduce((s, m) => s + m.totalClicks, 0);
  const avgRoas = totalSpend > 0 ? totalConvValue / totalSpend : 0;

  return (
    <div className="p-8">
      <div className="mb-6 flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Shopping Campaigns</h1>
          <p className="text-gray-400 mt-1">Google Shopping — live Google Ads API</p>
          <div className="mt-2 inline-flex items-center gap-2 bg-green-900/20 border border-green-700/30 rounded-lg px-3 py-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
            <span className="text-green-400 text-xs font-medium">Live — Google Ads API</span>
          </div>
        </div>
        <DateRangeDropdown value={rangeKey} onChange={setRangeKey} />
      </div>

      {loading && <div className="text-gray-400">Loading...</div>}
      {error && <div className="text-red-400 bg-red-900/20 rounded-lg p-4 mb-6 text-sm">{error}</div>}

      {!loading && !error && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <MetricCard label="Total Spend" value={fmt(totalSpend)} subtext={range.label} highlight />
            <MetricCard label="ROAS" value={`${avgRoas.toFixed(2)}x`} subtext="Conv value / spend" />
            <MetricCard label="Conv Value" value={fmt(totalConvValue)} subtext={`${data.length} months`} />
            <MetricCard label="Total Clicks" value={fmtNum(totalClicks)} subtext={range.label} />
          </div>

          <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-800">
              <h2 className="text-sm font-semibold text-white">Monthly Breakdown — {range.label}</h2>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-500 text-xs uppercase tracking-wider bg-gray-800/50 border-b border-gray-800">
                  <th className="py-3 px-4 text-left">Month</th>
                  <th className="py-3 px-4 text-right">Spend</th>
                  <th className="py-3 px-4 text-right">Conv Value</th>
                  <th className="py-3 px-4 text-right">ROAS</th>
                  <th className="py-3 px-4 text-right">Clicks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {data.length === 0 ? (
                  <tr><td colSpan={5} className="py-8 text-center text-gray-500">No Shopping campaigns found for {range.label}</td></tr>
                ) : data.map(row => (
                  <tr key={row.month} className="text-gray-300 hover:bg-gray-800/40">
                    <td className="py-2.5 px-4 font-medium text-white">{row.month}</td>
                    <td className="py-2.5 px-4 text-right">{fmt(row.totalSpend)}</td>
                    <td className="py-2.5 px-4 text-right text-green-400">{fmt(row.totalConvValue)}</td>
                    <td className="py-2.5 px-4 text-right text-blue-400">{row.totalSpend > 0 ? `${(row.totalConvValue / row.totalSpend).toFixed(2)}x` : "—"}</td>
                    <td className="py-2.5 px-4 text-right">{fmtNum(row.totalClicks)}</td>
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
