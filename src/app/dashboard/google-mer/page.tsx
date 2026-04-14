"use client";

import { useEffect, useState } from "react";
import DateRangeDropdown from "@/components/DateRangeDropdown";
import { RangeKey, getRange } from "@/lib/date-ranges";

const PROFIT_MARGIN = 0.40;

const fmtC = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
const roasColor = (r: number) => r >= 5 ? "text-green-400" : r >= 3 ? "text-yellow-400" : r > 0 ? "text-red-400" : "text-gray-500";
const merColor = (m: number) => m >= 3 ? "text-green-400" : m >= 2 ? "text-yellow-400" : m > 0 ? "text-red-400" : "text-gray-500";

interface GoogleMonth {
  month: string;
  totalSpend: number;
  totalConvValue: number;
  totalClicks: number;
  totalImpressions: number;
  roas: number;
}

interface MonthRow {
  month: string;
  spend: number;
  revenue: number;  // Google attributed conv value
  roas: number;
  mer: number;      // revenue / spend
  contributionMargin: number;  // revenue * margin - spend
  breakeven: number; // spend / margin
}

export default function GoogleMerPage() {
  const [rangeKey, setRangeKey] = useState<RangeKey>("ytd");
  const [months, setMonths] = useState<MonthRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const range = getRange(rangeKey);
    setLoading(true);
    fetch(`/api/google-ads/campaigns?start=${range.start}&end=${range.end}`)
      .then(r => r.json())
      .then((data: unknown) => {
        const d = data as { error?: string } & GoogleMonth[];
        if (d.error) throw new Error(d.error);
        // Filter to months within range
        const rows: MonthRow[] = d
          .filter(m => m.month >= range.startYM && m.month <= range.endYM)
          .map(m => ({
            month: m.month,
            spend: m.totalSpend,
            revenue: m.totalConvValue,
            roas: m.totalSpend > 0 ? m.totalConvValue / m.totalSpend : 0,
            mer: m.totalSpend > 0 ? m.totalConvValue / m.totalSpend : 0,
            contributionMargin: (m.totalConvValue * PROFIT_MARGIN) - m.totalSpend,
            breakeven: m.totalSpend > 0 ? m.totalSpend / PROFIT_MARGIN : 0,
          }));
        setMonths(rows);
        setLoading(false);
      })
      .catch(e => { setError(e.message); setLoading(false); });
  }, [rangeKey]);

  // Totals
  const totalSpend = months.reduce((s, m) => s + m.spend, 0);
  const totalRevenue = months.reduce((s, m) => s + m.revenue, 0);
  const totalMER = totalSpend > 0 ? totalRevenue / totalSpend : 0;
  const totalCM = (totalRevenue * PROFIT_MARGIN) - totalSpend;
  const totalBreakeven = totalSpend > 0 ? totalSpend / PROFIT_MARGIN : 0;

  return (
    <div className="p-8">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Google Ads — MER & Profitability</h1>
          <p className="text-gray-400 mt-1">Marketing Efficiency Ratio, Contribution Margin, and Breakeven by month</p>
          <div className="mt-2 inline-flex items-center gap-2 bg-gray-800 rounded-lg px-3 py-1.5">
            <span className="text-gray-400 text-xs">Profit margin assumption:</span>
            <span className="text-white text-xs font-semibold">{(PROFIT_MARGIN * 100).toFixed(0)}%</span>
            <span className="text-gray-500 text-xs">(after COGS & fulfillment)</span>
          </div>
        </div>
        <DateRangeDropdown value={rangeKey} onChange={setRangeKey} />
      </div>

      {loading && <div className="text-gray-400">Loading...</div>}
      {error && <div className="text-red-400 bg-red-900/20 rounded-lg p-4 mb-6 text-sm">{error}</div>}

      {!loading && !error && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Total Ad Spend</div>
              <div className="text-xl font-bold text-white">{fmtC(totalSpend)}</div>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Attributed Revenue</div>
              <div className="text-xl font-bold text-white">{fmtC(totalRevenue)}</div>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">ROAS / MER</div>
              <div className={`text-xl font-bold ${merColor(totalMER)}`}>{totalMER > 0 ? `${totalMER.toFixed(2)}x` : "—"}</div>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Contribution Margin</div>
              <div className={`text-xl font-bold ${totalCM >= 0 ? "text-green-400" : "text-red-400"}`}>{fmtC(totalCM)}</div>
              <div className="text-xs text-gray-500 mt-1">Rev × 40% − Spend</div>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Breakeven Revenue</div>
              <div className="text-xl font-bold text-white">{fmtC(totalBreakeven)}</div>
              <div className="text-xs text-gray-500 mt-1">Spend ÷ 40%</div>
            </div>
          </div>

          {/* Formula explanation */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-6">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">How it&apos;s calculated</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              <div>
                <span className="text-white font-medium">MER</span>
                <span className="text-gray-400"> = Attributed Revenue ÷ Ad Spend</span>
                <p className="text-xs text-gray-600 mt-1">How much revenue each ad dollar drives</p>
              </div>
              <div>
                <span className="text-white font-medium">Contribution Margin</span>
                <span className="text-gray-400"> = (Revenue × 40%) − Ad Spend</span>
                <p className="text-xs text-gray-600 mt-1">Profit after COGS, fulfillment & ads</p>
              </div>
              <div>
                <span className="text-white font-medium">Breakeven</span>
                <span className="text-gray-400"> = Ad Spend ÷ 40%</span>
                <p className="text-xs text-gray-600 mt-1">Revenue needed to cover ad spend at 40% margin</p>
              </div>
            </div>
          </div>

          {/* Monthly table */}
          <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-800">
              <h2 className="text-sm font-semibold text-white">Monthly Breakdown — {getRange(rangeKey).label}</h2>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-500 text-xs uppercase tracking-wider bg-gray-800/50 border-b border-gray-800">
                  <th className="py-3 px-4 text-left">Month</th>
                  <th className="py-3 px-4 text-right">Ad Spend</th>
                  <th className="py-3 px-4 text-right">Attr. Revenue</th>
                  <th className="py-3 px-4 text-right">ROAS / MER</th>
                  <th className="py-3 px-4 text-right">Breakeven Rev.</th>
                  <th className="py-3 px-4 text-right">vs Breakeven</th>
                  <th className="py-3 px-4 text-right">Contribution Margin</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {months.length === 0 ? (
                  <tr><td colSpan={7} className="py-8 text-center text-gray-500">No data for this period</td></tr>
                ) : months.map((m) => {
                  const vsBreakeven = m.revenue - m.breakeven;
                  return (
                    <tr key={m.month} className="text-gray-300 hover:bg-gray-800/40">
                      <td className="py-3 px-4 font-medium text-white">{m.month}</td>
                      <td className="py-3 px-4 text-right">{fmtC(m.spend)}</td>
                      <td className="py-3 px-4 text-right text-blue-300">{fmtC(m.revenue)}</td>
                      <td className={`py-3 px-4 text-right font-semibold ${roasColor(m.roas)}`}>
                        {m.roas > 0 ? `${m.roas.toFixed(2)}x` : "—"}
                      </td>
                      <td className="py-3 px-4 text-right text-gray-400">{fmtC(m.breakeven)}</td>
                      <td className={`py-3 px-4 text-right font-medium ${vsBreakeven >= 0 ? "text-green-400" : "text-red-400"}`}>
                        {m.breakeven > 0 ? (vsBreakeven >= 0 ? "+" : "") + fmtC(vsBreakeven) : "—"}
                      </td>
                      <td className={`py-3 px-4 text-right font-semibold ${m.contributionMargin >= 0 ? "text-green-400" : "text-red-400"}`}>
                        {m.spend > 0 ? fmtC(m.contributionMargin) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {months.length > 0 && (
                <tfoot>
                  <tr className="bg-gray-800/50 border-t border-gray-700 text-xs font-semibold text-gray-300">
                    <td className="py-3 px-4 text-gray-400">Total</td>
                    <td className="py-3 px-4 text-right">{fmtC(totalSpend)}</td>
                    <td className="py-3 px-4 text-right text-blue-300">{fmtC(totalRevenue)}</td>
                    <td className={`py-3 px-4 text-right font-bold ${roasColor(totalMER)}`}>{totalMER > 0 ? `${totalMER.toFixed(2)}x` : "—"}</td>
                    <td className="py-3 px-4 text-right text-gray-400">{fmtC(totalBreakeven)}</td>
                    <td className={`py-3 px-4 text-right font-bold ${(totalRevenue - totalBreakeven) >= 0 ? "text-green-400" : "text-red-400"}`}>
                      {totalBreakeven > 0 ? ((totalRevenue - totalBreakeven) >= 0 ? "+" : "") + fmtC(totalRevenue - totalBreakeven) : "—"}
                    </td>
                    <td className={`py-3 px-4 text-right font-bold ${totalCM >= 0 ? "text-green-400" : "text-red-400"}`}>{fmtC(totalCM)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </>
      )}
    </div>
  );
}
