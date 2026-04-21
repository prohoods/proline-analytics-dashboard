"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import DateRangeDropdown from "@/components/DateRangeDropdown";
import { RangeKey, getRange } from "@/lib/date-ranges";
import { KPISkeleton, TableSkeleton } from "@/components/Skeleton";
import { exportToCSV } from "@/lib/export-csv";

interface AdProduct {
  productItemId: string;
  productTitle: string;
  sku: string | null;
  variantId: string;
  adSpend: number;
  adRevenue: number;
  conversions: number;
  clicks: number;
  impressions: number;
  roas: number | null;
  ctr: number;
  cpc: number | null;
  cvr: number;
  costPerUnit: number | null;
}

interface Summary {
  totalSpend: number;
  totalAdRevenue: number;
  totalRoas: number;
  totalClicks: number;
  totalImpressions: number;
  totalConversions: number;
  productCount: number;
  matchedCount: number;
}

const fmt = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
const fmt2 = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
const fmtN = (n: number) => new Intl.NumberFormat("en-US").format(Math.round(n));
const fmtPct = (n: number) => (n * 100).toFixed(1) + "%";

type SortKey = "adSpend" | "adRevenue" | "roas" | "clicks" | "conversions" | "ctr" | "cpc";

function RoasBadge({ roas, large }: { roas: number | null; large?: boolean }) {
  if (roas === null) return <span className="text-gray-600">—</span>;
  const color = roas >= 4 ? "text-green-400" : roas >= 2 ? "text-yellow-400" : "text-red-400";
  return <span className={`font-semibold ${color} ${large ? "text-2xl" : ""}`}>{roas.toFixed(2)}x</span>;
}

function MetricCard({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="bg-gray-800/60 rounded-lg p-3">
      <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">{label}</div>
      <div className="text-lg font-bold text-white">{value}</div>
      {sub && <div className="text-xs text-gray-500 mt-0.5">{sub}</div>}
    </div>
  );
}

function ProductDetailPanel({ product, onClose, totalSpend }: {
  product: AdProduct;
  onClose: () => void;
  totalSpend: number;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const spendShare = totalSpend > 0 ? (product.adSpend / totalSpend) * 100 : 0;
  const estimatedProfit = product.costPerUnit != null && product.conversions > 0
    ? product.adRevenue - product.adSpend - product.costPerUnit * product.conversions
    : null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-40 backdrop-blur-sm"
        onClick={onClose}
      />
      {/* Panel */}
      <div className="fixed right-0 top-0 h-full w-full max-w-md bg-gray-900 border-l border-gray-700 z-50 overflow-y-auto shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 bg-gray-900 border-b border-gray-800 px-5 py-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Product Detail</div>
            <div className="text-white font-semibold text-sm leading-snug">{product.productTitle}</div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors flex-shrink-0 mt-0.5"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-5 py-5 space-y-5">
          {/* Identity */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500 uppercase tracking-wide">SKU</span>
              {product.sku
                ? <span className="font-mono text-sm text-white font-medium">{product.sku}</span>
                : <span className="text-xs text-gray-600 italic">Not matched — variant may be deleted</span>
              }
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500 uppercase tracking-wide">Shopify Variant ID</span>
              <span className="font-mono text-xs text-gray-400">{product.variantId || "—"}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500 uppercase tracking-wide">Google Item ID</span>
              <span className="font-mono text-xs text-gray-500 truncate max-w-[200px]">{product.productItemId}</span>
            </div>
            {product.variantId && (
              <a
                href={`https://admin.shopify.com/store/861fdb/variants/${product.variantId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 transition-colors mt-1"
              >
                View variant in Shopify Admin
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
              </a>
            )}
          </div>

          <div className="border-t border-gray-800" />

          {/* Spend & Revenue */}
          <div>
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-3">Spend & Revenue</div>
            <div className="grid grid-cols-2 gap-2.5">
              <MetricCard label="Ad Spend" value={fmt(product.adSpend)} sub={`${spendShare.toFixed(1)}% of total`} />
              <MetricCard label="Ad Revenue" value={fmt(product.adRevenue)} />
              <MetricCard label="ROAS" value={<RoasBadge roas={product.roas} large />} sub="Revenue ÷ Spend" />
              <MetricCard label="Conversions" value={product.conversions.toFixed(1)} sub="Google-attributed" />
            </div>
          </div>

          {/* Engagement */}
          <div>
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-3">Engagement</div>
            <div className="grid grid-cols-2 gap-2.5">
              <MetricCard label="Clicks" value={fmtN(product.clicks)} />
              <MetricCard label="Impressions" value={fmtN(product.impressions)} />
              <MetricCard label="CTR" value={fmtPct(product.ctr)} sub="Clicks ÷ Impressions" />
              <MetricCard label="CPC" value={product.cpc != null ? fmt2(product.cpc) : "—"} sub="Spend ÷ Clicks" />
            </div>
          </div>

          {/* COGS & Profit */}
          <div>
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-3">Cost & Profitability</div>
            <div className="grid grid-cols-2 gap-2.5">
              <MetricCard
                label="COGS / Unit"
                value={product.costPerUnit != null ? fmt2(product.costPerUnit) : <span className="text-gray-500 text-base">No data</span>}
              />
              <MetricCard label="Conv. Rate" value={fmtPct(product.cvr)} sub="Conversions ÷ Clicks" />
              {estimatedProfit != null && (
                <div className="col-span-2 bg-gray-800/60 rounded-lg p-3">
                  <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Est. Net Profit</div>
                  <div className={`text-lg font-bold ${estimatedProfit >= 0 ? "text-green-400" : "text-red-400"}`}>
                    {fmt(estimatedProfit)}
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    Ad Revenue − Spend − (COGS × Conversions)
                  </div>
                </div>
              )}
            </div>
            {product.costPerUnit == null && (
              <p className="text-xs text-gray-600 mt-2">
                Add this SKU to the COGS sheet to see estimated net profit.
              </p>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function MethodologyNote() {
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 w-full px-5 py-3 text-left text-sm text-gray-400 hover:text-gray-200 transition-colors"
      >
        <svg className="w-4 h-4 text-blue-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
        <span className="font-medium text-gray-300">How this data is calculated</span>
        <svg className={`w-3 h-3 ml-auto transition-transform ${open ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
      </button>
      {open && (
        <div className="px-5 pb-5 grid grid-cols-1 md:grid-cols-2 gap-6 border-t border-gray-800 pt-4 text-sm text-gray-400">
          <div>
            <div className="text-white font-semibold mb-2">Metrics</div>
            <ul className="space-y-1.5">
              <li><span className="text-gray-200">Spend</span> — Total ad cost from Google Ads (Shopping + PMAX) in the selected period.</li>
              <li><span className="text-gray-200">Ad Revenue</span> — Conversion value attributed to this product by Google (last-click). Not total Shopify revenue.</li>
              <li><span className="text-gray-200">ROAS</span> — Ad Revenue ÷ Spend. A 4x ROAS means $4 attributed revenue per $1 spent.</li>
              <li><span className="text-gray-200">Conversions</span> — Number of purchases Google attributed to clicks on this product&apos;s ad.</li>
              <li><span className="text-gray-200">CTR</span> — Clicks ÷ Impressions.</li>
              <li><span className="text-gray-200">CPC</span> — Cost Per Click = Spend ÷ Clicks.</li>
              <li><span className="text-gray-200">COGS / Unit</span> — Our static cost per unit from the cost sheet.</li>
            </ul>
          </div>
          <div>
            <div className="text-white font-semibold mb-2">SKU Matching</div>
            <ul className="space-y-1.5">
              <li>Google embeds the Shopify variant ID in the product_item_id (e.g. <span className="font-mono text-xs text-gray-300">shopify_US_49014031024430</span>).</li>
              <li>We look that variant ID up against all current Shopify products to get the SKU.</li>
              <li>Products showing <span className="font-mono text-xs text-gray-300">—</span> have no matching variant in Shopify — this usually means the product variant was deleted or archived after it ran ads.</li>
              <li>Click any row to see the full product title, Shopify variant link, and estimated net profit.</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ProductAdsPage() {
  const [rangeKey, setRangeKey] = useState<RangeKey>("ytd");
  const [products, setProducts] = useState<AdProduct[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortKey>("adSpend");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [search, setSearch] = useState("");
  const [showUnmatched, setShowUnmatched] = useState(true);
  const [selected, setSelected] = useState<AdProduct | null>(null);

  useEffect(() => {
    const { start, end } = getRange(rangeKey);
    setLoading(true);
    setError(null);
    fetch(`/api/google-ads/products?start=${start}&end=${end}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) { setError(d.error); return; }
        setProducts(d.products ?? []);
        setSummary(d.summary ?? null);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [rangeKey]);

  function handleSort(key: SortKey) {
    if (sortBy === key) setSortDir(d => d === "desc" ? "asc" : "desc");
    else { setSortBy(key); setSortDir("desc"); }
  }

  const filtered = products
    .filter(p => {
      if (!showUnmatched && !p.sku) return false;
      if (search) {
        const q = search.toLowerCase();
        return p.productTitle.toLowerCase().includes(q) || (p.sku ?? "").toLowerCase().includes(q);
      }
      return true;
    })
    .sort((a, b) => {
      const av = (a[sortBy] as number | null) ?? (sortDir === "desc" ? -Infinity : Infinity);
      const bv = (b[sortBy] as number | null) ?? (sortDir === "desc" ? -Infinity : Infinity);
      return sortDir === "desc" ? bv - av : av - bv;
    });

  function SortIcon({ k }: { k: SortKey }) {
    if (sortBy !== k) return <span className="text-gray-600 ml-1">↕</span>;
    return <span className="text-blue-400 ml-1">{sortDir === "desc" ? "↓" : "↑"}</span>;
  }

  function handleExport() {
    if (!filtered.length) return;
    exportToCSV(filtered.map(p => ({
      sku: p.sku ?? "",
      product_title: p.productTitle,
      ad_spend: p.adSpend.toFixed(2),
      ad_revenue: p.adRevenue.toFixed(2),
      roas: p.roas != null ? p.roas.toFixed(2) : "",
      conversions: p.conversions,
      clicks: p.clicks,
      impressions: p.impressions,
      ctr: fmtPct(p.ctr),
      cpc: p.cpc != null ? p.cpc.toFixed(2) : "",
      cvr: fmtPct(p.cvr),
      cogs_per_unit: p.costPerUnit != null ? p.costPerUnit.toFixed(2) : "",
    })), `product-ads-${rangeKey}.csv`);
  }

  const th = "px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide whitespace-nowrap cursor-pointer hover:text-gray-200 select-none";

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
            <Link href="/dashboard/products" className="hover:text-gray-300">Product Profitability</Link>
            <span>/</span>
            <span className="text-gray-300">Ad Performance</span>
          </div>
          <h1 className="text-2xl font-bold text-white">Product Ad Performance</h1>
          <p className="text-gray-400 text-sm mt-1">Google Shopping & PMAX — spend, ROAS, and conversions by product</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <button onClick={handleExport} className="px-3 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm rounded-lg transition-colors">
            Export CSV
          </button>
          <DateRangeDropdown value={rangeKey} onChange={setRangeKey} />
        </div>
      </div>

      {error && <div className="bg-red-900/20 border border-red-700/30 rounded-xl p-4 text-red-400 text-sm">{error}</div>}

      <MethodologyNote />

      {loading && (
        <div className="space-y-6">
          <KPISkeleton count={4} />
          <KPISkeleton count={4} />
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <TableSkeleton rows={12} cols={8} />
          </div>
        </div>
      )}

      {!loading && !error && summary && (
        <>
          {/* KPI row 1 */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-gray-900 border border-red-800/30 rounded-xl p-5">
              <div className="text-xs text-red-400 uppercase tracking-wide mb-1">Total Ad Spend</div>
              <div className="text-2xl font-bold text-red-400">{fmt(summary.totalSpend)}</div>
              <div className="text-xs text-gray-500 mt-1">{fmtN(summary.productCount)} products advertised</div>
            </div>
            <div className="bg-gray-900 border border-green-800/40 rounded-xl p-5">
              <div className="text-xs text-green-400 uppercase tracking-wide mb-1">Ad-Attributed Revenue</div>
              <div className="text-2xl font-bold text-green-400">{fmt(summary.totalAdRevenue)}</div>
              <div className="text-xs text-gray-500 mt-1">{fmtN(summary.totalConversions)} conversions</div>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Overall ROAS</div>
              <div className={`text-2xl font-bold ${summary.totalRoas >= 4 ? "text-green-400" : summary.totalRoas >= 2 ? "text-yellow-400" : "text-red-400"}`}>
                {summary.totalRoas.toFixed(2)}x
              </div>
              <div className="text-xs text-gray-600 mt-1">Revenue ÷ Spend</div>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Total Clicks</div>
              <div className="text-2xl font-bold text-white">{fmtN(summary.totalClicks)}</div>
              <div className="text-xs text-gray-500 mt-1">{fmtN(summary.totalImpressions)} impressions</div>
            </div>
          </div>

          {/* KPI row 2 */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Avg CTR</div>
              <div className="text-2xl font-bold text-white">
                {summary.totalImpressions > 0 ? fmtPct(summary.totalClicks / summary.totalImpressions) : "—"}
              </div>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Avg CPC</div>
              <div className="text-2xl font-bold text-white">
                {summary.totalClicks > 0 ? fmt2(summary.totalSpend / summary.totalClicks) : "—"}
              </div>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Conv. Rate</div>
              <div className="text-2xl font-bold text-white">
                {summary.totalClicks > 0 ? fmtPct(summary.totalConversions / summary.totalClicks) : "—"}
              </div>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">SKUs Matched</div>
              <div className="text-2xl font-bold text-white">
                {summary.matchedCount} <span className="text-sm text-gray-500">/ {summary.productCount}</span>
              </div>
              <div className="text-xs text-gray-500 mt-1">Linked to Shopify SKU</div>
            </div>
          </div>

          {/* Top spenders bar chart */}
          {filtered.length > 0 && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <h2 className="text-sm font-semibold text-white mb-4">Top 8 Products by Spend</h2>
              <div className="space-y-2.5">
                {filtered.slice(0, 8).map(p => {
                  const pct = summary.totalSpend > 0 ? (p.adSpend / summary.totalSpend) * 100 : 0;
                  return (
                    <button
                      key={p.productItemId}
                      onClick={() => setSelected(p)}
                      className="w-full text-left group"
                    >
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-gray-300 truncate max-w-sm group-hover:text-white transition-colors">{p.sku ?? p.productTitle}</span>
                        <span className="text-white font-medium ml-4 flex-shrink-0">
                          {fmt(p.adSpend)} <span className="text-gray-500">· <RoasBadge roas={p.roas} /></span>
                        </span>
                      </div>
                      <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-500 rounded-full group-hover:bg-blue-400 transition-colors" style={{ width: `${pct}%` }} />
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Controls */}
          <div className="flex flex-wrap gap-3 items-center">
            <input
              type="text"
              placeholder="Search product or SKU..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
            />
            <button
              onClick={() => setShowUnmatched(v => !v)}
              className={`px-3 py-2 rounded-lg text-sm transition-colors border ${showUnmatched ? "bg-gray-800 border-gray-700 text-gray-300" : "bg-blue-600/20 border-blue-600/40 text-blue-300"}`}
            >
              {showUnmatched ? "All products" : "SKU-matched only"}
            </button>
            <span className="text-xs text-gray-500">{filtered.length} products · click any row to expand</span>
          </div>

          {/* Table */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 bg-gray-900 border-b border-gray-800">
                  <tr>
                    <th className={`${th} text-left`}>Product</th>
                    <th className={`${th} text-right`} onClick={() => handleSort("adSpend")}>Spend <SortIcon k="adSpend" /></th>
                    <th className={`${th} text-right`} onClick={() => handleSort("adRevenue")}>Ad Revenue <SortIcon k="adRevenue" /></th>
                    <th className={`${th} text-right`} onClick={() => handleSort("roas")}>ROAS <SortIcon k="roas" /></th>
                    <th className={`${th} text-right`} onClick={() => handleSort("conversions")}>Convs <SortIcon k="conversions" /></th>
                    <th className={`${th} text-right`} onClick={() => handleSort("clicks")}>Clicks <SortIcon k="clicks" /></th>
                    <th className={`${th} text-right`} onClick={() => handleSort("ctr")}>CTR <SortIcon k="ctr" /></th>
                    <th className={`${th} text-right`} onClick={() => handleSort("cpc")}>CPC <SortIcon k="cpc" /></th>
                    <th className={`${th} text-right`}>COGS / Unit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {filtered.length === 0 && (
                    <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-500">No products found.</td></tr>
                  )}
                  {filtered.map(p => (
                    <tr
                      key={p.productItemId}
                      onClick={() => setSelected(p)}
                      className={`hover:bg-gray-800/60 transition-colors cursor-pointer ${selected?.productItemId === p.productItemId ? "bg-blue-900/20 ring-1 ring-inset ring-blue-700/40" : ""}`}
                    >
                      <td className="px-4 py-2.5">
                        <div className={`font-mono font-medium truncate max-w-xs ${p.sku ? "text-white" : "text-gray-600"}`}>
                          {p.sku ?? "—"}
                        </div>
                        <div className="text-gray-500 text-xs mt-0.5 truncate max-w-xs">{p.productTitle}</div>
                      </td>
                      <td className="px-4 py-2.5 text-right text-red-400">{fmt(p.adSpend)}</td>
                      <td className="px-4 py-2.5 text-right text-green-400">{fmt(p.adRevenue)}</td>
                      <td className="px-4 py-2.5 text-right"><RoasBadge roas={p.roas} /></td>
                      <td className="px-4 py-2.5 text-right text-gray-300">{p.conversions.toFixed(1)}</td>
                      <td className="px-4 py-2.5 text-right text-gray-300">{fmtN(p.clicks)}</td>
                      <td className="px-4 py-2.5 text-right text-gray-400">{fmtPct(p.ctr)}</td>
                      <td className="px-4 py-2.5 text-right text-gray-400">{p.cpc != null ? fmt2(p.cpc) : "—"}</td>
                      <td className="px-4 py-2.5 text-right text-gray-400">
                        {p.costPerUnit != null ? fmt2(p.costPerUnit) : <span className="text-gray-600">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-gray-700 bg-gray-800/50 font-semibold text-sm">
                    <td className="px-4 py-3 text-white">Total ({filtered.length})</td>
                    <td className="px-4 py-3 text-right text-red-400">{fmt(filtered.reduce((s, p) => s + p.adSpend, 0))}</td>
                    <td className="px-4 py-3 text-right text-green-400">{fmt(filtered.reduce((s, p) => s + p.adRevenue, 0))}</td>
                    <td className="px-4 py-3 text-right">
                      {(() => {
                        const spend = filtered.reduce((s, p) => s + p.adSpend, 0);
                        const rev = filtered.reduce((s, p) => s + p.adRevenue, 0);
                        return <RoasBadge roas={spend > 0 ? rev / spend : null} />;
                      })()}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-300">{filtered.reduce((s, p) => s + p.conversions, 0).toFixed(0)}</td>
                    <td className="px-4 py-3 text-right text-gray-300">{fmtN(filtered.reduce((s, p) => s + p.clicks, 0))}</td>
                    <td className="px-4 py-3" colSpan={3} />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Detail panel */}
      {selected && (
        <ProductDetailPanel
          product={selected}
          onClose={() => setSelected(null)}
          totalSpend={summary?.totalSpend ?? 0}
        />
      )}
    </div>
  );
}
