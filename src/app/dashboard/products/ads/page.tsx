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

function RoasBadge({ roas }: { roas: number | null }) {
  if (roas === null) return <span className="text-gray-600">—</span>;
  const color = roas >= 4 ? "text-green-400" : roas >= 2 ? "text-yellow-400" : "text-red-400";
  return <span className={`font-semibold ${color}`}>{roas.toFixed(2)}x</span>;
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
          {/* KPI row 1 — Spend & Revenue */}
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

          {/* KPI row 2 — Efficiency */}
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
                    <div key={p.productItemId}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-gray-300 truncate max-w-sm">{p.sku ?? p.productTitle}</span>
                        <span className="text-white font-medium ml-4 flex-shrink-0">
                          {fmt(p.adSpend)} <span className="text-gray-500">· <RoasBadge roas={p.roas} /></span>
                        </span>
                      </div>
                      <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-500 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
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
            <span className="text-xs text-gray-500">{filtered.length} products</span>
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
                    <tr key={p.productItemId} className="hover:bg-gray-800/40 transition-colors">
                      <td className="px-4 py-2.5">
                        <div className="text-white font-medium truncate max-w-xs">{p.productTitle}</div>
                        <div className="text-gray-500 text-xs font-mono mt-0.5">
                          {p.sku
                            ? <span className="text-blue-400">{p.sku}</span>
                            : <span className="text-gray-600">SKU not matched</span>
                          }
                        </div>
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
    </div>
  );
}
