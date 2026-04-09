"use client";

import { useEffect, useState } from "react";
import MetricCard from "@/components/MetricCard";
import DateRangeDropdown from "@/components/DateRangeDropdown";
import { RangeKey, getRange } from "@/lib/date-ranges";

interface DailySummary {
  date: string;
  orders: number;
  grossRevenue: number;
  refunds: number;
  netRevenue: number;
  tax: number;
}

interface Summary {
  totalOrders: number;
  grossRevenue: number;
  totalRefunds: number;
  netRevenue: number;
  dateRange: { start: string; end: string };
}

const fmt = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

export default function ShopifyPage() {
  const [rangeKey, setRangeKey] = useState<RangeKey>("30d");
  const [daily, setDaily] = useState<DailySummary[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const { start, end } = getRange(rangeKey);
    setLoading(true);
    setError("");
    fetch(`/api/shopify/orders?start=${start}&end=${end}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) throw new Error(data.error);
        setDaily(data.daily);
        setSummary(data.summary);
        setLoading(false);
      })
      .catch(e => { setError(e.message); setLoading(false); });
  }, [rangeKey]);

  const range = getRange(rangeKey);

  return (
    <div className="p-8">
      <div className="mb-8 flex items-start justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-white">Shopify Live Orders</h1>
            <span className="flex items-center gap-1.5 text-xs text-green-400 bg-green-900/20 border border-green-700/30 px-2.5 py-1 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
              Live
            </span>
          </div>
          <p className="text-gray-400 mt-1">{range.label} — direct from Shopify API</p>
        </div>
        <DateRangeDropdown value={rangeKey} onChange={setRangeKey} />
      </div>

      {error && (
        <div className="bg-red-900/20 border border-red-700/30 rounded-xl p-6 mb-6">
          <h2 className="text-red-400 font-semibold mb-2">Shopify API Error</h2>
          <p className="text-red-300 text-sm">{error}</p>
        </div>
      )}

      {loading && <div className="text-gray-400">Loading...</div>}

      {!loading && !error && summary && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <MetricCard label="Total Orders" value={summary.totalOrders.toString()} subtext={range.label} />
            <MetricCard label="Gross Revenue" value={fmt(summary.grossRevenue)} subtext={range.label} highlight />
            <MetricCard label="Refunds" value={fmt(summary.totalRefunds)} subtext={range.label} trend="down" />
            <MetricCard label="Net Revenue" value={fmt(summary.netRevenue)} subtext="After refunds" trend="up" />
          </div>

          <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-white">Daily Breakdown</h2>
              <span className="text-xs text-gray-500">{daily.length} days</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-gray-500 text-xs uppercase tracking-wider bg-gray-800/50 border-b border-gray-800">
                    <th className="py-3 px-4 text-left">Date</th>
                    <th className="py-3 px-4 text-right">Orders</th>
                    <th className="py-3 px-4 text-right">Gross Revenue</th>
                    <th className="py-3 px-4 text-right text-red-400">Refunds</th>
                    <th className="py-3 px-4 text-right">Net Revenue</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {daily.map(row => (
                    <tr key={row.date} className="text-gray-300 hover:bg-gray-800/40">
                      <td className="py-2.5 px-4 text-gray-400">{row.date}</td>
                      <td className="py-2.5 px-4 text-right">{row.orders}</td>
                      <td className="py-2.5 px-4 text-right">{fmt(row.grossRevenue)}</td>
                      <td className="py-2.5 px-4 text-right text-red-400">
                        {row.refunds > 0 ? `(${fmt(row.refunds)})` : "—"}
                      </td>
                      <td className="py-2.5 px-4 text-right font-semibold text-white">{fmt(row.netRevenue)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-800/50 border-t border-gray-700 font-semibold text-white text-xs">
                    <td className="py-3 px-4">Total</td>
                    <td className="py-3 px-4 text-right">{summary.totalOrders}</td>
                    <td className="py-3 px-4 text-right">{fmt(summary.grossRevenue)}</td>
                    <td className="py-3 px-4 text-right text-red-400">({fmt(summary.totalRefunds)})</td>
                    <td className="py-3 px-4 text-right text-green-400">{fmt(summary.netRevenue)}</td>
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
