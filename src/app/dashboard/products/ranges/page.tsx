"use client";

// Ranges product analytics — PLSR + PLST SKUs (full ranges and rangetops).
// Excludes 2pc- prefixed bundle SKUs (those live on the bundles page).
// Draft orders are filtered out upstream in the API.

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
  avgPrice: number;
  firstSold: string | null;
  lastSold: string | null;
}

interface SaleRow {
  date: string;
  orderName: string;
  sku: string;
  title: string;
  quantity: number;
  unitPrice: number;
  lineRevenue: number;
  customer: string;
  state: string;
  channel: string;
}

interface WeekRow {
  weekStart: string;
  orderCount: number;
  units: number;
  revenue: number;
  topSkus: { sku: string; units: number }[];
}

interface Summary {
  productCount: number;
  unitsSold: number;
  netUnits: number;
  grossRevenue: number;
  refundedRevenue: number;
  netRevenue: number;
}

const fmtC = (n: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);

const fmtDate = (iso: string) => {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

export default function RangesPage() {
  const [rangeKey, setRangeKey] = useState<RangeKey>("ytd");
  const [products, setProducts] = useState<RangeProduct[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [sales, setSales] = useState<SaleRow[]>([]);
  const [weekly, setWeekly] = useState<WeekRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "PLSR" | "PLST">("all");
  const [showAllSales, setShowAllSales] = useState(false);

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
        setSales(d.sales ?? []);
        setWeekly(d.weekly ?? []);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [start, end]);

  const filtered = useMemo(() => {
    if (filter === "all") return products;
    return products.filter((p) => p.sku.toUpperCase().startsWith(filter));
  }, [products, filter]);

  const filteredSales = useMemo(() => {
    if (filter === "all") return sales;
    return sales.filter((s) => s.sku.toUpperCase().startsWith(filter));
  }, [sales, filter]);

  // Weekly is computed on the server across ALL ranges; for filter==PLSR/PLST,
  // we rebuild from the filtered sales list so the chart matches the pill.
  const filteredWeekly = useMemo<WeekRow[]>(() => {
    if (filter === "all") return weekly;
    const map: Record<string, WeekRow> = {};
    for (const s of filteredSales) {
      const wk = weekStartFromDate(s.date);
      if (!map[wk]) map[wk] = { weekStart: wk, orderCount: 0, units: 0, revenue: 0, topSkus: [] };
      map[wk].units += s.quantity;
      map[wk].revenue += s.lineRevenue;
    }
    // Approximate order counts from distinct order names per week
    const ordersByWeek: Record<string, Set<string>> = {};
    for (const s of filteredSales) {
      const wk = weekStartFromDate(s.date);
      if (!ordersByWeek[wk]) ordersByWeek[wk] = new Set();
      ordersByWeek[wk].add(s.orderName);
    }
    for (const wk of Object.keys(map)) map[wk].orderCount = ordersByWeek[wk]?.size ?? 0;
    return Object.values(map).sort((a, b) => a.weekStart.localeCompare(b.weekStart));
  }, [filter, weekly, filteredSales]);

  const visibleSales = showAllSales ? filteredSales : filteredSales.slice(0, 50);

  const filteredSummary = useMemo(() => {
    return {
      unitsSold: filtered.reduce((s, p) => s + p.unitsSold, 0),
      netUnits: filtered.reduce((s, p) => s + p.netUnits, 0),
      orderCount: filtered.reduce((s, p) => s + p.orderCount, 0),
      grossRevenue: filtered.reduce((s, p) => s + p.grossRevenue, 0),
      netRevenue: filtered.reduce((s, p) => s + p.netRevenue, 0),
      refundedRevenue: filtered.reduce((s, p) => s + p.refundedRevenue, 0),
    };
  }, [filtered]);

  const aov =
    filteredSummary.orderCount > 0
      ? filteredSummary.netRevenue / filteredSummary.orderCount
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
        FirstSold: p.firstSold ?? "",
        LastSold: p.lastSold ?? "",
      })),
      `ranges-${start}-${end}.csv`
    );
  }

  function exportWeekly() {
    exportToCSV(
      filteredWeekly.map((w) => ({
        WeekStart: w.weekStart,
        Orders: w.orderCount,
        Units: w.units,
        Revenue: w.revenue.toFixed(2),
      })),
      `ranges-weekly-${start}-${end}.csv`
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-white">Ranges</h1>
          <p className="text-sm text-gray-400 mt-1">
            PLSR (ranges) and PLST (rangetops) sold via Shopify. Bundle SKUs (
            <span className="font-mono text-gray-300">2pc-</span>) live under
            Bundles. Draft orders excluded.
          </p>
        </div>
        <DateRangeDropdown value={rangeKey} onChange={setRangeKey} />
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
          <KPI label="Units Sold" value={filteredSummary.unitsSold.toLocaleString()} sub={`${filteredSummary.netUnits.toLocaleString()} net of refunds`} />
          <KPI label="Orders" value={filteredSummary.orderCount.toLocaleString()} sub={`${filtered.length} active SKUs`} />
          <KPI label="Net Revenue" value={fmtC(filteredSummary.netRevenue)} sub={`${fmtC(filteredSummary.grossRevenue)} gross`} />
          <KPI label="Avg Order Value" value={fmtC(aov)} sub="Net revenue ÷ orders" />
          <KPI label="Refunds" value={fmtC(filteredSummary.refundedRevenue)} sub={filteredSummary.grossRevenue > 0 ? `${((filteredSummary.refundedRevenue / filteredSummary.grossRevenue) * 100).toFixed(1)}% of gross` : "—"} />
        </div>
      )}

      {/* Weekly report */}
      <Section
        title="Weekly report"
        subtitle="Units and orders by ISO week (Monday-start). Hover bars for revenue."
        action={
          <button
            onClick={exportWeekly}
            className="px-3 py-1.5 text-xs rounded-lg bg-gray-800 text-gray-200 hover:bg-gray-700"
          >
            Export
          </button>
        }
      >
        {loading ? (
          <TableSkeleton rows={5} />
        ) : filteredWeekly.length === 0 ? (
          <Empty msg="No range sales in this window." />
        ) : (
          <WeeklyChart rows={filteredWeekly} />
        )}
      </Section>

      {/* Per-SKU table */}
      <Section
        title="By SKU"
        subtitle="Sorted by gross revenue."
        action={
          <button
            onClick={handleExport}
            className="px-3 py-1.5 text-xs rounded-lg bg-gray-800 text-gray-200 hover:bg-gray-700"
          >
            Export
          </button>
        }
      >
        {loading ? (
          <TableSkeleton rows={6} />
        ) : filtered.length === 0 ? (
          <Empty msg="No range sales in this window." />
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
                  <th className="text-right px-4 py-2.5 font-medium">Last Sold</th>
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
                    <td className="px-4 py-2.5 text-right text-gray-400 text-xs whitespace-nowrap">
                      {p.lastSold ?? "—"}
                      {p.firstSold && p.firstSold !== p.lastSold && (
                        <div className="text-[10px] text-gray-600">first: {p.firstSold}</div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-950/50 text-gray-200 text-sm font-medium">
                <tr>
                  <td colSpan={2} className="px-4 py-2.5 text-right uppercase text-xs tracking-wider text-gray-500">Totals</td>
                  <td className="px-4 py-2.5 text-right">{filteredSummary.orderCount}</td>
                  <td className="px-4 py-2.5 text-right">{filteredSummary.unitsSold}</td>
                  <td className="px-4 py-2.5"></td>
                  <td className="px-4 py-2.5 text-right">{filteredSummary.netUnits}</td>
                  <td className="px-4 py-2.5"></td>
                  <td className="px-4 py-2.5 text-right">{fmtC(filteredSummary.netRevenue)}</td>
                  <td className="px-4 py-2.5"></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Section>

      {/* Sales detail */}
      <Section
        title="Sales detail"
        subtitle="Every range line item — date, order, customer, channel, state. Sorted newest first."
        action={
          <div className="text-xs text-gray-500">
            {filteredSales.length.toLocaleString()} sales
            {filteredSales.length > 50 && (
              <button
                onClick={() => setShowAllSales((v) => !v)}
                className="ml-3 text-blue-400 hover:text-blue-300"
              >
                {showAllSales ? "Show top 50" : "Show all"}
              </button>
            )}
          </div>
        }
      >
        {loading ? (
          <TableSkeleton rows={6} />
        ) : visibleSales.length === 0 ? (
          <Empty msg="No range sales in this window." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-950/50 text-gray-400 text-xs uppercase tracking-wider">
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium">Date</th>
                  <th className="text-left px-4 py-2.5 font-medium">Order</th>
                  <th className="text-left px-4 py-2.5 font-medium">SKU</th>
                  <th className="text-left px-4 py-2.5 font-medium">Customer</th>
                  <th className="text-left px-4 py-2.5 font-medium">State</th>
                  <th className="text-left px-4 py-2.5 font-medium">Channel</th>
                  <th className="text-right px-4 py-2.5 font-medium">Qty</th>
                  <th className="text-right px-4 py-2.5 font-medium">Unit Price</th>
                  <th className="text-right px-4 py-2.5 font-medium">Revenue</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {visibleSales.map((s, i) => (
                  <tr key={`${s.orderName}-${s.sku}-${i}`} className="hover:bg-gray-800/40">
                    <td className="px-4 py-2.5 text-gray-300 whitespace-nowrap">{s.date}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-gray-300">{s.orderName}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-gray-200">{s.sku}</td>
                    <td className="px-4 py-2.5 text-gray-300 max-w-[200px] truncate" title={s.customer}>{s.customer || "—"}</td>
                    <td className="px-4 py-2.5 text-gray-400">{s.state || "—"}</td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider ${channelPill(s.channel)}`}>
                        {s.channel}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right text-gray-200">{s.quantity}</td>
                    <td className="px-4 py-2.5 text-right text-gray-300">{fmtC(s.unitPrice)}</td>
                    <td className="px-4 py-2.5 text-right text-gray-100 font-medium">{fmtC(s.lineRevenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}

// Recompute week-of (Monday-start) for client-side filtering. Mirrors the
// server-side weekStart() in /api/shopify/products/ranges/route.ts.
function weekStartFromDate(isoDate: string): string {
  const d = new Date(isoDate + "T00:00:00Z");
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().substring(0, 10);
}

function WeeklyChart({ rows }: { rows: WeekRow[] }) {
  const maxUnits = Math.max(1, ...rows.map((r) => r.units));
  return (
    <div className="px-5 pt-4 pb-2">
      <div className="flex items-end gap-1.5 h-32">
        {rows.map((w) => {
          const h = Math.max(2, (w.units / maxUnits) * 100);
          return (
            <div
              key={w.weekStart}
              className="flex-1 group relative flex flex-col justify-end min-w-[20px]"
              title={`Week of ${w.weekStart} — ${w.units} units, ${w.orderCount} orders, ${fmtC(w.revenue)}`}
            >
              <div
                className="w-full bg-blue-600/70 group-hover:bg-blue-500 rounded-t transition-colors"
                style={{ height: `${h}%` }}
              />
              <div className="absolute -top-7 left-1/2 -translate-x-1/2 px-1.5 py-0.5 text-[10px] bg-gray-950 text-gray-200 rounded border border-gray-800 opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-10">
                {w.units}u · {fmtC(w.revenue)}
              </div>
            </div>
          );
        })}
      </div>
      <div className="overflow-x-auto mt-4 border-t border-gray-800">
        <table className="w-full text-sm">
          <thead className="bg-gray-950/50 text-gray-400 text-xs uppercase tracking-wider">
            <tr>
              <th className="text-left px-4 py-2 font-medium">Week of</th>
              <th className="text-right px-4 py-2 font-medium">Orders</th>
              <th className="text-right px-4 py-2 font-medium">Units</th>
              <th className="text-right px-4 py-2 font-medium">Revenue</th>
              <th className="text-left px-4 py-2 font-medium">Top SKUs</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {[...rows].reverse().map((w) => (
              <tr key={w.weekStart} className="hover:bg-gray-800/40">
                <td className="px-4 py-2 text-gray-200 whitespace-nowrap">
                  {fmtDate(w.weekStart)} <span className="text-gray-500 text-xs">{w.weekStart}</span>
                </td>
                <td className="px-4 py-2 text-right text-gray-300">{w.orderCount}</td>
                <td className="px-4 py-2 text-right text-gray-100 font-medium">{w.units}</td>
                <td className="px-4 py-2 text-right text-gray-200">{fmtC(w.revenue)}</td>
                <td className="px-4 py-2 text-xs text-gray-400">
                  {w.topSkus.length === 0
                    ? "—"
                    : w.topSkus.map((s) => `${s.sku} (${s.units})`).join(", ")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function channelPill(channel: string): string {
  switch (channel) {
    case "b2b":   return "bg-purple-900/40 text-purple-300";
    case "phone": return "bg-amber-900/40 text-amber-300";
    case "dtc":   return "bg-blue-900/40 text-blue-300";
    default:      return "bg-gray-800 text-gray-400";
  }
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

function Section({
  title,
  subtitle,
  action,
  children,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-800 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-white">{title}</h2>
          {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

function Empty({ msg }: { msg: string }) {
  return <div className="px-5 py-10 text-center text-sm text-gray-500">{msg}</div>;
}
