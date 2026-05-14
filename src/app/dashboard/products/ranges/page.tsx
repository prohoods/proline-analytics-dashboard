"use client";

// Ranges product analytics — PLSR + PLST SKUs (full ranges and rangetops).
// Excludes 2pc- prefixed bundle SKUs (those live on the bundles page).

import { useEffect, useMemo, useState } from "react";
import DateRangeDropdown from "@/components/DateRangeDropdown";
import { RangeKey, getRange } from "@/lib/date-ranges";
import { KPISkeleton, TableSkeleton } from "@/components/Skeleton";
import { exportToCSV } from "@/lib/export-csv";

interface RangeProduct {
  title: string;
  sku: string;
  orderCount: number;
  unitsSold: number;
  netUnits: number;
  grossRevenue: number;
  refundedUnits: number;
  refundedRevenue: number;
  netRevenue: number;
  refundRate: number;
  avgPrice: number;
  costPerUnit: number | null;
  landedCostPerUnit: number | null;
  totalCOGS: number | null;
  grossProfit: number | null;
  grossMarginPct: number | null;
}

interface Summary {
  productCount: number;
  unitsSold: number;
  netUnits: number;
  grossRevenue: number;
  refundedRevenue: number;
  netRevenue: number;
  totalCOGS: number;
  grossProfit: number;
  coveredProducts: number;
  tariffRate: number;
}

const fmtC = (n: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);

const fmtPct = (n: number | null) =>
  n == null ? "—" : `${n.toFixed(1)}%`;

export default function RangesPage() {
  const [rangeKey, setRangeKey] = useState<RangeKey>("ytd");
  const [products, setProducts] = useState<RangeProduct[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "PLSR" | "PLST">("all");

  const { start, end } = useMemo(() => getRange(rangeKey), [rangeKey]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/shopify/products/ranges?start=${start}&end=${end}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error);
        setProducts(d.products ?? []);
        setSummary(d.summary ?? null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [start, end]);

  const filtered = useMemo(() => {
    if (filter === "all") return products;
    return products.filter((p) => p.sku.toUpperCase().startsWith(filter));
  }, [products, filter]);

  const filteredSummary = useMemo(() => {
    return {
      unitsSold: filtered.reduce((s, p) => s + p.unitsSold, 0),
      netUnits: filtered.reduce((s, p) => s + p.netUnits, 0),
      grossRevenue: filtered.reduce((s, p) => s + p.grossRevenue, 0),
      netRevenue: filtered.reduce((s, p) => s + p.netRevenue, 0),
      refundedRevenue: filtered.reduce((s, p) => s + p.refundedRevenue, 0),
      totalCOGS: filtered.reduce((s, p) => s + (p.totalCOGS ?? 0), 0),
      grossProfit: filtered.reduce((s, p) => s + (p.grossProfit ?? 0), 0),
    };
  }, [filtered]);

  const overallMarginPct =
    filteredSummary.netRevenue > 0
      ? (filteredSummary.grossProfit / filteredSummary.netRevenue) * 100
      : 0;

  function handleExport() {
    exportToCSV(
      filtered.map((p) => ({
        SKU: p.sku,
        Title: p.title,
        Orders: p.orderCount,
        UnitsSold: p.unitsSold,
        Refunded: p.refundedUnits,
        NetUnits: p.netUnits,
        GrossRevenue: p.grossRevenue.toFixed(2),
        NetRevenue: p.netRevenue.toFixed(2),
        AvgPrice: p.avgPrice.toFixed(2),
        CostPerUnit: p.landedCostPerUnit?.toFixed(2) ?? "",
        TotalCOGS: p.totalCOGS?.toFixed(2) ?? "",
        GrossProfit: p.grossProfit?.toFixed(2) ?? "",
        MarginPct: p.grossMarginPct?.toFixed(1) ?? "",
      })),
      `ranges-${start}-${end}.csv`
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-white">Ranges</h1>
          <p className="text-sm text-gray-400 mt-1">
            PLSR (ranges) and PLST (rangetops). Bundle SKUs (
            <span className="font-mono text-gray-300">2pc-</span>) are tracked
            separately under Bundles.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <DateRangeDropdown value={rangeKey} onChange={setRangeKey} />
          <button
            onClick={handleExport}
            className="px-3 py-2 text-sm rounded-lg bg-gray-800 text-gray-200 hover:bg-gray-700"
          >
            Export CSV
          </button>
        </div>
      </div>

      {/* Family filter pill bar */}
      <div className="flex items-center gap-2">
        {(["all", "PLSR", "PLST"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${
              filter === f
                ? "bg-blue-600/20 border-blue-600 text-blue-300"
                : "bg-gray-900 border-gray-700 text-gray-400 hover:text-gray-200"
            }`}
          >
            {f === "all"
              ? "All ranges"
              : f === "PLSR"
              ? "PLSR — Ranges"
              : "PLST — Rangetops"}
          </button>
        ))}
      </div>

      {error && (
        <div className="rounded-lg border border-red-900 bg-red-950/40 text-red-300 px-4 py-3 text-sm">
          {error}
        </div>
      )}

      {/* KPI tiles */}
      {loading || !summary ? (
        <KPISkeleton count={5} />
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <KPI label="Units Sold" value={filteredSummary.unitsSold.toLocaleString()} sub={`${filteredSummary.netUnits.toLocaleString()} net`} />
          <KPI label="Net Revenue" value={fmtC(filteredSummary.netRevenue)} sub={`${fmtC(filteredSummary.grossRevenue)} gross`} />
          <KPI label="Refunds" value={fmtC(filteredSummary.refundedRevenue)} sub={filteredSummary.grossRevenue > 0 ? `${((filteredSummary.refundedRevenue / filteredSummary.grossRevenue) * 100).toFixed(1)}% of gross` : "—"} />
          <KPI label="Gross Profit" value={fmtC(filteredSummary.grossProfit)} sub={`${fmtC(filteredSummary.totalCOGS)} COGS (landed)`} />
          <KPI label="GP Margin" value={fmtPct(overallMarginPct)} sub={`${summary.coveredProducts}/${summary.productCount} SKUs costed`} />
        </div>
      )}

      {/* Per-SKU table */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-800 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-white">By SKU</h2>
            <p className="text-xs text-gray-500">
              Sorted by gross revenue. COGS includes landed cost (supplier +{" "}
              {summary ? (summary.tariffRate * 100).toFixed(0) : "—"}% tariff).
            </p>
          </div>
          <div className="text-xs text-gray-500">{filtered.length} SKUs</div>
        </div>
        {loading ? (
          <TableSkeleton rows={6} />
        ) : filtered.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-gray-500">
            No range sales in this window.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-950/50 text-gray-400 text-xs uppercase tracking-wider">
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium">SKU</th>
                  <th className="text-left px-4 py-2.5 font-medium">Title</th>
                  <th className="text-right px-4 py-2.5 font-medium">Orders</th>
                  <th className="text-right px-4 py-2.5 font-medium">Units</th>
                  <th className="text-right px-4 py-2.5 font-medium">Refunded</th>
                  <th className="text-right px-4 py-2.5 font-medium">Net Units</th>
                  <th className="text-right px-4 py-2.5 font-medium">Avg Price</th>
                  <th className="text-right px-4 py-2.5 font-medium">Net Revenue</th>
                  <th className="text-right px-4 py-2.5 font-medium">Cost / Unit</th>
                  <th className="text-right px-4 py-2.5 font-medium">Gross Profit</th>
                  <th className="text-right px-4 py-2.5 font-medium">Margin</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {filtered.map((p) => (
                  <tr key={p.sku} className="hover:bg-gray-800/40">
                    <td className="px-4 py-2.5 font-mono text-xs text-gray-200">{p.sku}</td>
                    <td className="px-4 py-2.5 text-gray-300 max-w-xs truncate" title={p.title}>{p.title}</td>
                    <td className="px-4 py-2.5 text-right text-gray-300">{p.orderCount}</td>
                    <td className="px-4 py-2.5 text-right text-gray-200">{p.unitsSold}</td>
                    <td className="px-4 py-2.5 text-right text-gray-400">{p.refundedUnits || "—"}</td>
                    <td className="px-4 py-2.5 text-right text-gray-200">{p.netUnits}</td>
                    <td className="px-4 py-2.5 text-right text-gray-300">{fmtC(p.avgPrice)}</td>
                    <td className="px-4 py-2.5 text-right text-gray-100 font-medium">{fmtC(p.netRevenue)}</td>
                    <td className="px-4 py-2.5 text-right text-gray-400">
                      {p.landedCostPerUnit != null ? fmtC(p.landedCostPerUnit) : <span className="text-amber-500">no cogs</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right text-gray-100 font-medium">
                      {p.grossProfit != null ? fmtC(p.grossProfit) : "—"}
                    </td>
                    <td className={`px-4 py-2.5 text-right font-medium ${marginColor(p.grossMarginPct)}`}>
                      {fmtPct(p.grossMarginPct)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-950/50 text-gray-200 text-sm font-medium">
                <tr>
                  <td colSpan={3} className="px-4 py-2.5 text-right uppercase text-xs tracking-wider text-gray-500">Totals</td>
                  <td className="px-4 py-2.5 text-right">{filteredSummary.unitsSold}</td>
                  <td className="px-4 py-2.5 text-right text-gray-400">—</td>
                  <td className="px-4 py-2.5 text-right">{filteredSummary.netUnits}</td>
                  <td className="px-4 py-2.5"></td>
                  <td className="px-4 py-2.5 text-right">{fmtC(filteredSummary.netRevenue)}</td>
                  <td className="px-4 py-2.5"></td>
                  <td className="px-4 py-2.5 text-right">{fmtC(filteredSummary.grossProfit)}</td>
                  <td className={`px-4 py-2.5 text-right ${marginColor(overallMarginPct)}`}>{fmtPct(overallMarginPct)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function marginColor(pct: number | null): string {
  if (pct == null) return "text-gray-500";
  if (pct >= 30) return "text-green-400";
  if (pct >= 15) return "text-yellow-400";
  return "text-red-400";
}

function KPI({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-3">
      <div className="text-xs uppercase tracking-wider text-gray-500">{label}</div>
      <div className="text-xl font-semibold text-white mt-1">{value}</div>
      {sub && <div className="text-xs text-gray-500 mt-1">{sub}</div>}
    </div>
  );
}
