"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

// ── helpers ────────────────────────────────────────────────────────────────
const fmtC = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
const fmtN = (n: number) => new Intl.NumberFormat("en-US").format(Math.round(n));

function currentMonth() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const last = new Date(y, now.getMonth() + 1, 0).getDate();
  return {
    label: now.toLocaleString("default", { month: "long", year: "numeric" }),
    start: `${y}-${m}-01`,
    end: `${y}-${m}-${String(last).padStart(2, "0")}`,
    ym: `${y}-${m}`,
    year: String(y),
  };
}

// ── types ──────────────────────────────────────────────────────────────────
interface PlatformSummary {
  name: string;
  spend: number;
  revenue: number;
  roas: number;
  status: "live" | "manual" | "error" | "loading";
  href: string;
  color: string;
}

interface ShopifyData {
  summary: { grossRevenue: number; netRevenue: number; totalRefunds: number; totalOrders: number };
}
interface GoogleMonth { month: string; totalSpend: number; totalConvValue: number; totalClicks: number; }
interface SheetData { totals: { cost: number; revenue: number; roas: number }; rows: { month: string }[]; }

// ── component ──────────────────────────────────────────────────────────────
export default function DashboardOverview() {
  const mo = currentMonth();

  // Raw data states
  const [shopify, setShopify] = useState<ShopifyData | null>(null);
  const [googleAds, setGoogleAds] = useState<GoogleMonth | null>(null);
  const [bing, setBing] = useState<SheetData | null>(null);
  const [meta, setMeta] = useState<SheetData | null>(null);
  const [amazon, setAmazon] = useState<SheetData | null>(null);
  const [connexity, setConnexity] = useState<SheetData | null>(null);
  const [pinterest, setPinterest] = useState<SheetData | null>(null);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const errs: Record<string, string> = {};

    // Filter sheet data to current month
    function monthTotals(data: { rows: { month: string; cost: number; revenue: number }[]; totals: { cost: number; revenue: number; roas: number } }): SheetData {
      const rows = data.rows.filter((r) => r.month === mo.ym);
      const cost = rows.reduce((s, r) => s + r.cost, 0);
      const revenue = rows.reduce((s, r) => s + r.revenue, 0);
      return { totals: { cost, revenue, roas: cost > 0 ? revenue / cost : 0 }, rows };
    }

    Promise.allSettled([
      // Shopify MTD
      fetch(`/api/shopify/orders?start=${mo.start}&end=${mo.end}`)
        .then(r => r.json()).then(d => { if (d.error) throw new Error(d.error); setShopify(d); }),

      // Google Ads — current year, we'll find current month
      fetch(`/api/google-ads/campaigns?year=${mo.year}`)
        .then(r => r.json()).then(d => {
          if (d.error) throw new Error(d.error);
          const months: GoogleMonth[] = Array.isArray(d) ? d : [];
          const cur = months.find(m => m.month === mo.ym) ?? null;
          setGoogleAds(cur);
        }),

      // Manual sheet platforms
      fetch("/api/sheets/bing").then(r => r.json()).then(d => { if (d.error) throw new Error(d.error); setBing(monthTotals(d)); }),
      fetch("/api/sheets/meta").then(r => r.json()).then(d => { if (d.error) throw new Error(d.error); setMeta(monthTotals(d)); }),
      fetch("/api/sheets/amazon-ads").then(r => r.json()).then(d => { if (d.error) throw new Error(d.error); setAmazon(monthTotals(d)); }),
      fetch("/api/sheets/connexity").then(r => r.json()).then(d => { if (d.error) throw new Error(d.error); setConnexity(monthTotals(d)); }),
      fetch("/api/sheets/pinterest").then(r => r.json()).then(d => { if (d.error) throw new Error(d.error); setPinterest(monthTotals(d)); }),
    ]).then((results) => {
      const keys = ["shopify", "google", "bing", "meta", "amazon", "connexity", "pinterest"];
      results.forEach((r, i) => {
        if (r.status === "rejected") errs[keys[i]] = r.reason?.message ?? "Failed";
      });
      setErrors(errs);
      setLoading(false);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── derived numbers ──────────────────────────────────────────────────────
  const shopifyRevenue = shopify?.summary.netRevenue ?? 0;
  const shopifyGross = shopify?.summary.grossRevenue ?? 0;
  const shopifyRefunds = shopify?.summary.totalRefunds ?? 0;
  const shopifyOrders = shopify?.summary.totalOrders ?? 0;

  const googleSpend = googleAds?.totalSpend ?? 0;
  const googleRevenue = googleAds?.totalConvValue ?? 0;
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

  const totalAdSpend = googleSpend + bingSpend + metaSpend + amazonSpend + connexitySpend + pinterestSpend;
  const totalAdRevenue = googleRevenue + bingRevenue + metaRevenue + amazonRevenue + connexityRevenue + pinterestRevenue;
  const blendedROAS = totalAdSpend > 0 ? totalAdRevenue / totalAdSpend : 0;
  const mer = totalAdSpend > 0 ? shopifyRevenue / totalAdSpend : 0; // Marketing Efficiency Ratio

  const platforms: PlatformSummary[] = [
    { name: "Google Ads", spend: googleSpend, revenue: googleRevenue, roas: googleSpend > 0 ? googleRevenue / googleSpend : 0, status: errors.google ? "error" : loading ? "loading" : "live", href: "/dashboard/google-ads", color: "bg-blue-500" },
    { name: "Bing / Microsoft", spend: bingSpend, revenue: bingRevenue, roas: bingSpend > 0 ? bingRevenue / bingSpend : 0, status: errors.bing ? "error" : loading ? "loading" : "manual", href: "/dashboard/bing", color: "bg-teal-500" },
    { name: "Meta", spend: metaSpend, revenue: metaRevenue, roas: metaSpend > 0 ? metaRevenue / metaSpend : 0, status: errors.meta ? "error" : loading ? "loading" : "manual", href: "/dashboard/meta", color: "bg-indigo-500" },
    { name: "Amazon Ads", spend: amazonSpend, revenue: amazonRevenue, roas: amazonSpend > 0 ? amazonRevenue / amazonSpend : 0, status: errors.amazon ? "error" : loading ? "loading" : "manual", href: "/dashboard/amazon-ads", color: "bg-orange-500" },
    { name: "Connexity", spend: connexitySpend, revenue: connexityRevenue, roas: connexitySpend > 0 ? connexityRevenue / connexitySpend : 0, status: errors.connexity ? "error" : loading ? "loading" : "manual", href: "/dashboard/connexity", color: "bg-purple-500" },
    { name: "Pinterest", spend: pinterestSpend, revenue: pinterestRevenue, roas: pinterestSpend > 0 ? pinterestRevenue / pinterestSpend : 0, status: errors.pinterest ? "error" : loading ? "loading" : "manual", href: "/dashboard/pinterest", color: "bg-red-500" },
  ];

  const roasColor = (r: number) => r >= 5 ? "text-green-400" : r >= 3 ? "text-yellow-400" : r > 0 ? "text-red-400" : "text-gray-600";

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Overview</h1>
          <p className="text-gray-400 mt-1">Proline Range Hoods — {mo.label}</p>
        </div>
        <div className="flex gap-2 text-xs">
          <span className="inline-flex items-center gap-1.5 bg-green-900/20 border border-green-700/30 rounded-lg px-2.5 py-1.5 text-green-400">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400" /> Live
          </span>
          <span className="inline-flex items-center gap-1.5 bg-yellow-900/20 border border-yellow-700/30 rounded-lg px-2.5 py-1.5 text-yellow-400">
            <span className="w-1.5 h-1.5 rounded-full bg-yellow-400" /> Manual
          </span>
        </div>
      </div>

      {/* Top KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {/* Shopify Revenue */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-gray-500 uppercase tracking-wider">Net Revenue</span>
            <span className="w-1.5 h-1.5 rounded-full bg-green-400" title="Live — Shopify" />
          </div>
          {loading ? <div className="h-8 bg-gray-800 rounded animate-pulse mt-1" /> : (
            <>
              <div className="text-2xl font-bold text-white mt-1">{fmtC(shopifyRevenue)}</div>
              <div className="text-xs text-gray-500 mt-1">{fmtC(shopifyGross)} gross · {fmtC(shopifyRefunds)} refunds</div>
            </>
          )}
        </div>

        {/* Total Ad Spend */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-gray-500 uppercase tracking-wider">Total Ad Spend</span>
            <span className="text-xs text-gray-600">All platforms</span>
          </div>
          {loading ? <div className="h-8 bg-gray-800 rounded animate-pulse mt-1" /> : (
            <>
              <div className="text-2xl font-bold text-white mt-1">{fmtC(totalAdSpend)}</div>
              <div className="text-xs text-gray-500 mt-1">{platforms.filter(p => p.spend > 0).length} active platforms</div>
            </>
          )}
        </div>

        {/* Blended ROAS */}
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

        {/* MER */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-gray-500 uppercase tracking-wider">MER</span>
            <span className="text-xs text-gray-600">Net rev / ad spend</span>
          </div>
          {loading ? <div className="h-8 bg-gray-800 rounded animate-pulse mt-1" /> : (
            <>
              <div className={`text-2xl font-bold mt-1 ${roasColor(mer)}`}>{mer > 0 ? `${mer.toFixed(2)}x` : "—"}</div>
              <div className="text-xs text-gray-500 mt-1">{shopifyOrders} orders this month</div>
            </>
          )}
        </div>
      </div>

      {/* Ad Spend by Platform */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-sm font-semibold text-white">Ad Spend by Platform — {mo.label}</h2>
          <span className="text-xs text-gray-500">{fmtC(totalAdSpend)} total</span>
        </div>
        <div className="space-y-3">
          {platforms
            .filter(p => p.spend > 0 || p.status === "loading")
            .sort((a, b) => b.spend - a.spend)
            .map(p => {
              const pct = totalAdSpend > 0 ? (p.spend / totalAdSpend) * 100 : 0;
              return (
                <Link key={p.name} href={p.href} className="flex items-center gap-4 group">
                  <div className="w-32 text-sm text-gray-400 group-hover:text-gray-200 transition-colors flex-shrink-0 flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${p.color}`} />
                    {p.name}
                  </div>
                  <div className="flex-1 bg-gray-800 rounded-full h-2">
                    <div className={`${p.color} rounded-full h-2 transition-all`} style={{ width: `${pct}%` }} />
                  </div>
                  <div className="w-24 text-right text-sm font-medium text-white">{fmtC(p.spend)}</div>
                  <div className="w-12 text-right text-xs text-gray-500">{pct.toFixed(1)}%</div>
                  <div className={`w-16 text-right text-xs font-semibold ${roasColor(p.roas)}`}>
                    {p.roas > 0 ? `${p.roas.toFixed(2)}x` : "—"}
                  </div>
                </Link>
              );
            })}
          {!loading && platforms.every(p => p.spend === 0) && (
            <p className="text-gray-500 text-sm text-center py-4">No ad spend data for {mo.label} yet</p>
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
              <span className={`text-xs px-2 py-0.5 rounded-full ${
                p.status === "live" ? "bg-green-900/40 text-green-400" :
                p.status === "manual" ? "bg-yellow-900/40 text-yellow-400" :
                p.status === "error" ? "bg-red-900/40 text-red-400" :
                "bg-gray-800 text-gray-500"
              }`}>
                {p.status === "loading" ? "..." : p.status}
              </span>
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
          <h2 className="text-sm font-semibold text-white">Shopify Snapshot — {mo.label}</h2>
          <div className="flex items-center gap-1.5 text-xs text-green-400">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400" /> Live
          </div>
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
