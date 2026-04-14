"use client";

import { useEffect, useState, useMemo } from "react";
import DateRangeDropdown from "@/components/DateRangeDropdown";
import { RangeKey, getRange } from "@/lib/date-ranges";

interface SalesBucket {
  date: string;
  weekStart?: string;
  prh: number;
  prolinePro: number;
  phone: number;
  other: number;
  grossSales: number;
  discounts: number;
  returns: number;
  netSales: number;
  shipping: number;
  salesTax: number;
  totalSales: number;
  marketplaces?: number;
}

interface MarketplaceDay { date: string; net: number; }
interface MarketplaceSummary { days: MarketplaceDay[]; }

type ViewTab = "daily" | "weekly" | "monthly";

const fmt = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function fmtDate(dateStr: string) {
  const d = new Date(dateStr + "T12:00:00Z");
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

function dash(n: number) {
  return n !== 0 ? fmt(n) : <span className="text-gray-600">—</span>;
}
function neg(n: number) {
  return n > 0 ? <span className="text-red-400">({fmt(n)})</span> : <span className="text-gray-600">—</span>;
}

// ISO week key
function isoWeek(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00Z");
  const jan4 = new Date(d.getFullYear(), 0, 4);
  const s = new Date(jan4);
  s.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7));
  const diff = Math.floor((d.getTime() - s.getTime()) / 86400000);
  const wk = Math.floor(diff / 7) + 1;
  return `${wk === 0 ? d.getFullYear() - 1 : d.getFullYear()}-W${String(wk).padStart(2, "0")}`;
}

// "Apr 7 – Apr 13" label for a week bucket
function weekRangeLabel(bucket: SalesBucket): string {
  // weekStart is the Monday; date is the ISO week key
  const start = bucket.weekStart ?? bucket.date;
  const end = new Date(start + "T12:00:00Z");
  end.setDate(end.getDate() + 6);
  const endStr = end.toISOString().substring(0, 10);
  const today = new Date().toISOString().substring(0, 10);
  const clampedEnd = endStr > today ? today : endStr;
  return `${fmtDate(start)} – ${fmtDate(clampedEnd)}`;
}

function sumBuckets(buckets: SalesBucket[]) {
  return {
    prh: buckets.reduce((s, r) => s + r.prh, 0),
    prolinePro: buckets.reduce((s, r) => s + r.prolinePro, 0),
    phone: buckets.reduce((s, r) => s + r.phone, 0),
    other: buckets.reduce((s, r) => s + r.other, 0),
    marketplaces: buckets.reduce((s, r) => s + (r.marketplaces ?? 0), 0),
    grossSales: buckets.reduce((s, r) => s + r.grossSales, 0),
    discounts: buckets.reduce((s, r) => s + r.discounts, 0),
    returns: buckets.reduce((s, r) => s + r.returns, 0),
    netSales: buckets.reduce((s, r) => s + r.netSales, 0),
    shipping: buckets.reduce((s, r) => s + r.shipping, 0),
    salesTax: buckets.reduce((s, r) => s + r.salesTax, 0),
    totalSales: buckets.reduce((s, r) => s + r.totalSales, 0),
  };
}

export default function SalesPage() {
  const [rangeKey, setRangeKey] = useState<RangeKey>("ytd");
  const [view, setView] = useState<ViewTab>("monthly");
  const [selectedWeek, setSelectedWeek] = useState<string>("");
  const [refreshKey, setRefreshKey] = useState(0);

  // Range-scoped data (drives the table)
  const [shopifyData, setShopifyData] = useState<{ daily: SalesBucket[]; weekly: SalesBucket[]; monthly: SalesBucket[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Always-on YTD data for persistent header
  const [ytdData, setYtdData] = useState<{ daily: SalesBucket[]; monthly: SalesBucket[] } | null>(null);

  // Marketplace
  const [marketplace, setMarketplace] = useState<MarketplaceSummary | null>(null);

  // Fetch marketplace once
  useEffect(() => {
    fetch("/api/sheets/marketplace")
      .then(r => r.json())
      .then(d => { if (!d.error) setMarketplace(d); })
      .catch(() => {});
  }, []);

  // Fetch YTD once for persistent header (re-runs on manual refresh)
  useEffect(() => {
    const now = new Date();
    const year = now.getFullYear();
    const today = now.toISOString().substring(0, 10);
    fetch(`/api/shopify/channel-sales?start=${year}-01-01&end=${today}&_=${refreshKey}`)
      .then(r => r.json())
      .then(d => { if (!d.error) setYtdData(d); })
      .catch(() => {});
  }, [refreshKey]);

  // Fetch range data for the table (re-runs on range change or manual refresh)
  useEffect(() => {
    const { start, end } = getRange(rangeKey);
    setLoading(true);
    setError("");
    fetch(`/api/shopify/channel-sales?start=${start}&end=${end}&_=${refreshKey}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) throw new Error(d.error);
        setShopifyData(d);
        // Default selectedWeek to most recent week
        if (d.weekly?.length > 0) setSelectedWeek(d.weekly[0].date);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [rangeKey, refreshKey]);

  const range = getRange(rangeKey);
  const today = new Date().toISOString().substring(0, 10);
  const currentYM = today.substring(0, 7);

  // Marketplace map keyed by date (for range)
  const mktMap = useMemo(() => {
    const map: Record<string, number> = {};
    if (!marketplace) return map;
    for (const d of marketplace.days) {
      if (d.date >= range.start && d.date <= range.end) {
        map[d.date] = (map[d.date] ?? 0) + d.net;
      }
    }
    return map;
  }, [marketplace, range.start, range.end]);

  // Marketplace map for YTD
  const mktYtdMap = useMemo(() => {
    const map: Record<string, number> = {};
    if (!marketplace) return map;
    const year = new Date().getFullYear();
    for (const d of marketplace.days) {
      if (d.date >= `${year}-01-01` && d.date <= today) {
        map[d.date] = (map[d.date] ?? 0) + d.net;
      }
    }
    return map;
  }, [marketplace, today]);

  // Enrich daily with marketplace
  const daily = useMemo(() =>
    (shopifyData?.daily ?? []).map(d => ({ ...d, marketplaces: mktMap[d.date] ?? 0 })),
  [shopifyData, mktMap]);

  // Enrich weekly with marketplace
  const weekly = useMemo(() => {
    if (!shopifyData) return [];
    const wkMap: Record<string, number> = {};
    for (const [date, val] of Object.entries(mktMap)) {
      const wk = isoWeek(date);
      wkMap[wk] = (wkMap[wk] ?? 0) + val;
    }
    return shopifyData.weekly.map(w => ({ ...w, marketplaces: wkMap[w.date] ?? 0 }));
  }, [shopifyData, mktMap]);

  // Enrich monthly with marketplace
  const monthly = useMemo(() => {
    if (!shopifyData) return [];
    const mktM: Record<string, number> = {};
    for (const [date, val] of Object.entries(mktMap)) {
      const ym = date.substring(0, 7);
      mktM[ym] = (mktM[ym] ?? 0) + val;
    }
    return shopifyData.monthly.map(m => ({ ...m, marketplaces: mktM[m.date] ?? 0 }));
  }, [shopifyData, mktMap]);

  // For the weekly view: daily rows for the selected week
  const weekDailyRows = useMemo(() => {
    if (!selectedWeek) return [];
    return daily.filter(d => isoWeek(d.date) === selectedWeek);
  }, [daily, selectedWeek]);

  // Active table rows
  const tableRows = view === "daily" ? daily : view === "weekly" ? weekDailyRows : monthly;
  const totals = useMemo(() => sumBuckets(tableRows), [tableRows]);

  // ── Persistent header stats ──────────────────────────────────────────────
  const ytdDailyWithMkt = useMemo(() =>
    (ytdData?.daily ?? []).map(d => ({ ...d, marketplaces: mktYtdMap[d.date] ?? 0 })),
  [ytdData, mktYtdMap]);

  const ytdTotals = useMemo(() => sumBuckets(ytdDailyWithMkt), [ytdDailyWithMkt]);

  const currentMonthTotals = useMemo(() =>
    sumBuckets(ytdDailyWithMkt.filter(d => d.date.startsWith(currentYM))),
  [ytdDailyWithMkt, currentYM]);

  const currentMonthLabel = MONTHS[new Date().getMonth()] + " " + new Date().getFullYear();

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Sales by Channel</h1>
          <p className="text-gray-400 mt-1">Gross → Discounts → Returns → Net → Shipping → Tax → Total</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setRefreshKey(k => k + 1)}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg text-sm text-gray-300 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="Force refresh — bypasses cache"
          >
            <svg className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
          <DateRangeDropdown value={rangeKey} onChange={setRangeKey} />
        </div>
      </div>

      {error && <div className="text-red-400 bg-red-900/20 rounded-lg p-4 mb-6 text-sm">{error}</div>}

      {/* Persistent header: YTD + Current Month */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        {/* YTD */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <div className="text-xs text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
            Year to Date {new Date().getFullYear()}
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <div className="text-xs text-gray-500 mb-0.5">Gross Sales</div>
              <div className="text-base font-bold text-white">{fmt(ytdTotals.grossSales)}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-0.5">Net Sales</div>
              <div className="text-base font-bold text-white">{fmt(ytdTotals.netSales)}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-0.5">Total</div>
              <div className="text-base font-bold text-green-400">{fmt(ytdTotals.totalSales + ytdTotals.marketplaces)}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-0.5">Discounts</div>
              <div className="text-sm font-medium text-red-400">({fmt(ytdTotals.discounts)})</div>
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-0.5">Returns</div>
              <div className="text-sm font-medium text-red-400">({fmt(ytdTotals.returns)})</div>
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-0.5">Marketplaces</div>
              <div className="text-sm font-medium text-orange-400">{fmt(ytdTotals.marketplaces)}</div>
            </div>
          </div>
        </div>

        {/* Current Month */}
        <div className="bg-gray-900 border border-blue-800/40 rounded-xl p-5">
          <div className="text-xs text-blue-400 uppercase tracking-wider mb-3 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
            {currentMonthLabel} — Live
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <div className="text-xs text-gray-500 mb-0.5">Gross Sales</div>
              <div className="text-base font-bold text-white">{fmt(currentMonthTotals.grossSales)}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-0.5">Net Sales</div>
              <div className="text-base font-bold text-white">{fmt(currentMonthTotals.netSales)}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-0.5">Total</div>
              <div className="text-base font-bold text-green-400">{fmt(currentMonthTotals.totalSales + currentMonthTotals.marketplaces)}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-0.5">Discounts</div>
              <div className="text-sm font-medium text-red-400">({fmt(currentMonthTotals.discounts)})</div>
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-0.5">Returns</div>
              <div className="text-sm font-medium text-red-400">({fmt(currentMonthTotals.returns)})</div>
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-0.5">Marketplaces</div>
              <div className="text-sm font-medium text-orange-400">{fmt(currentMonthTotals.marketplaces)}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Range summary cards — 5 separate */}
      {!loading && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
          {[
            { label: "Gross Sales", value: fmt(totals.grossSales), sub: "before discounts", color: "text-white" },
            { label: "Discounts", value: `(${fmt(totals.discounts)})`, sub: "promo codes & sales", color: "text-red-400" },
            { label: "Returns", value: `(${fmt(totals.returns)})`, sub: "refunded orders", color: "text-red-400" },
            { label: "Net Sales", value: fmt(totals.netSales), sub: "after discounts & returns", color: "text-white" },
            { label: "Total Sales", value: fmt(totals.totalSales + totals.marketplaces), sub: "net + shipping + tax + mktplc", color: "text-green-400" },
          ].map(card => (
            <div key={card.label} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">{card.label}</div>
              <div className={`text-xl font-bold ${card.color}`}>{card.value}</div>
              <div className="text-xs text-gray-600 mt-1">{card.sub}</div>
            </div>
          ))}
        </div>
      )}

      {/* View tabs + week selector */}
      <div className="flex items-center gap-4 mb-4 flex-wrap">
        <div className="flex gap-1 bg-gray-900 border border-gray-800 rounded-lg p-1">
          {(["daily", "weekly", "monthly"] as ViewTab[]).map(t => (
            <button
              key={t}
              onClick={() => setView(t)}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors capitalize ${
                view === t ? "bg-blue-600 text-white" : "text-gray-400 hover:text-white"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Week selector dropdown — only shown on weekly tab */}
        {view === "weekly" && weekly.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">Week:</span>
            <select
              value={selectedWeek}
              onChange={e => setSelectedWeek(e.target.value)}
              className="bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500"
            >
              {weekly.map(w => (
                <option key={w.date} value={w.date}>
                  {weekRangeLabel(w)}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {loading && <div className="text-gray-400 py-8">Loading...</div>}

      {!loading && tableRows.length > 0 && (
        <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">
              {view === "weekly"
                ? `Week of ${weekRangeLabel(weekly.find(w => w.date === selectedWeek) ?? weekly[0])}`
                : view === "monthly" ? "Monthly Breakdown" : "Daily Breakdown"}
            </h2>
            <span className="text-xs text-gray-500">
              {view === "weekly"
                ? `${tableRows.length} days this week`
                : `${tableRows.length} ${view === "daily" ? "days" : "months"}`}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-500 text-xs uppercase tracking-wider bg-gray-800/50 border-b border-gray-800">
                  <th className="py-3 px-3 text-left">{view === "monthly" ? "Month" : "Date"}</th>
                  <th className="py-3 px-3 text-right">PRH</th>
                  <th className="py-3 px-3 text-right">Pro</th>
                  <th className="py-3 px-3 text-right">Phone</th>
                  <th className="py-3 px-3 text-right text-gray-600">Other</th>
                  <th className="py-3 px-3 text-right text-orange-400">Mktplc</th>
                  <th className="py-3 px-3 text-right border-l border-gray-800">Gross</th>
                  <th className="py-3 px-3 text-right text-red-400">Discounts</th>
                  <th className="py-3 px-3 text-right text-red-400">Returns</th>
                  <th className="py-3 px-3 text-right font-semibold text-white">Net</th>
                  <th className="py-3 px-3 text-right">Shipping</th>
                  <th className="py-3 px-3 text-right">Tax</th>
                  <th className="py-3 px-3 text-right font-semibold text-green-400">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {tableRows.map(row => {
                  const isToday = view === "daily" && row.date === today;
                  return (
                    <tr
                      key={row.date}
                      className={`hover:bg-gray-800/40 ${isToday ? "bg-blue-900/20 ring-1 ring-inset ring-blue-700/50" : "text-gray-300"}`}
                    >
                      <td className={`py-2 px-3 whitespace-nowrap font-medium ${isToday ? "text-blue-300" : "text-gray-400"}`}>
                        {row.date}
                        {isToday && <span className="ml-2 text-xs bg-blue-600 text-white px-1.5 py-0.5 rounded-full">Today</span>}
                      </td>
                      <td className="py-2 px-3 text-right">{dash(row.prh)}</td>
                      <td className="py-2 px-3 text-right">{dash(row.prolinePro)}</td>
                      <td className="py-2 px-3 text-right">{dash(row.phone)}</td>
                      <td className="py-2 px-3 text-right text-gray-500">{dash(row.other)}</td>
                      <td className="py-2 px-3 text-right text-orange-400">{(row.marketplaces ?? 0) > 0 ? fmt(row.marketplaces!) : <span className="text-gray-600">—</span>}</td>
                      <td className="py-2 px-3 text-right border-l border-gray-800">{fmt(row.grossSales)}</td>
                      <td className="py-2 px-3 text-right">{neg(row.discounts)}</td>
                      <td className="py-2 px-3 text-right">{neg(row.returns)}</td>
                      <td className="py-2 px-3 text-right font-semibold text-white">{fmt(row.netSales)}</td>
                      <td className="py-2 px-3 text-right text-gray-400">{row.shipping > 0 ? fmt(row.shipping) : <span className="text-gray-600">—</span>}</td>
                      <td className="py-2 px-3 text-right text-gray-400">{row.salesTax > 0 ? fmt(row.salesTax) : <span className="text-gray-600">—</span>}</td>
                      <td className="py-2 px-3 text-right font-semibold text-green-400">{fmt(row.totalSales + (row.marketplaces ?? 0))}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-gray-800/50 border-t border-gray-700 font-semibold text-white text-xs">
                  <td className="py-3 px-3 text-gray-400">Total</td>
                  <td className="py-3 px-3 text-right">{fmt(totals.prh)}</td>
                  <td className="py-3 px-3 text-right">{fmt(totals.prolinePro)}</td>
                  <td className="py-3 px-3 text-right">{fmt(totals.phone)}</td>
                  <td className="py-3 px-3 text-right text-gray-500">{fmt(totals.other)}</td>
                  <td className="py-3 px-3 text-right text-orange-400">{fmt(totals.marketplaces)}</td>
                  <td className="py-3 px-3 text-right border-l border-gray-800">{fmt(totals.grossSales)}</td>
                  <td className="py-3 px-3 text-right text-red-400">({fmt(totals.discounts)})</td>
                  <td className="py-3 px-3 text-right text-red-400">({fmt(totals.returns)})</td>
                  <td className="py-3 px-3 text-right">{fmt(totals.netSales)}</td>
                  <td className="py-3 px-3 text-right text-gray-400">{fmt(totals.shipping)}</td>
                  <td className="py-3 px-3 text-right text-gray-400">{fmt(totals.salesTax)}</td>
                  <td className="py-3 px-3 text-right text-green-400">{fmt(totals.totalSales + totals.marketplaces)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {!loading && !error && tableRows.length === 0 && (
        <div className="text-gray-500 text-sm text-center py-12">No data for this period.</div>
      )}
    </div>
  );
}
