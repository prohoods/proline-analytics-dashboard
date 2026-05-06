"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import DateRangeDropdown from "@/components/DateRangeDropdown";
import { RangeKey, getRange } from "@/lib/date-ranges";

const PROFIT_MARGIN = 0.40;

const fmtC = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
const fmtN = (n: number) => new Intl.NumberFormat("en-US").format(Math.round(n));

// ── types ──────────────────────────────────────────────────────────────────
interface PlatformSummary {
  name: string; spend: number; revenue: number; roas: number;
  hasError: boolean; href: string; color: string;
}
interface ShopifyData {
  summary: { grossRevenue: number; netRevenue: number; totalRefunds: number; totalOrders: number };
}
interface GoogleMonth { month: string; totalSpend: number; totalConvValue: number; }
interface SheetRow { month: string; cost: number; revenue: number; }
interface SheetData { totals: { cost: number; revenue: number; roas: number }; rows: SheetRow[]; }
interface MarketplaceDay { date: string; net: number; }
interface MarketplaceSummary { days: MarketplaceDay[]; }

// ── component ──────────────────────────────────────────────────────────────
export default function DashboardOverview() {
  const [rangeKey, setRangeKey] = useState<RangeKey>("30d");
  const range = getRange(rangeKey);

  const [shopify, setShopify] = useState<ShopifyData | null>(null);
  const [googleMonths, setGoogleMonths] = useState<GoogleMonth[]>([]);
  const [bing, setBing] = useState<SheetData | null>(null);
  const [meta, setMeta] = useState<SheetData | null>(null);
  const [amazon, setAmazon] = useState<SheetData | null>(null);
  const [connexity, setConnexity] = useState<SheetData | null>(null);
  const [pinterest, setPinterest] = useState<SheetData | null>(null);
  const [tiktok, setTiktok] = useState<SheetData | null>(null);
  const [marketplace, setMarketplace] = useState<MarketplaceSummary | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  // Marketplace fetched once — filtered client-side by range
  useEffect(() => {
    fetch("/api/sheets/marketplace")
      .then(r => r.json())
      .then(d => { if (!d.error) setMarketplace(d); })
      .catch(() => {/* non-fatal */});
  }, []);

  const fetchAll = useCallback(() => {
    setLoading(true);
    setShopify(null); setGoogleMonths([]); setBing(null); setMeta(null);
    setAmazon(null); setConnexity(null); setPinterest(null); setTiktok(null);

    const r = getRange(rangeKey);
    const errs: Record<string, string> = {};

    function filterSheet(data: { rows: SheetRow[]; totals: { cost: number; revenue: number; roas: number } }): SheetData {
      // Non-Google sheets only track cost — row.revenue is undefined on those
      // and `s + undefined` becomes NaN. Coerce to 0 so Blended ROAS, ROAS
      // cards, and totals stay numeric.
      const rows = data.rows.filter(row => row.month >= r.startYM && row.month <= r.endYM);
      const cost = rows.reduce((s, row) => s + (row.cost ?? 0), 0);
      const revenue = rows.reduce((s, row) => s + (row.revenue ?? 0), 0);
      return { totals: { cost, revenue, roas: cost > 0 ? revenue / cost : 0 }, rows };
    }

    Promise.allSettled([
      fetch(`/api/shopify/orders?start=${r.start}&end=${r.end}`)
        .then(res => res.json()).then(d => { if (d.error) throw new Error(d.error); setShopify(d); }),
      fetch(`/api/google-ads/campaigns?start=${r.start}&end=${r.end}`)
        .then(res => res.json()).then(d => { if (d.error) throw new Error(d.error); setGoogleMonths(Array.isArray(d) ? d : []); }),
      fetch("/api/sheets/bing").then(res => res.json()).then(d => { if (d.error) throw new Error(d.error); setBing(filterSheet(d)); }),
      fetch("/api/sheets/meta").then(res => res.json()).then(d => { if (d.error) throw new Error(d.error); setMeta(filterSheet(d)); }),
      fetch("/api/sheets/amazon-ads").then(res => res.json()).then(d => { if (d.error) throw new Error(d.error); setAmazon(filterSheet(d)); }),
      fetch("/api/sheets/connexity").then(res => res.json()).then(d => { if (d.error) throw new Error(d.error); setConnexity(filterSheet(d)); }),
      fetch("/api/sheets/pinterest").then(res => res.json()).then(d => { if (d.error) throw new Error(d.error); setPinterest(filterSheet(d)); }),
      fetch("/api/sheets/tiktok").then(res => res.json()).then(d => { if (d.error) throw new Error(d.error); setTiktok(filterSheet(d)); }),
    ]).then(results => {
      const keys = ["shopify", "google", "bing", "meta", "amazon", "connexity", "pinterest", "tiktok"];
      results.forEach((res, i) => { if (res.status === "rejected") errs[keys[i]] = res.reason?.message ?? "Failed"; });
      setErrors(errs);
      setLoading(false);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangeKey]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ── Google Ads: sum months in range ──────────────────────────────────────
  const googleSpend = googleMonths
    .filter(m => m.month >= range.startYM && m.month <= range.endYM)
    .reduce((s, m) => s + m.totalSpend, 0);
  const googleRevenue = googleMonths
    .filter(m => m.month >= range.startYM && m.month <= range.endYM)
    .reduce((s, m) => s + m.totalConvValue, 0);

  // ── Marketplace revenue filtered to selected range ────────────────────────
  const marketplaceRevenue = (marketplace?.days ?? [])
    .filter(d => d.date >= range.start && d.date <= range.end)
    .reduce((s, d) => s + d.net, 0);

  // ── Derived ───────────────────────────────────────────────────────────────
  const shopifyRevenue = shopify?.summary.netRevenue ?? 0;
  const shopifyGross = shopify?.summary.grossRevenue ?? 0;
  const shopifyRefunds = shopify?.summary.totalRefunds ?? 0;
  const shopifyOrders = shopify?.summary.totalOrders ?? 0;
  const bingSpend = bing?.totals.cost ?? 0;
  const bingRevenue = bing?.totals.revenue ?? 0;
  const metaSpend = meta?.totals.cost ?? 0;
  const metaRevenue = meta?.totals.revenue ?? 0;
  const amazonSpend = amazon?.totals.cost ?? 0;
  const amazonRevenue = amazon?.totals.revenue ?? 0;
  const connexitySpend = connexity?.totals.cost ?? 0;
  const connexityRevenue = connexity?.totals.revenue ?? 0;
  const pinterestSpend = pinterest?.totals.cost ?? 0;
  const pinterestRevenue = pinterest?.totals.revenue ?? 0;
  const tiktokSpend = tiktok?.totals.cost ?? 0;
  const tiktokRevenue = tiktok?.totals.revenue ?? 0;

  const totalAdSpend = googleSpend + bingSpend + metaSpend + amazonSpend + connexitySpend + pinterestSpend + tiktokSpend;
  const totalAdRevenue = googleRevenue + bingRevenue + metaRevenue + amazonRevenue + connexityRevenue + pinterestRevenue + tiktokRevenue;
  const blendedROAS = totalAdSpend > 0 ? totalAdRevenue / totalAdSpend : 0;
  const totalRevenue = shopifyRevenue + marketplaceRevenue;
  const mer = totalAdSpend > 0 ? totalRevenue / totalAdSpend : 0;
  const contributionMargin = (totalRevenue * PROFIT_MARGIN) - totalAdSpend;
  const breakeven = totalAdSpend > 0 ? totalAdSpend / PROFIT_MARGIN : 0;

  const platforms: PlatformSummary[] = [
    { name: "Google Ads", spend: googleSpend, revenue: googleRevenue, roas: googleSpend > 0 ? googleRevenue / googleSpend : 0, hasError: !!errors.google, href: "/dashboard/google-ads", color: "bg-blue-500" },
    { name: "Bing / Microsoft", spend: bingSpend, revenue: bingRevenue, roas: bingSpend > 0 ? bingRevenue / bingSpend : 0, hasError: !!errors.bing, href: "/dashboard/bing", color: "bg-teal-500" },
    { name: "Meta", spend: metaSpend, revenue: metaRevenue, roas: metaSpend > 0 ? metaRevenue / metaSpend : 0, hasError: !!errors.meta, href: "/dashboard/meta", color: "bg-indigo-500" },
    { name: "Amazon Ads", spend: amazonSpend, revenue: amazonRevenue, roas: amazonSpend > 0 ? amazonRevenue / amazonSpend : 0, hasError: !!errors.amazon, href: "/dashboard/amazon-ads", color: "bg-orange-500" },
    { name: "Connexity", spend: connexitySpend, revenue: connexityRevenue, roas: connexitySpend > 0 ? connexityRevenue / connexitySpend : 0, hasError: !!errors.connexity, href: "/dashboard/connexity", color: "bg-purple-500" },
    { name: "Pinterest", spend: pinterestSpend, revenue: pinterestRevenue, roas: pinterestSpend > 0 ? pinterestRevenue / pinterestSpend : 0, hasError: !!errors.pinterest, href: "/dashboard/pinterest", color: "bg-red-500" },
    { name: "TikTok", spend: tiktokSpend, revenue: tiktokRevenue, roas: tiktokSpend > 0 ? tiktokRevenue / tiktokSpend : 0, hasError: !!errors.tiktok, href: "/dashboard/tiktok", color: "bg-rose-500" },
  ];

  const roasColor = (r: number) => r >= 5 ? "text-green-400" : r >= 3 ? "text-yellow-400" : r > 0 ? "text-red-400" : "text-gray-600";

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Overview</h1>
          <p className="text-gray-400 mt-1">Proline Range Hoods — {range.label}</p>
        </div>

        <DateRangeDropdown value={rangeKey} onChange={setRangeKey} />
      </div>

      {/* Top KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-gray-500 uppercase tracking-wider">Net Revenue</span>
            {errors.shopify && <span className="text-xs text-red-400">error</span>}
          </div>
          {loading ? <div className="h-8 bg-gray-800 rounded animate-pulse mt-1" /> : (
            <>
              <div className="text-2xl font-bold text-white mt-1">{fmtC(totalRevenue)}</div>
              <div className="text-xs text-gray-500 mt-1">
                {fmtC(shopifyRevenue)} Shopify · {fmtC(marketplaceRevenue)} marketplaces
              </div>
            </>
          )}
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-gray-500 uppercase tracking-wider">Total Ad Spend</span>
          </div>
          {loading ? <div className="h-8 bg-gray-800 rounded animate-pulse mt-1" /> : (
            <>
              <div className="text-2xl font-bold text-white mt-1">{fmtC(totalAdSpend)}</div>
              <div className="text-xs text-gray-500 mt-1">{platforms.filter(p => p.spend > 0).length} active platforms</div>
            </>
          )}
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-gray-500 uppercase tracking-wider">Blended ROAS</span>
            <span className="text-xs text-gray-600">Ad rev / spend</span>
          </div>
          {loading ? <div className="h-8 bg-gray-800 rounded animate-pulse mt-1" /> : (
            <>
              <div className={`text-2xl font-bold mt-1 ${roasColor(blendedROAS)}`}>{blendedROAS > 0 ? `${blendedROAS.toFixed(2)}x` : "—"}</div>
              <div className="text-xs text-gray-500 mt-1">{fmtC(totalAdRevenue)} attributed revenue</div>
            </>
          )}
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-gray-500 uppercase tracking-wider">MER</span>
            <span className="text-xs text-gray-600">Net rev / ad spend</span>
          </div>
          {loading ? <div className="h-8 bg-gray-800 rounded animate-pulse mt-1" /> : (
            <>
              <div className={`text-2xl font-bold mt-1 ${roasColor(mer)}`}>{mer > 0 ? `${mer.toFixed(2)}x` : "—"}</div>
              <div className="text-xs text-gray-500 mt-1">{fmtN(shopifyOrders)} orders</div>
            </>
          )}
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-gray-500 uppercase tracking-wider">Contribution Margin</span>
            <span className="text-xs text-gray-600">40% margin</span>
          </div>
          {loading ? <div className="h-8 bg-gray-800 rounded animate-pulse mt-1" /> : (
            <>
              <div className={`text-2xl font-bold mt-1 ${contributionMargin >= 0 ? "text-green-400" : "text-red-400"}`}>
                {totalAdSpend > 0 ? fmtC(contributionMargin) : "—"}
              </div>
              <div className="text-xs text-gray-500 mt-1">Net rev × 40% − ad spend</div>
            </>
          )}
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-gray-500 uppercase tracking-wider">Breakeven Revenue</span>
            <span className="text-xs text-gray-600">Ad spend ÷ 40%</span>
          </div>
          {loading ? <div className="h-8 bg-gray-800 rounded animate-pulse mt-1" /> : (
            <>
              <div className="text-2xl font-bold text-white mt-1">{breakeven > 0 ? fmtC(breakeven) : "—"}</div>
              <div className={`text-xs mt-1 ${shopifyRevenue >= breakeven && breakeven > 0 ? "text-green-400" : "text-gray-500"}`}>
                {breakeven > 0 ? (shopifyRevenue >= breakeven ? `+${fmtC(shopifyRevenue - breakeven)} above` : `${fmtC(shopifyRevenue - breakeven)} below`) : "No spend data"}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Ad Spend by Platform */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-sm font-semibold text-white">Ad Spend by Platform</h2>
          <span className="text-xs text-gray-500">{fmtC(totalAdSpend)} total</span>
        </div>
        <div className="space-y-3">
          {platforms
            .filter(p => p.spend > 0 || loading)
            .sort((a, b) => b.spend - a.spend)
            .map(p => {
              const pct = totalAdSpend > 0 ? (p.spend / totalAdSpend) * 100 : 0;
              return (
                <Link key={p.name} href={p.href} className="flex items-center gap-4 group">
                  <div className="w-36 text-sm text-gray-400 group-hover:text-gray-200 transition-colors flex-shrink-0 flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${p.color}`} />
                    {p.name}
                  </div>
                  <div className="flex-1 bg-gray-800 rounded-full h-2">
                    {loading
                      ? <div className="bg-gray-700 rounded-full h-2 w-full animate-pulse" />
                      : <div className={`${p.color} rounded-full h-2 transition-all`} style={{ width: `${pct}%` }} />
                    }
                  </div>
                  <div className="w-24 text-right text-sm font-medium text-white">
                    {loading ? <span className="text-gray-600">—</span> : fmtC(p.spend)}
                  </div>
                  <div className="w-12 text-right text-xs text-gray-500">
                    {loading ? "" : `${pct.toFixed(1)}%`}
                  </div>
                  <div className={`w-16 text-right text-xs font-semibold ${p.hasError ? "text-red-400" : roasColor(p.roas)}`}>
                    {loading ? "—" : p.hasError ? "error" : p.roas > 0 ? `${p.roas.toFixed(2)}x` : "—"}
                  </div>
                </Link>
              );
            })}
          {!loading && platforms.every(p => p.spend === 0) && (
            <p className="text-gray-500 text-sm text-center py-4">No ad spend data for this period</p>
          )}
        </div>
      </div>

      {/* Platform Cards Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        {platforms.map(p => (
          <Link key={p.name} href={p.href} className="bg-gray-900 border border-gray-800 rounded-xl p-5 hover:border-gray-700 transition-colors">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${p.color}`} />
                <span className="text-sm font-semibold text-white">{p.name}</span>
              </div>
              {p.hasError && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-red-900/40 text-red-400">error</span>
              )}
            </div>
            {loading ? (
              <div className="space-y-2">
                <div className="h-6 bg-gray-800 rounded animate-pulse" />
                <div className="h-4 bg-gray-800 rounded animate-pulse w-2/3" />
              </div>
            ) : (
              <>
                <div className="text-xl font-bold text-white">{fmtC(p.spend)}</div>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-xs text-gray-500">{fmtC(p.revenue)} revenue</span>
                  <span className={`text-xs font-semibold ${roasColor(p.roas)}`}>{p.roas > 0 ? `${p.roas.toFixed(2)}x` : "—"}</span>
                </div>
              </>
            )}
          </Link>
        ))}
      </div>

      {/* Shopify snapshot */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-white">Shopify — {range.label}</h2>
          {errors.shopify && <span className="text-xs text-red-400">{errors.shopify}</span>}
        </div>
        {loading ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => <div key={i} className="h-16 bg-gray-800 rounded animate-pulse" />)}
          </div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: "Gross Revenue", value: fmtC(shopifyGross) },
              { label: "Refunds", value: fmtC(shopifyRefunds), red: shopifyRefunds > 0 },
              { label: "Net Revenue", value: fmtC(shopifyRevenue), highlight: true },
              { label: "Orders", value: fmtN(shopifyOrders) },
            ].map(m => (
              <div key={m.label} className="bg-gray-800/50 rounded-lg p-4">
                <div className="text-xs text-gray-500 mb-1">{m.label}</div>
                <div className={`text-lg font-bold ${m.highlight ? "text-blue-400" : m.red ? "text-red-400" : "text-white"}`}>{m.value}</div>
              </div>
            ))}
          </div>
        )}
        <div className="mt-4 flex gap-3">
          <Link href="/dashboard/sales" className="text-xs text-blue-400 hover:text-blue-300 transition-colors">Daily & Monthly Sales →</Link>
          <Link href="/dashboard/refunds" className="text-xs text-gray-400 hover:text-gray-300 transition-colors">Refunds →</Link>
          <Link href="/dashboard/customers" className="text-xs text-gray-400 hover:text-gray-300 transition-colors">Customer Insights →</Link>
        </div>
      </div>
    </div>
  );
}
