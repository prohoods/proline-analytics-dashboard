"use client";

import { useEffect, useState } from "react";
import MetricCard from "@/components/MetricCard";

interface MonthlyRow {
  month: string;
  prhSales: number;
  ppSales: number;
  phoneSales: number;
  shlSales: number;
  marketplaces: number;
  refunds: number;
  taxes: number;
  netSales: number;
}

interface DailyRow {
  date: string;
  prhSales: number;
  ppSales: number;
  phoneSales: number;
  shlSales: number;
  marketplaces: number;
  refunds: number;
  salesTax: number;
  netSales: number;
}

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

export default function SalesPage() {
  const [monthly, setMonthly] = useState<MonthlyRow[]>([]);
  const [daily, setDaily] = useState<DailyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([
      fetch("/api/sheets/sales-monthly").then((r) => r.json()),
      fetch("/api/sheets/sales-daily").then((r) => r.json()),
    ])
      .then(([monthlyData, dailyData]) => {
        if (monthlyData.error) throw new Error(monthlyData.error);
        setMonthly(monthlyData);
        setDaily(dailyData);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const ytdNet = monthly.reduce((sum, r) => sum + r.netSales, 0);
  const ytdRefunds = monthly.reduce((sum, r) => sum + r.refunds, 0);
  const latestMonth = monthly[monthly.length - 1];

  if (loading) return <div className="p-8 text-gray-400">Loading live data...</div>;
  if (error) return <div className="p-8 text-red-400">Error: {error} — check SALES_REPORT_SHEET_ID in Vercel and sheet is shared.</div>;

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Sales</h1>
        <p className="text-gray-400 mt-1">Daily & monthly by channel — live from Google Sheets</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <MetricCard label="YTD Net Sales" value={fmt(ytdNet)} subtext="2026" highlight />
        <MetricCard label="YTD Refunds" value={fmt(Math.abs(ytdRefunds))} subtext="2026" trend="down" />
        {latestMonth && (
          <>
            <MetricCard label={`${latestMonth.month} Net Sales`} value={fmt(latestMonth.netSales)} subtext="Latest month" />
            <MetricCard label={`${latestMonth.month} Refunds`} value={fmt(Math.abs(latestMonth.refunds))} subtext="Latest month" />
          </>
        )}
      </div>

      {/* Monthly table */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 mb-6">
        <h2 className="text-base font-semibold text-white mb-4">Monthly Sales by Channel</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-500 text-xs uppercase tracking-wider border-b border-gray-800">
                <th className="pb-3 text-left">Month</th>
                <th className="pb-3 text-right">PRH</th>
                <th className="pb-3 text-right">Pro Sales</th>
                <th className="pb-3 text-right">Phone</th>
                <th className="pb-3 text-right">SHL</th>
                <th className="pb-3 text-right">Marketplaces</th>
                <th className="pb-3 text-right text-red-400">Refunds</th>
                <th className="pb-3 text-right font-semibold text-gray-300">Net Sales</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {monthly.map((row) => (
                <tr key={row.month} className="text-gray-300 hover:bg-gray-800/50">
                  <td className="py-2.5 text-gray-400">{row.month}</td>
                  <td className="py-2.5 text-right">{fmt(row.prhSales)}</td>
                  <td className="py-2.5 text-right">{fmt(row.ppSales)}</td>
                  <td className="py-2.5 text-right">{fmt(row.phoneSales)}</td>
                  <td className="py-2.5 text-right">{fmt(row.shlSales)}</td>
                  <td className="py-2.5 text-right">{fmt(row.marketplaces)}</td>
                  <td className="py-2.5 text-right text-red-400">{fmt(row.refunds)}</td>
                  <td className="py-2.5 text-right font-semibold text-white">{fmt(row.netSales)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-gray-700 bg-gray-800/50 font-semibold text-white text-xs">
                <td className="py-3 text-gray-400">YTD Total</td>
                <td className="py-3 text-right">{fmt(monthly.reduce((s, r) => s + r.prhSales, 0))}</td>
                <td className="py-3 text-right">{fmt(monthly.reduce((s, r) => s + r.ppSales, 0))}</td>
                <td className="py-3 text-right">{fmt(monthly.reduce((s, r) => s + r.phoneSales, 0))}</td>
                <td className="py-3 text-right">{fmt(monthly.reduce((s, r) => s + r.shlSales, 0))}</td>
                <td className="py-3 text-right">{fmt(monthly.reduce((s, r) => s + r.marketplaces, 0))}</td>
                <td className="py-3 text-right text-red-400">{fmt(monthly.reduce((s, r) => s + r.refunds, 0))}</td>
                <td className="py-3 text-right text-green-400">{fmt(ytdNet)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Daily table */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
        <h2 className="text-base font-semibold text-white mb-1">Daily Sales Log</h2>
        <p className="text-xs text-gray-500 mb-4">Most recent 60 days</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-500 text-xs uppercase tracking-wider border-b border-gray-800">
                <th className="pb-3 text-left">Date</th>
                <th className="pb-3 text-right">PRH</th>
                <th className="pb-3 text-right">Pro</th>
                <th className="pb-3 text-right">Phone</th>
                <th className="pb-3 text-right">SHL</th>
                <th className="pb-3 text-right">Mktplc</th>
                <th className="pb-3 text-right text-red-400">Refunds</th>
                <th className="pb-3 text-right font-semibold text-gray-300">Net Sales</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {daily.slice(0, 60).map((row) => (
                <tr key={row.date} className="text-gray-300 hover:bg-gray-800/50">
                  <td className="py-2 text-gray-400">{row.date}</td>
                  <td className="py-2 text-right">{fmt(row.prhSales)}</td>
                  <td className="py-2 text-right">{fmt(row.ppSales)}</td>
                  <td className="py-2 text-right">{fmt(row.phoneSales)}</td>
                  <td className="py-2 text-right">{fmt(row.shlSales)}</td>
                  <td className="py-2 text-right">{fmt(row.marketplaces)}</td>
                  <td className="py-2 text-right text-red-400">{row.refunds < 0 ? fmt(row.refunds) : "—"}</td>
                  <td className="py-2 text-right font-semibold text-white">{fmt(row.netSales)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
