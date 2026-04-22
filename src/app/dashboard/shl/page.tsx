"use client";

import { useEffect, useState, useCallback } from "react";
import DateRangeDropdown from "@/components/DateRangeDropdown";
import { RangeKey, getRange } from "@/lib/date-ranges";
import { KPISkeleton, TableSkeleton } from "@/components/Skeleton";
import { exportToCSV } from "@/lib/export-csv";

interface DayData {
  date: string;
  orders: number;
  grossRevenue: number;
  refunds: number;
  netRevenue: number;
  tax: number;        // gross sales tax collected on orders created this day
  refundTax: number;  // sales tax refunded on this day (bucketed by refund date)
}

interface Summary {
  totalOrders: number;
  grossRevenue: number;
  totalRefunds: number;
  netRevenue: number;
  grossTax: number;
  refundTax: number;
  netTax: number;
}

const fmt = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
const fmt2 = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
const fmtN = (n: number) => new Intl.NumberFormat("en-US").format(Math.round(n));
const fmtPct = (n: number) => (n * 100).toFixed(1) + "%";

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
function fmtDate(d: string) {
  const dt = new Date(d + "T12:00:00Z");
  return `${MONTHS[dt.getMonth()]} ${dt.getDate()}`;
}
function fmtMonth(d: string) {
  const dt = new Date(d + "-01T12:00:00Z");
  return `${MONTHS[dt.getMonth()]} ${dt.getFullYear()}`;
}
function fmtDow(d: string) {
  const dt = new Date(d + "T12:00:00Z");
  return ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][dt.getDay()];
}

function groupByMonth(daily: DayData[]) {
  const map: Record<string, DayData & { month: string }> = {};
  for (const d of daily) {
    const m = d.date.substring(0, 7);
    if (!map[m]) map[m] = { date: m, month: m, orders: 0, grossRevenue: 0, refunds: 0, netRevenue: 0, tax: 0, refundTax: 0 };
    map[m].orders += d.orders;
    map[m].grossRevenue += d.grossRevenue;
    map[m].refunds += d.refunds;
    map[m].netRevenue += d.netRevenue;
    map[m].tax += d.tax ?? 0;
    map[m].refundTax += d.refundTax ?? 0;
  }
  return Object.values(map).sort((a, b) => b.month.localeCompare(a.month));
}

function groupByDow(daily: DayData[]) {
  const labels = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  const map: Record<number, { orders: number; revenue: number; days: number }> = {};
  for (let i = 0; i < 7; i++) map[i] = { orders: 0, revenue: 0, days: 0 };
  for (const d of daily) {
    if (d.orders === 0) continue;
    const dow = new Date(d.date + "T12:00:00Z").getDay();
    map[dow].orders += d.orders;
    map[dow].revenue += d.netRevenue;
    map[dow].days += 1;
  }
  return labels.map((label, i) => ({
    label,
    avgRevenue: map[i].days > 0 ? map[i].revenue / map[i].days : 0,
    avgOrders: map[i].days > 0 ? map[i].orders / map[i].days : 0,
    totalRevenue: map[i].revenue,
  }));
}

export default function SHLPage() {
  const [rangeKey, setRangeKey] = useState<RangeKey>("30d");
  const [view, setView] = useState<"daily" | "monthly">("daily");
  const [daily, setDaily] = useState<DayData[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(() => {
    const { start, end } = getRange(rangeKey);
    setLoading(true);
    setError(null);
    fetch(`/api/shopify-shl/orders?start=${start}&end=${end}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) { setError(d.error); return; }
        setDaily(d.daily ?? []);
        setSummary(d.summary ?? null);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [rangeKey]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const months = groupByMonth(daily);
  const dowStats = groupByDow(daily);
  const maxDowRevenue = Math.max(...dowStats.map(d => d.avgRevenue), 1);

  const aov = summary && summary.totalOrders > 0 ? summary.grossRevenue / summary.totalOrders : 0;
  const refundRate = summary && summary.grossRevenue > 0 ? summary.totalRefunds / summary.grossRevenue : 0;
  const activeDays = daily.filter(d => d.orders > 0).length;
  const avgDailyRevenue = activeDays > 0 ? (summary?.netRevenue ?? 0) / activeDays : 0;
  const bestDay = daily.reduce<DayData | null>((best, d) => (!best || d.netRevenue > best.netRevenue) ? d : best, null);

  function handleExport() {
    if (view === "daily") {
      if (!daily.length) return;
      exportToCSV(daily.map(d => ({
        date: d.date,
        day_of_week: fmtDow(d.date),
        orders: d.orders,
        gross_revenue: d.grossRevenue.toFixed(2),
        refunds: d.refunds.toFixed(2),
        net_revenue: d.netRevenue.toFixed(2),
        gross_tax: (d.tax ?? 0).toFixed(2),
        refund_tax: (d.refundTax ?? 0).toFixed(2),
        net_tax: ((d.tax ?? 0) - (d.refundTax ?? 0)).toFixed(2),
        aov: d.orders > 0 ? (d.grossRevenue / d.orders).toFixed(2) : "",
      })), `shl-daily-${rangeKey}.csv`);
    } else {
      const m = groupByMonth(daily);
      if (!m.length) return;
      exportToCSV(m.map(d => ({
        month: d.month,
        orders: d.orders,
        gross_revenue: d.grossRevenue.toFixed(2),
        refunds: d.refunds.toFixed(2),
        net_revenue: d.netRevenue.toFixed(2),
        gross_tax: (d.tax ?? 0).toFixed(2),
        refund_tax: (d.refundTax ?? 0).toFixed(2),
        net_tax: ((d.tax ?? 0) - (d.refundTax ?? 0)).toFixed(2),
        aov: d.orders > 0 ? (d.grossRevenue / d.orders).toFixed(2) : "",
      })), `shl-monthly-${rangeKey}.csv`);
    }
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Smart Home Luxury</h1>
          <p className="text-gray-400 text-sm mt-1">Shopify sales — a11c08-ce.myshopify.com</p>
        </div>
        <DateRangeDropdown value={rangeKey} onChange={setRangeKey} />
      </div>

      {error && <div className="bg-red-900/20 border border-red-700/30 rounded-xl p-4 text-red-400 text-sm">{error}</div>}

      {loading && (
        <div className="space-y-6">
          <KPISkeleton count={4} />
          <KPISkeleton count={4} />
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <TableSkeleton rows={10} cols={6} />
          </div>
        </div>
      )}

      {!loading && !error && summary && (
        <>
          {/* KPI row 1 — Revenue */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-gray-900 border border-purple-800/40 rounded-xl p-5">
              <div className="text-xs text-purple-400 uppercase tracking-wide mb-1">Gross Revenue</div>
              <div className="text-2xl font-bold text-white">{fmt(summary.grossRevenue)}</div>
            </div>
            <div className="bg-gray-900 border border-red-800/30 rounded-xl p-5">
              <div className="text-xs text-red-400 uppercase tracking-wide mb-1">Refunds</div>
              <div className="text-2xl font-bold text-red-400">{summary.totalRefunds > 0 ? `(${fmt(summary.totalRefunds)})` : "—"}</div>
              <div className="text-xs text-gray-500 mt-1">{fmtPct(refundRate)} of gross</div>
            </div>
            <div className="bg-gray-900 border border-purple-800/40 rounded-xl p-5">
              <div className="text-xs text-purple-400 uppercase tracking-wide mb-1">Net Revenue</div>
              <div className="text-2xl font-bold text-purple-400">{fmt(summary.netRevenue)}</div>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Orders</div>
              <div className="text-2xl font-bold text-white">{fmtN(summary.totalOrders)}</div>
            </div>
          </div>

          {/* KPI row 2 — Intelligence */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Avg Order Value</div>
              <div className="text-2xl font-bold text-yellow-400">{fmt2(aov)}</div>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Avg Daily Revenue</div>
              <div className="text-2xl font-bold text-white">{fmt(avgDailyRevenue)}</div>
              <div className="text-xs text-gray-500 mt-1">{activeDays} active days</div>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Best Day</div>
              <div className="text-2xl font-bold text-green-400">{bestDay ? fmt(bestDay.netRevenue) : "—"}</div>
              <div className="text-xs text-gray-500 mt-1">{bestDay ? `${fmtDow(bestDay.date)}, ${fmtDate(bestDay.date)}` : ""}</div>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Avg Orders / Day</div>
              <div className="text-2xl font-bold text-white">
                {activeDays > 0 ? (summary.totalOrders / activeDays).toFixed(1) : "—"}
              </div>
            </div>
          </div>

          {/* Sales Tax row — SHL wholesale tax collected/refunded for sales-tax reporting */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-gray-900 border border-yellow-800/30 rounded-xl p-5">
              <div className="text-xs text-yellow-400 uppercase tracking-wide mb-1">Sales Tax Collected</div>
              <div className="text-2xl font-bold text-yellow-400">{fmt(summary.grossTax ?? 0)}</div>
              <div className="text-xs text-gray-500 mt-1">On orders in range</div>
            </div>
            <div className="bg-gray-900 border border-red-800/30 rounded-xl p-5">
              <div className="text-xs text-red-400 uppercase tracking-wide mb-1">Sales Tax Refunded</div>
              <div className="text-2xl font-bold text-red-400">{(summary.refundTax ?? 0) > 0 ? `(${fmt(summary.refundTax)})` : "—"}</div>
              <div className="text-xs text-gray-500 mt-1">Bucketed by refund date</div>
            </div>
            <div className="bg-gray-900 border border-yellow-800/30 rounded-xl p-5">
              <div className="text-xs text-yellow-400 uppercase tracking-wide mb-1">Net Sales Tax</div>
              <div className="text-2xl font-bold text-yellow-400">{fmt(summary.netTax ?? 0)}</div>
              <div className="text-xs text-gray-500 mt-1">Due on filings (gross − refunded)</div>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Effective Tax Rate</div>
              <div className="text-2xl font-bold text-white">
                {summary.grossRevenue > 0 ? ((summary.grossTax ?? 0) / summary.grossRevenue * 100).toFixed(2) + "%" : "—"}
              </div>
              <div className="text-xs text-gray-500 mt-1">Tax ÷ gross revenue</div>
            </div>
          </div>

          {/* Day of week breakdown */}
          {daily.length > 6 && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <h2 className="text-sm font-semibold text-white mb-4">Avg Revenue by Day of Week</h2>
              <div className="grid grid-cols-7 gap-2">
                {dowStats.map(d => {
                  const pct = maxDowRevenue > 0 ? (d.avgRevenue / maxDowRevenue) * 100 : 0;
                  return (
                    <div key={d.label} className="flex flex-col items-center gap-1.5">
                      <div className="text-xs text-white font-medium">{d.avgRevenue > 0 ? fmt(d.avgRevenue) : "—"}</div>
                      <div className="w-full h-20 bg-gray-800 rounded-lg overflow-hidden flex items-end">
                        <div
                          className="w-full bg-purple-500/70 rounded-lg transition-all"
                          style={{ height: `${pct}%` }}
                        />
                      </div>
                      <div className="text-xs text-gray-400">{d.label}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Table header row */}
          <div className="flex items-center justify-between">
            <div className="flex gap-1">
              {(["daily", "monthly"] as const).map(v => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    view === v ? "bg-gray-700 text-white" : "text-gray-500 hover:text-gray-300 hover:bg-gray-800"
                  }`}
                >
                  {v.charAt(0).toUpperCase() + v.slice(1)}
                </button>
              ))}
            </div>
            <button
              onClick={handleExport}
              className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs rounded-lg transition-colors"
            >Export CSV</button>
          </div>

          {/* Table */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 bg-gray-900 border-b border-gray-800">
                  <tr className="text-gray-500 text-xs uppercase tracking-wider">
                    <th className="py-2.5 px-4 text-left">{view === "monthly" ? "Month" : "Date"}</th>
                    {view === "daily" && <th className="py-2.5 px-4 text-left">Day</th>}
                    <th className="py-2.5 px-4 text-right">Orders</th>
                    <th className="py-2.5 px-4 text-right">AOV</th>
                    <th className="py-2.5 px-4 text-right">Gross Revenue</th>
                    <th className="py-2.5 px-4 text-right">Refunds</th>
                    <th className="py-2.5 px-4 text-right">Net Revenue</th>
                    <th className="py-2.5 px-4 text-right">Sales Tax</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {view === "monthly"
                    ? months.map(m => {
                        const netMonthTax = (m.tax ?? 0) - (m.refundTax ?? 0);
                        return (
                          <tr key={m.month} className="hover:bg-gray-800/30">
                            <td className="py-3 px-4 font-medium text-white">{fmtMonth(m.month)}</td>
                            <td className="py-3 px-4 text-right text-gray-300">{fmtN(m.orders)}</td>
                            <td className="py-3 px-4 text-right text-yellow-400">{m.orders > 0 ? fmt2(m.grossRevenue / m.orders) : "—"}</td>
                            <td className="py-3 px-4 text-right text-gray-300">{fmt(m.grossRevenue)}</td>
                            <td className="py-3 px-4 text-right text-red-400">{m.refunds > 0 ? `(${fmt(m.refunds)})` : "—"}</td>
                            <td className="py-3 px-4 text-right font-semibold text-purple-400">{fmt(m.netRevenue)}</td>
                            <td className="py-3 px-4 text-right text-yellow-400">{netMonthTax !== 0 ? fmt(netMonthTax) : "—"}</td>
                          </tr>
                        );
                      })
                    : daily.map(d => {
                        const netDayTax = (d.tax ?? 0) - (d.refundTax ?? 0);
                        return (
                          <tr key={d.date} className={`hover:bg-gray-800/30 ${d.orders === 0 && netDayTax === 0 ? "opacity-40" : ""}`}>
                            <td className="py-2.5 px-4 text-gray-300">{fmtDate(d.date)}</td>
                            <td className="py-2.5 px-4 text-gray-500 text-xs">{fmtDow(d.date)}</td>
                            <td className="py-2.5 px-4 text-right text-gray-300">{d.orders > 0 ? fmtN(d.orders) : "—"}</td>
                            <td className="py-2.5 px-4 text-right text-yellow-400">{d.orders > 0 ? fmt2(d.grossRevenue / d.orders) : "—"}</td>
                            <td className="py-2.5 px-4 text-right text-gray-300">{d.orders > 0 ? fmt(d.grossRevenue) : "—"}</td>
                            <td className="py-2.5 px-4 text-right text-red-400">{d.refunds > 0 ? `(${fmt(d.refunds)})` : "—"}</td>
                            <td className="py-2.5 px-4 text-right font-semibold text-purple-400">{d.orders > 0 || d.refunds > 0 ? fmt(d.netRevenue) : "—"}</td>
                            <td className="py-2.5 px-4 text-right text-yellow-400">{netDayTax !== 0 ? fmt(netDayTax) : "—"}</td>
                          </tr>
                        );
                      })
                  }
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-gray-700 bg-gray-800/50 font-bold text-sm">
                    <td className="py-3 px-4 text-white" colSpan={view === "daily" ? 2 : 1}>Total</td>
                    <td className="py-3 px-4 text-right text-white">{fmtN(summary.totalOrders)}</td>
                    <td className="py-3 px-4 text-right text-yellow-400">{fmt2(aov)}</td>
                    <td className="py-3 px-4 text-right text-white">{fmt(summary.grossRevenue)}</td>
                    <td className="py-3 px-4 text-right text-red-400">{summary.totalRefunds > 0 ? `(${fmt(summary.totalRefunds)})` : "—"}</td>
                    <td className="py-3 px-4 text-right text-purple-400">{fmt(summary.netRevenue)}</td>
                    <td className="py-3 px-4 text-right text-yellow-400">{fmt(summary.netTax ?? 0)}</td>
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
