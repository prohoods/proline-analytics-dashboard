"use client";

import { useEffect, useState } from "react";
import MetricCard from "@/components/MetricCard";

interface Product {
  title: string;
  sku: string;
  unitsSold: number;
  grossRevenue: number;
  refundedUnits: number;
  refundedRevenue: number;
  netRevenue: number;
  netUnits: number;
  refundRate: number;
  avgOrderValue: number;
}
interface Summary { totalGross: number; totalNet: number; totalUnits: number; productCount: number; }

function fmt(n: number) { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n); }
function fmtNum(n: number) { return new Intl.NumberFormat("en-US").format(n); }

const RANGES = [
  { label: "Last 30 days", days: 30 },
  { label: "Last 60 days", days: 60 },
  { label: "Last 90 days", days: 90 },
  { label: "YTD", days: 0 },
];

type SortKey = "grossRevenue" | "netRevenue" | "unitsSold" | "refundRate" | "avgOrderValue";

export default function ProductsPage() {
  const [range, setRange] = useState(30);
  const [products, setProducts] = useState<Product[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortKey>("grossRevenue");

  useEffect(() => {
    setLoading(true);
    setError("");
    const end = new Date();
    const start = new Date();
    if (range === 0) { start.setMonth(0); start.setDate(1); }
    else { start.setDate(start.getDate() - range); }
    const fmtDate = (d: Date) => d.toISOString().substring(0, 10);
    fetch(`/api/shopify/products?start=${fmtDate(start)}&end=${fmtDate(end)}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) throw new Error(d.error);
        setProducts(d.products);
        setSummary(d.summary);
        setLoading(false);
      })
      .catch(e => { setError(e.message); setLoading(false); });
  }, [range]);

  const filtered = products
    .filter(p => !search || p.title.toLowerCase().includes(search.toLowerCase()) || p.sku.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => b[sortBy] - a[sortBy]);

  const SORT_OPTIONS: { key: SortKey; label: string }[] = [
    { key: "grossRevenue", label: "Gross Revenue" },
    { key: "netRevenue", label: "Net Revenue" },
    { key: "unitsSold", label: "Units Sold" },
    { key: "refundRate", label: "Refund Rate" },
    { key: "avgOrderValue", label: "Avg Order Value" },
  ];

  return (
    <div className="p-8">
      <div className="mb-6 flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Product Profitability</h1>
          <p className="text-gray-400 mt-1">Revenue and refunds by SKU — direct from Shopify</p>
          <div className="mt-2 inline-flex items-center gap-2 bg-green-900/20 border border-green-700/30 rounded-lg px-3 py-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
            <span className="text-green-400 text-xs font-medium">Live — Shopify API</span>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          {RANGES.map(r => (
            <button key={r.days} onClick={() => setRange(r.days)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${range === r.days ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-400 hover:text-white"}`}>
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {loading && <div className="text-gray-400">Loading...</div>}
      {error && <div className="text-red-400 bg-red-900/20 rounded-lg p-4 mb-6 text-sm">{error}</div>}

      {!loading && !error && summary && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <MetricCard label="Gross Revenue" value={fmt(summary.totalGross)} subtext="Before refunds" highlight />
            <MetricCard label="Net Revenue" value={fmt(summary.totalNet)} subtext="After refunds" />
            <MetricCard label="Units Sold" value={fmtNum(summary.totalUnits)} subtext="Total items" />
            <MetricCard label="Products" value={summary.productCount.toString()} subtext="Unique SKUs" />
          </div>

          {/* Controls */}
          <div className="flex flex-wrap gap-3 mb-4">
            <input
              type="text"
              placeholder="Search product or SKU..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
            />
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">Sort by:</span>
              <select
                value={sortBy}
                onChange={e => setSortBy(e.target.value as SortKey)}
                className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
              >
                {SORT_OPTIONS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
              </select>
            </div>
          </div>

          <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-gray-500 text-xs uppercase tracking-wider bg-gray-800/50 border-b border-gray-800">
                    <th className="py-3 px-4 text-left">Product</th>
                    <th className="py-3 px-4 text-left">SKU</th>
                    <th className="py-3 px-4 text-right">Units Sold</th>
                    <th className="py-3 px-4 text-right">Gross Revenue</th>
                    <th className="py-3 px-4 text-right">Refunded</th>
                    <th className="py-3 px-4 text-right">Net Revenue</th>
                    <th className="py-3 px-4 text-right">Refund Rate</th>
                    <th className="py-3 px-4 text-right">Avg Price</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {filtered.map((p, i) => (
                    <tr key={i} className="text-gray-300 hover:bg-gray-800/40">
                      <td className="py-2.5 px-4 font-medium text-white max-w-xs truncate">{p.title}</td>
                      <td className="py-2.5 px-4 text-gray-500 text-xs font-mono">{p.sku || "—"}</td>
                      <td className="py-2.5 px-4 text-right">{fmtNum(p.unitsSold)}</td>
                      <td className="py-2.5 px-4 text-right text-green-400">{fmt(p.grossRevenue)}</td>
                      <td className="py-2.5 px-4 text-right text-red-400">
                        {p.refundedUnits > 0 ? `(${fmt(p.refundedRevenue)})` : "—"}
                      </td>
                      <td className="py-2.5 px-4 text-right font-medium text-white">{fmt(p.netRevenue)}</td>
                      <td className="py-2.5 px-4 text-right">
                        <span className={`text-xs font-medium ${p.refundRate > 10 ? "text-red-400" : p.refundRate > 5 ? "text-yellow-400" : "text-gray-400"}`}>
                          {p.refundRate.toFixed(1)}%
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-right text-gray-400">{fmt(p.avgOrderValue)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-gray-700 bg-gray-800/50 font-semibold text-white">
                    <td className="py-3 px-4" colSpan={2}>Total ({filtered.length} products)</td>
                    <td className="py-3 px-4 text-right">{fmtNum(filtered.reduce((s, p) => s + p.unitsSold, 0))}</td>
                    <td className="py-3 px-4 text-right text-green-400">{fmt(filtered.reduce((s, p) => s + p.grossRevenue, 0))}</td>
                    <td className="py-3 px-4 text-right text-red-400">({fmt(filtered.reduce((s, p) => s + p.refundedRevenue, 0))})</td>
                    <td className="py-3 px-4 text-right">{fmt(filtered.reduce((s, p) => s + p.netRevenue, 0))}</td>
                    <td className="py-3 px-4" colSpan={2} />
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
