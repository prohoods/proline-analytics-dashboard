"use client";

import { useEffect, useState, useMemo } from "react";
import DateRangeDropdown from "@/components/DateRangeDropdown";
import { RangeKey, getRange } from "@/lib/date-ranges";

const MARGIN = 0.40;

const fmt  = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
const fmtX = (n: number) => n > 0 ? `${n.toFixed(2)}x` : "—";
const fmtP = (n: number) => `${n.toFixed(1)}%`;
const merColor  = (m: number) => m >= 4 ? "text-green-400" : m >= 2.5 ? "text-yellow-400" : m > 0 ? "text-red-400" : "text-gray-500";
const cmColor   = (n: number) => n >= 0 ? "text-green-400" : "text-red-400";
const pctColor  = (p: number) => p <= 20 ? "text-green-400" : p <= 35 ? "text-yellow-400" : "text-red-400";

// ── Interfaces ────────────────────────────────────────────────────────
interface SalesBucket { date: string; grossSales: number; discounts: number; returns: number; netSales: number; shipping: number; salesTax: number; totalSales: number; prh: number; prolinePro: number; phone: number; other: number; }
interface GoogleMonth { month: string; totalSpend: number; totalConvValue: number; }
interface MarketplaceDay { date: string; net: number; }
interface AcqSummary { totalOrders: number; newCustomers: number; repeatCustomers: number; repeatRate: number; newRevenue: number; repeatRevenue: number; }

// ── Waterfall Row ─────────────────────────────────────────────────────
function WaterfallRow({ label, value, base, note, isNegative, isBold, isResult }: {
  label: string; value: number; base: number; note?: string;
  isNegative?: boolean; isBold?: boolean; isResult?: boolean;
}) {
  const pct = base > 0 ? Math.abs(value) / base * 100 : 0;
  const barColor = isNegative ? "bg-red-500/70" : isResult ? "bg-green-500/70" : "bg-blue-500/70";
  return (
    <div className={`flex items-center gap-3 py-2 px-4 ${isResult ? "bg-gray-800/40 rounded-lg" : ""}`}>
      <div className={`w-44 text-sm flex-shrink-0 ${isBold ? "font-semibold text-white" : isNegative ? "text-gray-400" : "text-gray-300"}`}>
        {isNegative ? "− " : isResult ? "= " : ""}{label}
      </div>
      <div className="flex-1 h-4 bg-gray-800 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
      <div className={`w-28 text-right text-sm font-semibold flex-shrink-0 ${isNegative ? "text-red-400" : isResult ? "text-green-400" : "text-white"}`}>
        {isNegative ? `(${fmt(Math.abs(value))})` : fmt(value)}
      </div>
      <div className="w-14 text-right text-xs text-gray-500 flex-shrink-0">{pct > 0 ? fmtP(pct) : ""}</div>
      {note && <div className="text-xs text-gray-600 w-24 flex-shrink-0">{note}</div>}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────
export default function ScorecardPage() {
  const [rangeKey, setRangeKey] = useState<RangeKey>("ytd");

  // Shopify sales
  const [salesData, setSalesData] = useState<{ monthly: SalesBucket[] } | null>(null);
  // Google Ads
  const [googleRaw, setGoogleRaw] = useState<GoogleMonth[]>([]);
  // Manual ad platforms (month → cost)
  const [bingRaw,       setBingRaw]       = useState<{ month: string; cost: number }[]>([]);
  const [metaRaw,       setMetaRaw]       = useState<{ month: string; cost: number }[]>([]);
  const [amazonRaw,     setAmazonRaw]     = useState<{ month: string; cost: number }[]>([]);
  const [connexityRaw,  setConnexityRaw]  = useState<{ month: string; cost: number }[]>([]);
  const [pinterestRaw,  setPinterestRaw]  = useState<{ month: string; cost: number }[]>([]);
  const [tiktokRaw,     setTiktokRaw]     = useState<{ month: string; cost: number }[]>([]);
  // Marketplace
  const [marketplace,   setMarketplace]   = useState<{ days: MarketplaceDay[] } | null>(null);
  // Customer acquisition
  const [acqData, setAcqData] = useState<AcqSummary | null>(null);

  const [salesLoading,  setSalesLoading]  = useState(true);
  const [adsLoading,    setAdsLoading]    = useState(true);
  const [acqLoading,    setAcqLoading]    = useState(true);

  // Fetch static sources once (manual sheets + marketplace)
  useEffect(() => {
    const year = new Date().getFullYear();
    Promise.allSettled([
      fetch(`/api/google-ads/campaigns?start=${year - 1}-01-01&end=${year}-12-31`).then(r => r.json()).then(d => { if (!d.error) setGoogleRaw(Array.isArray(d) ? d : []); }),
      fetch("/api/sheets/bing").then(r => r.json()).then(d => { if (!d.error) setBingRaw(d.rows ?? []); }),
      fetch("/api/sheets/meta").then(r => r.json()).then(d => { if (!d.error) setMetaRaw(d.rows ?? []); }),
      fetch("/api/sheets/amazon-ads").then(r => r.json()).then(d => { if (!d.error) setAmazonRaw(d.rows ?? []); }),
      fetch("/api/sheets/connexity").then(r => r.json()).then(d => { if (!d.error) setConnexityRaw(d.rows ?? []); }),
      fetch("/api/sheets/pinterest").then(r => r.json()).then(d => { if (!d.error) setPinterestRaw(d.rows ?? []); }),
      fetch("/api/sheets/tiktok").then(r => r.json()).then(d => { if (!d.error) setTiktokRaw(d.rows ?? []); }),
      fetch("/api/sheets/marketplace").then(r => r.json()).then(d => { if (!d.error) setMarketplace(d); }),
    ]).finally(() => setAdsLoading(false));
  }, []);

  // Fetch Shopify sales + customer acquisition on range change
  useEffect(() => {
    const { start, end } = getRange(rangeKey);
    setSalesLoading(true); setAcqLoading(true);
    Promise.allSettled([
      fetch(`/api/shopify/channel-sales?start=${start}&end=${end}`).then(r => r.json()).then(d => { if (!d.error) setSalesData(d); }),
      fetch(`/api/shopify/customer-acquisition?start=${start}&end=${end}`).then(r => r.json()).then(d => { if (!d.error && d.summary) setAcqData(d.summary); }),
    ]).finally(() => { setSalesLoading(false); setAcqLoading(false); });
  }, [rangeKey]);

  const range  = getRange(rangeKey);
  const loading = salesLoading || adsLoading;

  // ── Shopify monthly totals ──────────────────────────────────────────
  const shopify = useMemo(() => {
    const rows = salesData?.monthly ?? [];
    return {
      gross:    rows.reduce((s, r) => s + r.grossSales, 0),
      discounts:rows.reduce((s, r) => s + r.discounts,  0),
      returns:  rows.reduce((s, r) => s + r.returns,    0),
      net:      rows.reduce((s, r) => s + r.netSales,   0),
      shipping: rows.reduce((s, r) => s + r.shipping,   0),
      tax:      rows.reduce((s, r) => s + r.salesTax,   0),
      total:    rows.reduce((s, r) => s + r.totalSales,  0),
      prh:      rows.reduce((s, r) => s + r.prh,        0),
      pro:      rows.reduce((s, r) => s + r.prolinePro,  0),
      phone:    rows.reduce((s, r) => s + r.phone,       0),
      other:    rows.reduce((s, r) => s + r.other,       0),
      monthly:  rows,
    };
  }, [salesData]);

  // ── Marketplace totals ─────────────────────────────────────────────
  const mktRevenue = useMemo(() => {
    if (!marketplace) return 0;
    return marketplace.days
      .filter(d => d.date >= range.start && d.date <= range.end)
      .reduce((s, d) => s + d.net, 0);
  }, [marketplace, range.start, range.end]);

  // Marketplace by month for table
  const mktByMonth = useMemo(() => {
    const map: Record<string, number> = {};
    if (!marketplace) return map;
    for (const d of marketplace.days) {
      if (d.date < range.start || d.date > range.end) continue;
      const ym = d.date.substring(0, 7);
      map[ym] = (map[ym] ?? 0) + d.net;
    }
    return map;
  }, [marketplace, range.start, range.end]);

  // ── Total revenue ──────────────────────────────────────────────────
  const totalRevenue = shopify.net + mktRevenue;

  // ── Ad spend totals ────────────────────────────────────────────────
  const adSpend = useMemo(() => {
    function inRange(m: string) { return m >= range.startYM && m <= range.endYM; }
    const google    = googleRaw.filter(m => inRange(m.month)).reduce((s, m) => s + m.totalSpend, 0);
    const googleRev = googleRaw.filter(m => inRange(m.month)).reduce((s, m) => s + m.totalConvValue, 0);
    const bing      = bingRaw.filter(m => inRange(m.month)).reduce((s, r) => s + r.cost, 0);
    const meta      = metaRaw.filter(m => inRange(m.month)).reduce((s, r) => s + r.cost, 0);
    const amazon    = amazonRaw.filter(m => inRange(m.month)).reduce((s, r) => s + r.cost, 0);
    const connexity = connexityRaw.filter(m => inRange(m.month)).reduce((s, r) => s + r.cost, 0);
    const pinterest = pinterestRaw.filter(m => inRange(m.month)).reduce((s, r) => s + r.cost, 0);
    const tiktok    = tiktokRaw.filter(m => inRange(m.month)).reduce((s, r) => s + r.cost, 0);
    const total = google + bing + meta + amazon + connexity + pinterest + tiktok;
    return { google, googleRev, bing, meta, amazon, connexity, pinterest, tiktok, total };
  }, [googleRaw, bingRaw, metaRaw, amazonRaw, connexityRaw, pinterestRaw, tiktokRaw, range.startYM, range.endYM]);

  // ── Efficiency metrics ─────────────────────────────────────────────
  const MER  = adSpend.total > 0 ? totalRevenue / adSpend.total : 0;
  const CM   = (totalRevenue * MARGIN) - adSpend.total;
  const BE   = adSpend.total > 0 ? adSpend.total / MARGIN : 0;
  const adPct = totalRevenue > 0 ? (adSpend.total / totalRevenue) * 100 : 0;
  const googleROAS = adSpend.google > 0 ? adSpend.googleRev / adSpend.google : 0;

  // ── Monthly join table ─────────────────────────────────────────────
  const monthlyRows = useMemo(() => {
    function inRange(m: string) { return m >= range.startYM && m <= range.endYM; }

    // Build Google spend by month
    const gMap: Record<string, number> = {};
    for (const m of googleRaw) if (inRange(m.month)) gMap[m.month] = m.totalSpend;

    // Build manual spend by month
    const manualMap: Record<string, number> = {};
    for (const arr of [bingRaw, metaRaw, amazonRaw, connexityRaw, pinterestRaw, tiktokRaw]) {
      for (const r of arr) {
        if (inRange(r.month)) manualMap[r.month] = (manualMap[r.month] ?? 0) + r.cost;
      }
    }

    // Join with Shopify monthly
    return (salesData?.monthly ?? []).map(s => {
      const ym       = s.date;
      const mkt      = mktByMonth[ym] ?? 0;
      const spend    = (gMap[ym] ?? 0) + (manualMap[ym] ?? 0);
      const revenue  = s.netSales + mkt;
      const mer      = spend > 0 ? revenue / spend : 0;
      const cm       = (revenue * MARGIN) - spend;
      const adPctM   = revenue > 0 ? (spend / revenue) * 100 : 0;
      return { month: ym, gross: s.grossSales, discounts: s.discounts, returns: s.returns, net: s.netSales, mkt, revenue, spend, mer, cm, adPct: adPctM };
    });
  }, [salesData, googleRaw, bingRaw, metaRaw, amazonRaw, connexityRaw, pinterestRaw, tiktokRaw, mktByMonth, range.startYM, range.endYM]);

  // Channel mix (Shopify channels + marketplace)
  const channelTotal = shopify.prh + shopify.pro + shopify.phone + shopify.other + mktRevenue;
  const channels = [
    { label: "PRH",         value: shopify.prh,   color: "bg-blue-500" },
    { label: "Proline Pro", value: shopify.pro,   color: "bg-purple-500" },
    { label: "Phone",       value: shopify.phone,  color: "bg-teal-500" },
    { label: "Marketplace", value: mktRevenue,     color: "bg-orange-500" },
    { label: "Other",       value: shopify.other,  color: "bg-gray-500" },
  ].filter(c => c.value > 0);

  // Ad platform mix
  const platforms = [
    { label: "Google",     value: adSpend.google,    color: "bg-blue-500" },
    { label: "Bing",       value: adSpend.bing,       color: "bg-teal-500" },
    { label: "Meta",       value: adSpend.meta,       color: "bg-indigo-500" },
    { label: "Amazon",     value: adSpend.amazon,     color: "bg-orange-500" },
    { label: "Connexity",  value: adSpend.connexity,  color: "bg-purple-500" },
    { label: "Pinterest",  value: adSpend.pinterest,  color: "bg-pink-500" },
    { label: "TikTok",     value: adSpend.tiktok,     color: "bg-rose-500" },
  ].filter(p => p.value > 0);

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Performance Scorecard</h1>
          <p className="text-gray-400 mt-1">Revenue · Ad Spend · Efficiency — all sources combined</p>
        </div>
        <DateRangeDropdown value={rangeKey} onChange={setRangeKey} />
      </div>

      {loading && <div className="text-gray-400 py-8">Loading...</div>}

      {!loading && (
        <>
          {/* ── Row 1: Revenue health ─────────────────────────────── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            {[
              { label: "Gross Sales",      value: shopify.gross,     sub: "before discounts",            color: "text-white" },
              { label: "Discounts",        value: shopify.discounts,  sub: "promo codes & sales",         color: "text-red-400", neg: true },
              { label: "Returns",          value: shopify.returns,    sub: "refunded orders",             color: "text-red-400", neg: true },
              { label: "Net Sales",        value: shopify.net,        sub: "Shopify after adj.",          color: "text-white" },
            ].map(c => (
              <div key={c.label} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">{c.label}</div>
                <div className={`text-xl font-bold ${c.color}`}>{c.neg ? `(${fmt(c.value)})` : fmt(c.value)}</div>
                <div className="text-xs text-gray-600 mt-1">{c.sub}</div>
              </div>
            ))}
          </div>

          {/* ── Row 2: Efficiency KPIs ────────────────────────────── */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Total Revenue</div>
              <div className="text-xl font-bold text-white">{fmt(totalRevenue)}</div>
              <div className="text-xs text-gray-600 mt-1">net + {fmt(mktRevenue)} mktpl</div>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Total Ad Spend</div>
              <div className="text-xl font-bold text-white">{fmt(adSpend.total)}</div>
              <div className="text-xs text-gray-600 mt-1">{platforms.length} platforms</div>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Blended MER</div>
              <div className={`text-xl font-bold ${merColor(MER)}`}>{fmtX(MER)}</div>
              <div className="text-xs text-gray-600 mt-1">revenue ÷ spend</div>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Contribution Margin</div>
              <div className={`text-xl font-bold ${cmColor(CM)}`}>{fmt(CM)}</div>
              <div className="text-xs text-gray-600 mt-1">rev × 40% − spend</div>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Ad Spend %</div>
              <div className={`text-xl font-bold ${pctColor(adPct)}`}>{adPct > 0 ? fmtP(adPct) : "—"}</div>
              <div className="text-xs text-gray-600 mt-1">spend ÷ revenue</div>
            </div>
          </div>

          {/* ── Revenue Waterfall ─────────────────────────────────── */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl mb-6 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-800">
              <h2 className="text-sm font-semibold text-white">Revenue Waterfall</h2>
              <p className="text-xs text-gray-500 mt-0.5">Where every dollar goes — from gross sales to profit after ads</p>
            </div>
            <div className="py-3 space-y-0.5">
              <WaterfallRow label="Gross Sales"       value={shopify.gross}     base={shopify.gross} isBold />
              <WaterfallRow label="Discounts"         value={shopify.discounts}  base={shopify.gross} isNegative />
              <WaterfallRow label="Returns"           value={shopify.returns}    base={shopify.gross} isNegative />
              <WaterfallRow label="Net Sales"         value={shopify.net}        base={shopify.gross} isBold isResult />
              <WaterfallRow label="Marketplace"       value={mktRevenue}         base={shopify.gross} note="add-on" />
              <WaterfallRow label="Total Revenue"     value={totalRevenue}       base={shopify.gross} isBold isResult />
              <WaterfallRow label="Total Ad Spend"    value={adSpend.total}      base={shopify.gross} isNegative />
              <WaterfallRow label="Contribution Margin" value={CM}              base={shopify.gross} isBold isResult={CM >= 0} isNegative={CM < 0} />
            </div>
            <div className="px-6 py-3 border-t border-gray-800 flex gap-6 text-xs text-gray-500">
              <span>Breakeven revenue: <span className="text-white font-medium">{fmt(BE)}</span></span>
              <span>Google ROAS: <span className={`font-medium ${merColor(googleROAS)}`}>{fmtX(googleROAS)}</span></span>
              <span>Margin assumption: <span className="text-white font-medium">40%</span></span>
            </div>
          </div>

          {/* ── Channel & Ad Mix (two columns) ────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
            {/* Revenue by channel */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <h2 className="text-sm font-semibold text-white mb-4">Revenue by Channel</h2>
              <div className="space-y-3">
                {channels.map(c => {
                  const pct = channelTotal > 0 ? (c.value / channelTotal) * 100 : 0;
                  return (
                    <div key={c.label} className="flex items-center gap-3">
                      <div className="w-24 text-xs text-gray-400 flex-shrink-0 flex items-center gap-1.5">
                        <span className={`w-2 h-2 rounded-full ${c.color} flex-shrink-0`} />
                        {c.label}
                      </div>
                      <div className="flex-1 bg-gray-800 rounded-full h-2">
                        <div className={`${c.color} rounded-full h-2`} style={{ width: `${pct}%` }} />
                      </div>
                      <div className="w-20 text-right text-xs text-white font-medium">{fmt(c.value)}</div>
                      <div className="w-10 text-right text-xs text-gray-500">{fmtP(pct)}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Ad spend by platform */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <h2 className="text-sm font-semibold text-white mb-4">Ad Spend by Platform</h2>
              <div className="space-y-3">
                {platforms.map(p => {
                  const pct = adSpend.total > 0 ? (p.value / adSpend.total) * 100 : 0;
                  return (
                    <div key={p.label} className="flex items-center gap-3">
                      <div className="w-24 text-xs text-gray-400 flex-shrink-0 flex items-center gap-1.5">
                        <span className={`w-2 h-2 rounded-full ${p.color} flex-shrink-0`} />
                        {p.label}
                      </div>
                      <div className="flex-1 bg-gray-800 rounded-full h-2">
                        <div className={`${p.color} rounded-full h-2`} style={{ width: `${pct}%` }} />
                      </div>
                      <div className="w-20 text-right text-xs text-white font-medium">{fmt(p.value)}</div>
                      <div className="w-10 text-right text-xs text-gray-500">{fmtP(pct)}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* ── Customer health ───────────────────────────────────── */}
          {!acqLoading && acqData && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              {[
                { label: "Total Orders",     value: acqData.totalOrders.toLocaleString(),   sub: "in period",                  color: "text-white" },
                { label: "New Customers",    value: acqData.newCustomers.toLocaleString(),   sub: fmt(acqData.newRevenue) + " revenue",    color: "text-blue-400" },
                { label: "Repeat Customers", value: acqData.repeatCustomers.toLocaleString(), sub: fmt(acqData.repeatRevenue) + " revenue", color: "text-green-400" },
                { label: "Repeat Rate",      value: acqData.repeatRate > 0 ? fmtP(acqData.repeatRate * 100) : "—", sub: "repeat / (new + repeat)", color: acqData.repeatRate >= 0.3 ? "text-green-400" : "text-yellow-400" },
              ].map(c => (
                <div key={c.label} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                  <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">{c.label}</div>
                  <div className={`text-xl font-bold ${c.color}`}>{c.value}</div>
                  <div className="text-xs text-gray-600 mt-1">{c.sub}</div>
                </div>
              ))}
            </div>
          )}

          {/* ── Monthly table ─────────────────────────────────────── */}
          {monthlyRows.length > 0 && (
            <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-800">
                <h2 className="text-sm font-semibold text-white">Monthly Breakdown — {range.label}</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-gray-500 text-xs uppercase tracking-wider bg-gray-800/50 border-b border-gray-800">
                      <th className="py-3 px-4 text-left">Month</th>
                      <th className="py-3 px-4 text-right">Gross</th>
                      <th className="py-3 px-4 text-right text-red-400">Adj.</th>
                      <th className="py-3 px-4 text-right">Net Sales</th>
                      <th className="py-3 px-4 text-right text-orange-400">Mktpl</th>
                      <th className="py-3 px-4 text-right font-semibold text-white border-l border-gray-800">Total Rev</th>
                      <th className="py-3 px-4 text-right">Ad Spend</th>
                      <th className="py-3 px-4 text-right">MER</th>
                      <th className="py-3 px-4 text-right">Ad %</th>
                      <th className="py-3 px-4 text-right">Contribution</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800">
                    {monthlyRows.map(r => (
                      <tr key={r.month} className="text-gray-300 hover:bg-gray-800/40">
                        <td className="py-2.5 px-4 font-medium text-white">{r.month}</td>
                        <td className="py-2.5 px-4 text-right text-gray-400">{fmt(r.gross)}</td>
                        <td className="py-2.5 px-4 text-right text-red-400">{(r.discounts + r.returns) > 0 ? `(${fmt(r.discounts + r.returns)})` : "—"}</td>
                        <td className="py-2.5 px-4 text-right">{fmt(r.net)}</td>
                        <td className="py-2.5 px-4 text-right text-orange-400">{r.mkt > 0 ? fmt(r.mkt) : <span className="text-gray-600">—</span>}</td>
                        <td className="py-2.5 px-4 text-right font-semibold text-white border-l border-gray-800">{fmt(r.revenue)}</td>
                        <td className="py-2.5 px-4 text-right">{r.spend > 0 ? fmt(r.spend) : <span className="text-gray-600">—</span>}</td>
                        <td className={`py-2.5 px-4 text-right font-semibold ${merColor(r.mer)}`}>{fmtX(r.mer)}</td>
                        <td className={`py-2.5 px-4 text-right text-xs ${pctColor(r.adPct)}`}>{r.spend > 0 ? fmtP(r.adPct) : "—"}</td>
                        <td className={`py-2.5 px-4 text-right font-semibold ${cmColor(r.cm)}`}>{r.spend > 0 ? fmt(r.cm) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-gray-800/50 border-t border-gray-700 font-semibold text-white text-xs">
                      <td className="py-3 px-4 text-gray-400">Total</td>
                      <td className="py-3 px-4 text-right text-gray-400">{fmt(shopify.gross)}</td>
                      <td className="py-3 px-4 text-right text-red-400">{(shopify.discounts + shopify.returns) > 0 ? `(${fmt(shopify.discounts + shopify.returns)})` : "—"}</td>
                      <td className="py-3 px-4 text-right">{fmt(shopify.net)}</td>
                      <td className="py-3 px-4 text-right text-orange-400">{fmt(mktRevenue)}</td>
                      <td className="py-3 px-4 text-right border-l border-gray-800">{fmt(totalRevenue)}</td>
                      <td className="py-3 px-4 text-right">{fmt(adSpend.total)}</td>
                      <td className={`py-3 px-4 text-right ${merColor(MER)}`}>{fmtX(MER)}</td>
                      <td className={`py-3 px-4 text-right ${pctColor(adPct)}`}>{fmtP(adPct)}</td>
                      <td className={`py-3 px-4 text-right ${cmColor(CM)}`}>{fmt(CM)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
