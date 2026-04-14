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
}

interface MarketplaceDay { date: string; net: number; }
interface MarketplaceSummary { days: MarketplaceDay[]; }

type ViewTab = "daily" | "weekly" | "monthly";

const fmt = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

function dash(n: number) {
  return n !== 0 ? fmt(n) : <span className="text-gray-600">—</span>;
}

function neg(n: number) {
  return n > 0 ? <span className="text-red-400">({fmt(n)})</span> : <span className="text-gray-600">—</span>;
}

export default function SalesPage() {
  const [rangeKey, setRangeKey] = useState<RangeKey>("ytd");
  const [view, setView] = useState<ViewTab>("monthly");
  const [shopifyData, setShopifyData] = useState<{ daily: SalesBucket[]; weekly: SalesBucket[]; monthly: SalesBucket[] } | null>(null);
  const [marketplace, setMarketplace] = useState<MarketplaceSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/sheets/marketplace")
      .then(r => r.json())
      .then(d => { if (!d.error) setMarketplace(d); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const { start, end } = getRange(rangeKey);
    setLoading(true);
    setError("");
    fetch(`/api/shopify/channel-sales?start=${start}&end=${end}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) throw new Error(d.error);
        setShopifyData(d);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [rangeKey]);

  const range = getRange(rangeKey);

  // Marketplace net keyed by date
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

  // Add marketplace to daily rows
  const daily = useMemo(() => {
    return (shopifyData?.daily ?? []).map(d => ({
      ...d,
      marketplaces: mktMap[d.date] ?? 0,
    }));
  }, [shopifyData, mktMap]);

  // Add marketplace to weekly rows (sum by week)
  const weekly = useMemo(() => {
    if (!shopifyData) return [];
    // Build week → marketplace sum using same ISO week logic
    const wkMap: Record<string, number> = {};
    for (const [date, val] of Object.entries(mktMap)) {
      const wk = isoWeek(date);
      wkMap[wk] = (wkMap[wk] ?? 0) + val;
    }
    return shopifyData.weekly.map(w => ({ ...w, marketplaces: wkMap[w.date] ?? 0 }));
  }, [shopifyData, mktMap]);

  // Add marketplace to monthly rows
  const monthly = useMemo(() => {
    if (!shopifyData) return [];
    const mktMonthly: Record<string, number> = {};
    for (const [date, val] of Object.entries(mktMap)) {
      const ym = date.substring(0, 7);
      mktMonthly[ym] = (mktMonthly[ym] ?? 0) + val;
    }
    return shopifyData.monthly.map(m => ({ ...m, marketplaces: mktMonthly[m.date] ?? 0 }));
  }, [shopifyData, mktMap]);

  // Active rows based on view
  const rows = view === "daily" ? daily : view === "weekly" ? weekly : monthly;

  // Summary totals from active rows
  const totals = useMemo(() => ({
    prh:        rows.reduce((s, r) => s + r.prh, 0),
    prolinePro: rows.reduce((s, r) => s + r.prolinePro, 0),
    phone:      rows.reduce((s, r) => s + r.phone, 0),
    other:      rows.reduce((s, r) => s + r.other, 0),
    marketplaces: rows.reduce((s, r) => s + (r as typeof rows[0] & { marketplaces: number }).marketplaces, 0),
    grossSales: rows.reduce((s, r) => s + r.grossSales, 0),
    discounts:  rows.reduce((s, r) => s + r.discounts, 0),
    returns:    rows.reduce((s, r) => s + r.returns, 0),
    netSales:   rows.reduce((s, r) => s + r.netSales, 0),
    shipping:   rows.reduce((s, r) => s + r.shipping, 0),
    salesTax:   rows.reduce((s, r) => s + r.salesTax, 0),
    totalSales: rows.reduce((s, r) => s + r.totalSales, 0),
  }), [rows]);

  function dateLabel(row: SalesBucket & { marketplaces?: number }) {
    if (view === "weekly") return `Week of ${row.weekStart ?? row.date}`;
    return row.date;
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Sales by Channel</h1>
          <p className="text-gray-400 mt-1">Gross → Discounts → Returns → Net → Shipping → Tax → Total</p>
          <div className="mt-2 flex items-center gap-3">
            <div className="inline-flex items-center gap-2 bg-green-900/20 border border-green-700/30 rounded-lg px-3 py-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
              <span className="text-green-400 text-xs font-medium">Shopify Live</span>
            </div>
            <div className="inline-flex items-center gap-2 bg-blue-900/20 border border-blue-700/30 rounded-lg px-3 py-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
              <span className="text-blue-400 text-xs font-medium">Marketplaces via Sheet</span>
            </div>
          </div>
        </div>
        <DateRangeDropdown value={rangeKey} onChange={setRangeKey} />
      </div>

      {error && <div className="text-red-400 bg-red-900/20 rounded-lg p-4 mb-6 text-sm">{error}</div>}

      {/* Summary cards */}
      {!loading && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Gross Sales</div>
            <div className="text-2xl font-bold text-white">{fmt(totals.grossSales)}</div>
            <div className="text-xs text-gray-500 mt-1">before discounts</div>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Discounts + Returns</div>
            <div className="text-2xl font-bold text-red-400">({fmt(totals.discounts + totals.returns)})</div>
            <div className="text-xs text-gray-500 mt-1">{fmt(totals.discounts)} discounts · {fmt(totals.returns)} returns</div>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Net Sales</div>
            <div className="text-2xl font-bold text-white">{fmt(totals.netSales)}</div>
            <div className="text-xs text-gray-500 mt-1">after discounts & returns</div>
          </div>
          <div className="bg-gray-900 border border-green-800/40 rounded-xl p-5">
            <div className="text-xs text-green-400 uppercase tracking-wider mb-1">Total Sales</div>
            <div className="text-2xl font-bold text-green-400">{fmt(totals.totalSales + totals.marketplaces)}</div>
            <div className="text-xs text-gray-500 mt-1">net + shipping + tax + marketplaces</div>
          </div>
        </div>
      )}

      {/* View tabs */}
      <div className="flex gap-1 mb-4 bg-gray-900 border border-gray-800 rounded-lg p-1 w-fit">
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

      {loading && <div className="text-gray-400 py-8">Loading...</div>}

      {!loading && rows.length > 0 && (
        <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white capitalize">{view} Breakdown</h2>
            <span className="text-xs text-gray-500">{rows.length} {view === "daily" ? "days" : view === "weekly" ? "weeks" : "months"}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-500 text-xs uppercase tracking-wider bg-gray-800/50 border-b border-gray-800">
                  <th className="py-3 px-3 text-left sticky left-0 bg-gray-800/80">{view === "weekly" ? "Week" : view === "monthly" ? "Month" : "Date"}</th>
                  <th className="py-3 px-3 text-right">PRH</th>
                  <th className="py-3 px-3 text-right">Pro</th>
                  <th className="py-3 px-3 text-right">Phone</th>
                  <th className="py-3 px-3 text-right text-gray-600">Other</th>
                  <th className="py-3 px-3 text-right text-orange-400">Mktplc</th>
                  <th className="py-3 px-3 text-right border-l border-gray-800">Gross Sales</th>
                  <th className="py-3 px-3 text-right text-red-400">Discounts</th>
                  <th className="py-3 px-3 text-right text-red-400">Returns</th>
                  <th className="py-3 px-3 text-right font-semibold text-white">Net Sales</th>
                  <th className="py-3 px-3 text-right">Shipping</th>
                  <th className="py-3 px-3 text-right">Tax</th>
                  <th className="py-3 px-3 text-right font-semibold text-green-400">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {(rows as (SalesBucket & { marketplaces: number })[]).map(row => (
                  <tr key={row.date} className="text-gray-300 hover:bg-gray-800/40">
                    <td className="py-2 px-3 text-gray-400 whitespace-nowrap sticky left-0 bg-gray-900">{dateLabel(row)}</td>
                    <td className="py-2 px-3 text-right">{dash(row.prh)}</td>
                    <td className="py-2 px-3 text-right">{dash(row.prolinePro)}</td>
                    <td className="py-2 px-3 text-right">{dash(row.phone)}</td>
                    <td className="py-2 px-3 text-right text-gray-500">{dash(row.other)}</td>
                    <td className="py-2 px-3 text-right text-orange-400">{row.marketplaces > 0 ? fmt(row.marketplaces) : <span className="text-gray-600">—</span>}</td>
                    <td className="py-2 px-3 text-right border-l border-gray-800">{fmt(row.grossSales)}</td>
                    <td className="py-2 px-3 text-right">{neg(row.discounts)}</td>
                    <td className="py-2 px-3 text-right">{neg(row.returns)}</td>
                    <td className="py-2 px-3 text-right font-semibold text-white">{fmt(row.netSales)}</td>
                    <td className="py-2 px-3 text-right text-gray-400">{row.shipping > 0 ? fmt(row.shipping) : <span className="text-gray-600">—</span>}</td>
                    <td className="py-2 px-3 text-right text-gray-400">{row.salesTax > 0 ? fmt(row.salesTax) : <span className="text-gray-600">—</span>}</td>
                    <td className="py-2 px-3 text-right font-semibold text-green-400">{fmt(row.totalSales + row.marketplaces)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-gray-800/50 border-t border-gray-700 font-semibold text-white text-xs">
                  <td className="py-3 px-3">Total</td>
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

      {!loading && !error && rows.length === 0 && (
        <div className="text-gray-500 text-sm text-center py-12">No data for this period.</div>
      )}
    </div>
  );
}

// ISO week helper (mirrors server-side)
function isoWeek(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00Z");
  const jan4 = new Date(d.getFullYear(), 0, 4);
  const startOfWeek1 = new Date(jan4);
  startOfWeek1.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7));
  const dayDiff = Math.floor((d.getTime() - startOfWeek1.getTime()) / 86400000);
  const weekNum = Math.floor(dayDiff / 7) + 1;
  const year = weekNum === 0 ? d.getFullYear() - 1 : d.getFullYear();
  return `${year}-W${String(weekNum).padStart(2, "0")}`;
}
