"use client";

import { useEffect, useState } from "react";
import DateRangeDropdown from "@/components/DateRangeDropdown";
import { RangeKey, getRange } from "@/lib/date-ranges";
import { KPISkeleton, TableSkeleton } from "@/components/Skeleton";
import { exportToCSV } from "@/lib/export-csv";

interface Product {
  title: string;
  sku: string;
  unitsSold: number;
  netUnits: number;
  grossRevenue: number;
  refundedUnits: number;
  refundedRevenue: number;
  netRevenue: number;
  refundRate: number;
  avgPrice: number;
  costPerUnit: number | null;
  totalCOGS: number | null;
  grossProfit: number | null;
  grossMarginPct: number | null;
}

interface Summary {
  totalGross: number;
  totalNet: number;
  totalUnits: number;
  totalCOGS: number;
  totalProfit: number;
  overallMarginPct: number;
  productCount: number;
  coveredProducts: number;
}

const fmt = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
const fmt2 = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
const fmtN = (n: number) => new Intl.NumberFormat("en-US").format(n);
const fmtPct = (n: number) => n.toFixed(1) + "%";

type SortKey = "grossRevenue" | "netRevenue" | "unitsSold" | "refundRate" | "avgPrice" | "grossProfit" | "grossMarginPct" | "totalCOGS";

function MarginBadge({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="text-gray-600 text-xs">No COGS</span>;
  const color = pct >= 50 ? "text-green-400" : pct >= 30 ? "text-yellow-400" : "text-red-400";
  return <span className={`font-semibold ${color}`}>{fmtPct(pct)}</span>;
}

export default function ProductsPage() {
  const [rangeKey, setRangeKey] = useState<RangeKey>("ytd");
  const [products, setProducts] = useState<Product[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortKey>("grossRevenue");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [showNoCOGS, setShowNoCOGS] = useState(true);

  useEffect(() => {
    const { start, end } = getRange(rangeKey);
    setLoading(true);
    setError("");
    fetch(`/api/shopify/products?start=${start}&end=${end}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) throw new Error(d.error);
        setProducts(d.products);
        setSummary(d.summary);
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
      if (!showNoCOGS && p.costPerUnit == null) return false;
      if (search) {
        const q = search.toLowerCase();
        return p.title.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q);
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
      sku: p.sku,
      title: p.title,
      units_sold: p.unitsSold,
      net_units: p.netUnits,
      gross_revenue: p.grossRevenue.toFixed(2),
      refunded_revenue: p.refundedRevenue.toFixed(2),
      net_revenue: p.netRevenue.toFixed(2),
      refund_rate: fmtPct(p.refundRate),
      avg_price: p.avgPrice.toFixed(2),
      cost_per_unit: p.costPerUnit != null ? p.costPerUnit.toFixed(2) : "",
      total_cogs: p.totalCOGS != null ? p.totalCOGS.toFixed(2) : "",
      gross_profit: p.grossProfit != null ? p.grossProfit.toFixed(2) : "",
      gross_margin_pct: p.grossMarginPct != null ? fmtPct(p.grossMarginPct) : "",
    })), `product-profitability-${rangeKey}.csv`);
  }

  const th = "px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide whitespace-nowrap cursor-pointer hover:text-gray-200 select-none";

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Product Profitability</h1>
          <p className="text-gray-400 text-sm mt-1">Revenue, COGS, and gross margin by SKU</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <button onClick={handleExport} className="px-3 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm rounded-lg transition-colors">
            Export CSV
          </button>
          <DateRangeDropdown value={rangeKey} onChange={setRangeKey} />
        </div>
      </div>

      {error && <div className="text-red-400 bg-red-900/20 rounded-xl p-4 text-sm">{error}</div>}

      {loading && (
        <div className="space-y-6">
          <KPISkeleton count={4} />
          <KPISkeleton count={4} />
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <TableSkeleton rows={12} cols={9} />
          </div>
        </div>
      )}

      {!loading && !error && summary && (
        <>
          {/* Revenue KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Gross Revenue</div>
              <div className="text-2xl font-bold text-white">{fmt(summary.totalGross)}</div>
              <div className="text-xs text-gray-500 mt-1">{fmtN(summary.totalUnits)} units sold</div>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Net Revenue</div>
              <div className="text-2xl font-bold text-white">{fmt(summary.totalNet)}</div>
              <div className="text-xs text-gray-500 mt-1">After refunds</div>
            </div>
            <div className="bg-gray-900 border border-red-800/30 rounded-xl p-5">
              <div className="text-xs text-red-400 uppercase tracking-wide mb-1">Total COGS</div>
              <div className="text-2xl font-bold text-red-400">{fmt(summary.totalCOGS)}</div>
              <div className="text-xs text-gray-500 mt-1">{summary.coveredProducts} of {summary.productCount} SKUs covered</div>
            </div>
            <div className="bg-gray-900 border border-green-800/40 rounded-xl p-5">
              <div className="text-xs text-green-400 uppercase tracking-wide mb-1">Gross Profit</div>
              <div className="text-2xl font-bold text-green-400">{fmt(summary.totalProfit)}</div>
              <div className="text-xs text-gray-500 mt-1">On COGS-covered SKUs</div>
            </div>
          </div>

          {/* Margin + coverage KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Overall Margin</div>
              <div className={`text-2xl font-bold ${summary.overallMarginPct >= 50 ? "text-green-400" : summary.overallMarginPct >= 30 ? "text-yellow-400" : "text-red-400"}`}>
                {fmtPct(summary.overallMarginPct)}
              </div>
              <div className="text-xs text-gray-600 mt-1">Gross Profit ÷ Net Revenue</div>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Avg Profit / Unit</div>
              <div className="text-2xl font-bold text-white">
                {summary.totalUnits > 0 ? fmt2(summary.totalProfit / summary.totalUnits) : "—"}
              </div>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">SKUs Tracked</div>
              <div className="text-2xl font-bold text-white">{summary.coveredProducts} <span className="text-sm text-gray-500">/ {summary.productCount}</span></div>
              <div className="text-xs text-gray-500 mt-1">Have COGS data</div>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Avg Selling Price</div>
              <div className="text-2xl font-bold text-white">
                {summary.totalUnits > 0 ? fmt2(summary.totalGross / summary.totalUnits) : "—"}
              </div>
            </div>
          </div>

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
              onClick={() => setShowNoCOGS(v => !v)}
              className={`px-3 py-2 rounded-lg text-sm transition-colors border ${showNoCOGS ? "bg-gray-800 border-gray-700 text-gray-300" : "bg-blue-600/20 border-blue-600/40 text-blue-300"}`}
            >
              {showNoCOGS ? "Showing all SKUs" : "COGS only"}
            </button>
            <span className="text-xs text-gray-500">{filtered.length} products</span>
          </div>

          {/* Table */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 bg-gray-900 border-b border-gray-800">
                  <tr>
                    <th className={`${th} text-left`} onClick={() => handleSort("grossRevenue")}>Product <SortIcon k="grossRevenue" /></th>
                    <th className={`${th} text-right`} onClick={() => handleSort("unitsSold")}>Units <SortIcon k="unitsSold" /></th>
                    <th className={`${th} text-right`} onClick={() => handleSort("grossRevenue")}>Gross Rev <SortIcon k="grossRevenue" /></th>
                    <th className={`${th} text-right`} onClick={() => handleSort("netRevenue")}>Net Rev <SortIcon k="netRevenue" /></th>
                    <th className={`${th} text-right`} onClick={() => handleSort("avgPrice")}>Avg Price <SortIcon k="avgPrice" /></th>
                    <th className={`${th} text-right`} onClick={() => handleSort("totalCOGS")}>COGS <SortIcon k="totalCOGS" /></th>
                    <th className={`${th} text-right`} onClick={() => handleSort("grossProfit")}>Profit <SortIcon k="grossProfit" /></th>
                    <th className={`${th} text-right`} onClick={() => handleSort("grossMarginPct")}>Margin % <SortIcon k="grossMarginPct" /></th>
                    <th className={`${th} text-right`} onClick={() => handleSort("refundRate")}>Refund Rate <SortIcon k="refundRate" /></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {filtered.length === 0 && (
                    <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-500">No products found.</td></tr>
                  )}
                  {filtered.map((p, i) => (
                    <tr key={i} className="hover:bg-gray-800/40 transition-colors">
                      <td className="px-4 py-2.5">
                        <div className="text-white font-mono font-medium truncate max-w-xs">{p.sku || "—"}</div>
                        <div className="text-gray-500 text-xs mt-0.5 truncate max-w-xs">{p.title}</div>
                      </td>
                      <td className="px-4 py-2.5 text-right text-gray-300">{fmtN(p.unitsSold)}</td>
                      <td className="px-4 py-2.5 text-right text-gray-300">{fmt(p.grossRevenue)}</td>
                      <td className="px-4 py-2.5 text-right text-white">{fmt(p.netRevenue)}</td>
                      <td className="px-4 py-2.5 text-right text-gray-400">{fmt2(p.avgPrice)}</td>
                      <td className="px-4 py-2.5 text-right text-red-400">
                        {p.totalCOGS != null ? fmt(p.totalCOGS) : <span className="text-gray-600">—</span>}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {p.grossProfit != null
                          ? <span className={p.grossProfit >= 0 ? "text-green-400 font-medium" : "text-red-400 font-medium"}>{fmt(p.grossProfit)}</span>
                          : <span className="text-gray-600">—</span>}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <MarginBadge pct={p.grossMarginPct} />
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <span className={`text-xs font-medium ${p.refundRate > 10 ? "text-red-400" : p.refundRate > 5 ? "text-yellow-400" : "text-gray-400"}`}>
                          {fmtPct(p.refundRate)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-gray-700 bg-gray-800/50 font-semibold text-sm">
                    <td className="px-4 py-3 text-white">Total ({filtered.length})</td>
                    <td className="px-4 py-3 text-right text-white">{fmtN(filtered.reduce((s, p) => s + p.unitsSold, 0))}</td>
                    <td className="px-4 py-3 text-right text-gray-300">{fmt(filtered.reduce((s, p) => s + p.grossRevenue, 0))}</td>
                    <td className="px-4 py-3 text-right text-white">{fmt(filtered.reduce((s, p) => s + p.netRevenue, 0))}</td>
                    <td className="px-4 py-3" />
                    <td className="px-4 py-3 text-right text-red-400">{fmt(filtered.reduce((s, p) => s + (p.totalCOGS ?? 0), 0))}</td>
                    <td className="px-4 py-3 text-right text-green-400">{fmt(filtered.reduce((s, p) => s + (p.grossProfit ?? 0), 0))}</td>
                    <td className="px-4 py-3 text-right">
                      {(() => {
                        const net = filtered.reduce((s, p) => s + p.netRevenue, 0);
                        const profit = filtered.reduce((s, p) => s + (p.grossProfit ?? 0), 0);
                        const pct = net > 0 ? (profit / net) * 100 : 0;
                        return <MarginBadge pct={pct} />;
                      })()}
                    </td>
                    <td className="px-4 py-3" />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {summary.coveredProducts < summary.productCount && (
            <p className="text-xs text-gray-600">
              {summary.productCount - summary.coveredProducts} SKUs are missing COGS data — profit and margin figures exclude those products.
              Toggle &quot;COGS only&quot; to filter to matched SKUs only.
            </p>
          )}
        </>
      )}
    </div>
  );
}
