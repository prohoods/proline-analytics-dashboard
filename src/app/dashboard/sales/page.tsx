"use client";

import { useEffect, useState, useMemo } from "react";
import DateRangeDropdown from "@/components/DateRangeDropdown";
import { RangeKey, getRange, getPreviousRange } from "@/lib/date-ranges";
import DeltaBadge from "@/components/DeltaBadge";
import { TableSkeleton, SkeletonCard } from "@/components/Skeleton";
import { exportToCSV } from "@/lib/export-csv";

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
  redo: number;
  totalSales: number;
  marketplaces?: number;
  shl?: number;
}

interface SHLDay { date: string; netRevenue: number; tax?: number; refundTax?: number; }

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
    shl: buckets.reduce((s, r) => s + (r.shl ?? 0), 0),
    grossSales: buckets.reduce((s, r) => s + r.grossSales, 0),
    discounts: buckets.reduce((s, r) => s + r.discounts, 0),
    returns: buckets.reduce((s, r) => s + r.returns, 0),
    netSales: buckets.reduce((s, r) => s + r.netSales, 0),
    shipping: buckets.reduce((s, r) => s + r.shipping, 0),
    salesTax: buckets.reduce((s, r) => s + r.salesTax, 0),
    redo: buckets.reduce((s, r) => s + (r.redo ?? 0), 0),
    totalSales: buckets.reduce((s, r) => s + r.totalSales, 0),
  };
}

export default function SalesPage() {
  const [rangeKey, setRangeKey] = useState<RangeKey>("ytd");
  const [view, setView] = useState<ViewTab>("monthly");
  const [selectedWeek, setSelectedWeek] = useState<string>("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [showCompare, setShowCompare] = useState(false);
  const [prevTotals, setPrevTotals] = useState<ReturnType<typeof sumBuckets> | null>(null);
  const [prevLoading, setPrevLoading] = useState(false);

  // Range-scoped data (drives the table)
  const [shopifyData, setShopifyData] = useState<{ daily: SalesBucket[]; weekly: SalesBucket[]; monthly: SalesBucket[]; otherBreakdown?: { tags: string; count: number; amount: number; sampleOrder: string }[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Always-on YTD data for persistent header
  const [ytdData, setYtdData] = useState<{ daily: SalesBucket[]; monthly: SalesBucket[] } | null>(null);

  // Marketplace
  const [marketplace, setMarketplace] = useState<MarketplaceSummary | null>(null);
  // SHL
  const [shlDays, setShlDays] = useState<SHLDay[]>([]);

  // Fetch marketplace once
  useEffect(() => {
    fetch("/api/sheets/marketplace")
      .then(r => r.json())
      .then(d => { if (!d.error) setMarketplace(d); })
      .catch(() => {});
  }, []);

  // Fetch SHL for the full year so it covers all range selections
  useEffect(() => {
    const year = new Date().getFullYear();
    const today = new Date().toISOString().substring(0, 10);
    fetch(`/api/shopify-shl/orders?start=${year}-01-01&end=${today}`)
      .then(r => r.json())
      .then(d => { if (!d.error && d.daily) setShlDays(d.daily); })
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

  // Fetch previous period when compare is toggled on
  useEffect(() => {
    if (!showCompare) { setPrevTotals(null); return; }
    const prev = getPreviousRange(rangeKey);
    setPrevLoading(true);
    Promise.all([
      fetch(`/api/shopify/channel-sales?start=${prev.start}&end=${prev.end}&_=${refreshKey}`).then(r => r.json()),
    ]).then(([d]) => {
      if (!d.error && d.daily) {
        // Build prev daily with marketplace + SHL
        const prevDaily: SalesBucket[] = d.daily.map((row: SalesBucket) => ({
          ...row,
          marketplaces: marketplace?.days.filter(m => m.date >= prev.start && m.date <= prev.end).reduce((s: number, m: MarketplaceDay) => m.date === row.date ? s + m.net : s, 0) ?? 0,
          shl: shlDays.filter((s: SHLDay) => s.date === row.date).reduce((acc: number, s: SHLDay) => acc + s.netRevenue, 0),
        }));
        setPrevTotals(sumBuckets(prevDaily));
      }
    }).finally(() => setPrevLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showCompare, rangeKey, refreshKey]);

  const range = getRange(rangeKey);
  const prevRange = getPreviousRange(rangeKey);
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

  // SHL maps keyed by date
  const shlMap = useMemo(() => {
    const map: Record<string, number> = {};
    for (const d of shlDays) {
      if (d.date >= range.start && d.date <= range.end) {
        map[d.date] = d.netRevenue;
      }
    }
    return map;
  }, [shlDays, range.start, range.end]);

  // SHL net tax (gross tax collected − tax refunded) keyed by date.
  // Folded into the Sales Tax column so the dashboard reflects combined
  // DTC + SHL tax liability across the business.
  const shlTaxMap = useMemo(() => {
    const map: Record<string, number> = {};
    for (const d of shlDays) {
      if (d.date >= range.start && d.date <= range.end) {
        map[d.date] = (d.tax ?? 0) - (d.refundTax ?? 0);
      }
    }
    return map;
  }, [shlDays, range.start, range.end]);

  const shlYtdMap = useMemo(() => {
    const map: Record<string, number> = {};
    const year = new Date().getFullYear();
    for (const d of shlDays) {
      if (d.date >= `${year}-01-01` && d.date <= today) {
        map[d.date] = d.netRevenue;
      }
    }
    return map;
  }, [shlDays, today]);

  const shlTaxYtdMap = useMemo(() => {
    const map: Record<string, number> = {};
    const year = new Date().getFullYear();
    for (const d of shlDays) {
      if (d.date >= `${year}-01-01` && d.date <= today) {
        map[d.date] = (d.tax ?? 0) - (d.refundTax ?? 0);
      }
    }
    return map;
  }, [shlDays, today]);

  // Enrich daily with marketplace + SHL. SHL net tax folds into salesTax
  // so the tax column represents the business-wide remittance liability.
  const daily = useMemo(() =>
    (shopifyData?.daily ?? []).map(d => ({
      ...d,
      marketplaces: mktMap[d.date] ?? 0,
      shl: shlMap[d.date] ?? 0,
      salesTax: d.salesTax + (shlTaxMap[d.date] ?? 0),
    })),
  [shopifyData, mktMap, shlMap, shlTaxMap]);

  // Enrich weekly with marketplace + SHL
  const weekly = useMemo(() => {
    if (!shopifyData) return [];
    const wkMap: Record<string, number> = {};
    for (const [date, val] of Object.entries(mktMap)) {
      const wk = isoWeek(date);
      wkMap[wk] = (wkMap[wk] ?? 0) + val;
    }
    const shlWkMap: Record<string, number> = {};
    for (const [date, val] of Object.entries(shlMap)) {
      const wk = isoWeek(date);
      shlWkMap[wk] = (shlWkMap[wk] ?? 0) + val;
    }
    const shlTaxWkMap: Record<string, number> = {};
    for (const [date, val] of Object.entries(shlTaxMap)) {
      const wk = isoWeek(date);
      shlTaxWkMap[wk] = (shlTaxWkMap[wk] ?? 0) + val;
    }
    return shopifyData.weekly.map(w => ({
      ...w,
      marketplaces: wkMap[w.date] ?? 0,
      shl: shlWkMap[w.date] ?? 0,
      salesTax: w.salesTax + (shlTaxWkMap[w.date] ?? 0),
    }));
  }, [shopifyData, mktMap, shlMap, shlTaxMap]);

  // Enrich monthly with marketplace + SHL
  const monthly = useMemo(() => {
    if (!shopifyData) return [];
    const mktM: Record<string, number> = {};
    for (const [date, val] of Object.entries(mktMap)) {
      const ym = date.substring(0, 7);
      mktM[ym] = (mktM[ym] ?? 0) + val;
    }
    const shlM: Record<string, number> = {};
    for (const [date, val] of Object.entries(shlMap)) {
      const ym = date.substring(0, 7);
      shlM[ym] = (shlM[ym] ?? 0) + val;
    }
    const shlTaxM: Record<string, number> = {};
    for (const [date, val] of Object.entries(shlTaxMap)) {
      const ym = date.substring(0, 7);
      shlTaxM[ym] = (shlTaxM[ym] ?? 0) + val;
    }
    return shopifyData.monthly.map(m => ({
      ...m,
      marketplaces: mktM[m.date] ?? 0,
      shl: shlM[m.date] ?? 0,
      salesTax: m.salesTax + (shlTaxM[m.date] ?? 0),
    }));
  }, [shopifyData, mktMap, shlMap, shlTaxMap]);

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
    (ytdData?.daily ?? []).map(d => ({
      ...d,
      marketplaces: mktYtdMap[d.date] ?? 0,
      shl: shlYtdMap[d.date] ?? 0,
      salesTax: d.salesTax + (shlTaxYtdMap[d.date] ?? 0),
    })),
  [ytdData, mktYtdMap, shlYtdMap, shlTaxYtdMap]);

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
          <p className="text-gray-400 mt-1">Gross → Discounts → Refunds → Net → Shipping → Tax → Total</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
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
          <button
            onClick={() => setShowCompare(c => !c)}
            className={`flex items-center gap-1.5 px-3 py-2 border rounded-lg text-sm transition-colors ${
              showCompare
                ? "bg-purple-600/20 border-purple-600/40 text-purple-300"
                : "bg-gray-800 hover:bg-gray-700 border-gray-700 text-gray-300 hover:text-white"
            }`}
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            {showCompare ? `vs ${prevRange.start} – ${prevRange.end}` : "Compare"}
          </button>
          <DateRangeDropdown value={rangeKey} onChange={setRangeKey} />
        </div>
      </div>

      {error && <div className="text-red-400 bg-red-900/20 rounded-lg p-4 mb-6 text-sm">{error}</div>}

      {/* Methodology note */}
      <MethodologyNote />

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
              <div className="text-base font-bold text-green-400">{fmt(ytdTotals.totalSales + ytdTotals.marketplaces + ytdTotals.shl)}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-0.5">Discounts</div>
              <div className="text-sm font-medium text-red-400">({fmt(ytdTotals.discounts)})</div>
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-0.5">Refunds</div>
              <div className="text-sm font-medium text-red-400">({fmt(ytdTotals.returns)})</div>
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-0.5">Mktplc + SHL</div>
              <div className="text-sm font-medium text-orange-400">{fmt(ytdTotals.marketplaces + ytdTotals.shl)}</div>
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
              <div className="text-base font-bold text-green-400">{fmt(currentMonthTotals.totalSales + currentMonthTotals.marketplaces + currentMonthTotals.shl)}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-0.5">Discounts</div>
              <div className="text-sm font-medium text-red-400">({fmt(currentMonthTotals.discounts)})</div>
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-0.5">Refunds</div>
              <div className="text-sm font-medium text-red-400">({fmt(currentMonthTotals.returns)})</div>
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-0.5">Mktplc + SHL</div>
              <div className="text-sm font-medium text-orange-400">{fmt(currentMonthTotals.marketplaces + currentMonthTotals.shl)}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Range summary cards */}
      {!loading && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
          {[
            { label: "Gross Sales",  cur: totals.grossSales,                               prev: prevTotals?.grossSales,  inverted: false, color: "text-white",     display: fmt(totals.grossSales),                              sub: "before discounts" },
            { label: "Discounts",    cur: totals.discounts,                                prev: prevTotals?.discounts,   inverted: true,  color: "text-red-400",  display: `(${fmt(totals.discounts)})`,                        sub: "promo codes & sales" },
            { label: "Refunds",      cur: totals.returns,                                  prev: prevTotals?.returns,     inverted: true,  color: "text-red-400",  display: `(${fmt(totals.returns)})`,                          sub: "bucketed on refund date" },
            { label: "Net Sales",    cur: totals.netSales,                                 prev: prevTotals?.netSales,    inverted: false, color: "text-white",     display: fmt(totals.netSales),                                sub: "after discounts & refunds" },
            { label: "Total Sales",  cur: totals.totalSales + totals.marketplaces + totals.shl, prev: prevTotals ? prevTotals.totalSales + prevTotals.marketplaces + prevTotals.shl : undefined, inverted: false, color: "text-green-400", display: fmt(totals.totalSales + totals.marketplaces + totals.shl), sub: "net + shipping + tax + mktplc + SHL" },
          ].map(card => (
            <div key={card.label} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">{card.label}</div>
              <div className={`text-xl font-bold ${card.color}`}>{card.display}</div>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs text-gray-600">{card.sub}</span>
                {showCompare && card.prev !== undefined && !prevLoading && (
                  <DeltaBadge current={card.cur} previous={card.prev} inverted={card.inverted} />
                )}
              </div>
              {showCompare && card.prev !== undefined && !prevLoading && (
                <div className="text-xs text-gray-600 mt-0.5">prev: {card.label === "Discounts" || card.label === "Refunds" ? `(${fmt(card.prev)})` : fmt(card.prev)}</div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* What's in "Other" — collapsible diagnostic */}
      {shopifyData?.otherBreakdown && shopifyData.otherBreakdown.length > 0 && (
        <details className="bg-gray-900 border border-gray-800 rounded-xl mb-4 overflow-hidden">
          <summary className="px-4 py-3 cursor-pointer text-sm text-gray-400 hover:text-white flex items-center justify-between">
            <span>What&apos;s in &quot;Other&quot;? <span className="text-gray-600 ml-2">{shopifyData.otherBreakdown.length} unique tag combinations · {fmt(shopifyData.otherBreakdown.reduce((s, b) => s + b.amount, 0))}</span></span>
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
          </summary>
          <div className="border-t border-gray-800 px-4 py-3 text-xs">
            <div className="text-gray-500 mb-2">Orders with tags that don&apos;t match PRH (no tag), Phone (<code className="bg-gray-800 px-1 rounded">[]</code>), or PRO (<code className="bg-gray-800 px-1 rounded">ProlinePro B2B</code>) land here. If a pattern looks like a real channel, tell me and I&apos;ll add it to the classifier.</div>
            <table className="w-full text-xs">
              <thead className="text-gray-500 uppercase">
                <tr><th className="text-left py-1.5">Tags</th><th className="text-right py-1.5">Orders</th><th className="text-right py-1.5">Subtotal</th><th className="text-left py-1.5 pl-4">Sample order</th></tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {shopifyData.otherBreakdown.map(b => (
                  <tr key={b.tags} className="text-gray-300">
                    <td className="py-1.5 font-mono">{b.tags}</td>
                    <td className="py-1.5 text-right">{b.count}</td>
                    <td className="py-1.5 text-right">{fmt(b.amount)}</td>
                    <td className="py-1.5 pl-4 text-gray-500">{b.sampleOrder}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
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

      {loading && <TableSkeleton rows={10} cols={13} />}

      {!loading && tableRows.length > 0 && (
        <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">
              {view === "weekly"
                ? `Week of ${weekRangeLabel(weekly.find(w => w.date === selectedWeek) ?? weekly[0])}`
                : view === "monthly" ? "Monthly Breakdown" : "Daily Breakdown"}
            </h2>
            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-500">
                {view === "weekly"
                  ? `${tableRows.length} days this week`
                  : `${tableRows.length} ${view === "daily" ? "days" : "months"}`}
              </span>
              <button
                onClick={() => exportToCSV(
                  tableRows.map(r => ({
                    Date: r.date, PRH: r.prh, Pro: r.prolinePro, Phone: r.phone,
                    SHL: r.shl ?? 0, Other: r.other, Marketplace: r.marketplaces ?? 0,
                    Gross: r.grossSales, Discounts: r.discounts, Refunds: r.returns,
                    Redo: r.redo, Net: r.netSales, Shipping: r.shipping, Tax: r.salesTax,
                    Total: r.totalSales + (r.marketplaces ?? 0) + (r.shl ?? 0),
                  })),
                  `proline-sales-${range.start}-${range.end}`
                )}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg text-xs text-gray-300 hover:text-white transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Export CSV
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="text-gray-500 text-xs uppercase tracking-wider bg-gray-800 border-b border-gray-800">
                  <th className="py-3 px-3 text-left">{view === "monthly" ? "Month" : "Date"}</th>
                  <th className="py-3 px-3 text-right">PRH</th>
                  <th className="py-3 px-3 text-right">Pro</th>
                  <th className="py-3 px-3 text-right">Phone</th>
                  <th className="py-3 px-3 text-right text-purple-400">SHL</th>
                  <th className="py-3 px-3 text-right text-gray-600">Other</th>
                  <th className="py-3 px-3 text-right text-orange-400">Mktplc</th>
                  <th className="py-3 px-3 text-right border-l border-gray-800">Gross</th>
                  <th className="py-3 px-3 text-right text-red-400">Discounts</th>
                  <th className="py-3 px-3 text-right text-red-400">Refunds</th>
                  <th className="py-3 px-3 text-right text-cyan-400" title="Redo shipping protection fees — collected at checkout, remitted to Redo. Not Proline revenue.">Redo</th>
                  <th className="py-3 px-3 text-right font-semibold text-white">Net</th>
                  <th className="py-3 px-3 text-right">Shipping</th>
                  <th className="py-3 px-3 text-right" title="Combined DTC + SHL net sales tax (tax collected − refunded tax)">Tax <span className="text-gray-600 normal-case">(DTC+SHL)</span></th>
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
                      <td className="py-2 px-3 text-right text-purple-400">{(row.shl ?? 0) > 0 ? fmt(row.shl!) : <span className="text-gray-600">—</span>}</td>
                      <td className="py-2 px-3 text-right text-gray-500">{dash(row.other)}</td>
                      <td className="py-2 px-3 text-right text-orange-400">{(row.marketplaces ?? 0) > 0 ? fmt(row.marketplaces!) : <span className="text-gray-600">—</span>}</td>
                      <td className="py-2 px-3 text-right border-l border-gray-800">{fmt(row.grossSales)}</td>
                      <td className="py-2 px-3 text-right">{neg(row.discounts)}</td>
                      <td className="py-2 px-3 text-right">{neg(row.returns)}</td>
                      <td className="py-2 px-3 text-right text-cyan-400">{row.redo > 0 ? fmt(row.redo) : <span className="text-gray-600">—</span>}</td>
                      <td className="py-2 px-3 text-right font-semibold text-white">{fmt(row.netSales)}</td>
                      <td className="py-2 px-3 text-right text-gray-400">{row.shipping > 0 ? fmt(row.shipping) : <span className="text-gray-600">—</span>}</td>
                      <td className="py-2 px-3 text-right text-gray-400">{row.salesTax > 0 ? fmt(row.salesTax) : <span className="text-gray-600">—</span>}</td>
                      <td className="py-2 px-3 text-right font-semibold text-green-400">{fmt(row.totalSales + (row.marketplaces ?? 0) + (row.shl ?? 0))}</td>
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
                  <td className="py-3 px-3 text-right text-purple-400">{fmt(totals.shl)}</td>
                  <td className="py-3 px-3 text-right text-gray-500">{fmt(totals.other)}</td>
                  <td className="py-3 px-3 text-right text-orange-400">{fmt(totals.marketplaces)}</td>
                  <td className="py-3 px-3 text-right border-l border-gray-800">{fmt(totals.grossSales)}</td>
                  <td className="py-3 px-3 text-right text-red-400">({fmt(totals.discounts)})</td>
                  <td className="py-3 px-3 text-right text-red-400">({fmt(totals.returns)})</td>
                  <td className="py-3 px-3 text-right text-cyan-400">{fmt(totals.redo)}</td>
                  <td className="py-3 px-3 text-right">{fmt(totals.netSales)}</td>
                  <td className="py-3 px-3 text-right text-gray-400">{fmt(totals.shipping)}</td>
                  <td className="py-3 px-3 text-right text-gray-400">{fmt(totals.salesTax)}</td>
                  <td className="py-3 px-3 text-right text-green-400">{fmt(totals.totalSales + totals.marketplaces + totals.shl)}</td>
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

function MethodologyNote() {
  const [open, setOpen] = useState(false);
  return (
    <div className="mb-6 bg-gray-900 border border-gray-700/50 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm text-gray-400 hover:text-gray-200 transition-colors"
      >
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-blue-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="font-medium text-gray-300">How these numbers are calculated</span>
          <span className="text-xs text-gray-600">— Numbers will not match Shopify Analytics exactly. Click to understand why.</span>
        </div>
        <svg className={`w-4 h-4 transition-transform ${open ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="px-4 pb-4 border-t border-gray-800 pt-4 grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Column Definitions</h3>
            <div className="space-y-2 text-xs text-gray-400">
              <div><span className="text-gray-200 font-medium">PRH / PRO / PHONE / OTHER</span> — Shopify orders split by tag, in priority order: <code className="bg-gray-800 px-1 rounded">ProlinePro B2B</code> = PRO (wins over phone if both tags are present), tag exactly <code className="bg-gray-800 px-1 rounded">[]</code> = Phone, no tags at all = PRH (website), anything else = Other (custom tags like REFUNDED, etc — open the order in Shopify to see the tag).</div>
              <div><span className="text-gray-200 font-medium">SHL</span> — Smart Home Luxury Shopify store (separate account). Net revenue by order date.</div>
              <div><span className="text-gray-200 font-medium">MKTPLC</span> — Amazon, Wayfair, Home Depot. Pulled from Google Sheets (manually entered).</div>
              <div><span className="text-gray-200 font-medium">GROSS</span> — Line item prices before discounts (<code className="bg-gray-800 px-1 rounded">subtotal + total_discounts</code>).</div>
              <div><span className="text-gray-200 font-medium">DISCOUNTS</span> — <code className="bg-gray-800 px-1 rounded">total_discounts</code> from each order.</div>
              <div><span className="text-gray-200 font-medium">REFUNDS</span> — Refund amounts fetched per order, attributed to the <span className="text-yellow-400">date the refund was processed</span> (not the original order date). Includes refunds processed in the window for orders placed before the window.</div>
              <div><span className="text-gray-200 font-medium">NET</span> — Gross − Discounts − Refunds.</div>
              <div><span className="text-gray-200 font-medium">TOTAL</span> — Net + Shipping + Tax + SHL + Marketplaces. <span className="text-orange-400">This includes SHL and Marketplace revenue which Shopify Analytics does not.</span></div>
            </div>
          </div>
          <div>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Why Numbers Differ from Shopify Analytics</h3>
            <div className="space-y-3 text-xs text-gray-400">
              <div className="flex gap-2">
                <span className="text-yellow-400 font-bold flex-shrink-0">1.</span>
                <div><span className="text-gray-200 font-medium">TOTAL is larger by design</span> — Shopify Analytics only shows Proline orders. Our TOTAL adds SHL and Marketplace revenue on top. These are intentionally included.</div>
              </div>
              <div className="flex gap-2">
                <span className="text-yellow-400 font-bold flex-shrink-0">2.</span>
                <div><span className="text-gray-200 font-medium">Refunds may shift dates</span> — Refunds processed on a different day than the original order will appear on the refund date. A refund processed today for a week-old order shows in today&apos;s row.</div>
              </div>
              <div className="flex gap-2">
                <span className="text-yellow-400 font-bold flex-shrink-0">3.</span>
                <div><span className="text-gray-200 font-medium">Timezone</span> — Orders are fetched using UTC-7 (Mountain Time). If your Shopify store is set to a different timezone, orders placed near midnight may land on a different date here vs Shopify Analytics.</div>
              </div>
              <div className="flex gap-2">
                <span className="text-yellow-400 font-bold flex-shrink-0">4.</span>
                <div><span className="text-gray-200 font-medium">Refund amount calculation</span> — We sum refund line items (subtotal only — refunded tax is netted out of the Tax column to match Shopify&apos;s Total sales breakdown).</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
