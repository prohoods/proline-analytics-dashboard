"use client";

// Bundle analytics — covers both Shopify-SKU'd bundles ("2pc-...") and
// implicit bundles (a range and a hood checked out in the same order
// without the bundle SKU). Draft orders are filtered out upstream.

import { useEffect, useMemo, useState } from "react";
import DateRangeDropdown from "@/components/DateRangeDropdown";
import { RangeKey, getRange } from "@/lib/date-ranges";
import { KPISkeleton, TableSkeleton } from "@/components/Skeleton";
import { exportToCSV } from "@/lib/export-csv";

interface SkudBundle {
  title: string;
  sku: string;
  rangePart: string;
  hoodPart: string;
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

interface BundleSale {
  date: string;
  orderName: string;
  kind: "skud" | "implicit";
  bundleSku?: string;
  rangeSku: string;
  hoodSku: string;
  quantity: number;
  revenue: number;
  customer: string;
  state: string;
  channel: string;
}

interface ImplicitBundle {
  rangeSku: string;
  hoodSku: string;
  orderCount: number;
  rangeUnits: number;
  hoodUnits: number;
  grossRevenue: number;
}

interface WeekRow {
  weekStart: string;
  skudOrders: number;
  implicitOrders: number;
  skudUnits: number;
  implicitUnits: number;
  totalUnits: number;
  revenue: number;
}

interface Summary {
  skudBundles: { productCount: number; orders: number; unitsSold: number; netRevenue: number };
  implicitBundles: { comboCount: number; orders: number; grossRevenue: number };
  attachRate: { ordersWithRange: number; ordersWithRangeAndHood: number; rate: number };
}

const fmtC = (n: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);

const fmtPct = (n: number | null) =>
  n == null ? "—" : `${n.toFixed(1)}%`;

const fmtDate = (iso: string) => {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

export default function BundlesPage() {
  const [rangeKey, setRangeKey] = useState<RangeKey>("ytd");
  const [skuBundles, setSkuBundles] = useState<SkudBundle[]>([]);
  const [implicitBundles, setImplicitBundles] = useState<ImplicitBundle[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [sales, setSales] = useState<BundleSale[]>([]);
  const [weekly, setWeekly] = useState<WeekRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [salesFilter, setSalesFilter] = useState<"all" | "skud" | "implicit">("all");
  const [showAllSales, setShowAllSales] = useState(false);

  const { start, end } = useMemo(() => getRange(rangeKey), [rangeKey]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/shopify/products/bundles?start=${start}&end=${end}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error);
        setSkuBundles(d.skuBundles ?? []);
        setImplicitBundles(d.implicitBundles ?? []);
        setSummary(d.summary ?? null);
        setSales(d.sales ?? []);
        setWeekly(d.weekly ?? []);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [start, end]);

  const filteredSales = useMemo(() => {
    if (salesFilter === "all") return sales;
    return sales.filter((s) => s.kind === salesFilter);
  }, [sales, salesFilter]);
  const visibleSales = showAllSales ? filteredSales : filteredSales.slice(0, 50);

  function exportSkud() {
    exportToCSV(
      skuBundles.map((b) => ({
        SKU: b.sku,
        Range: b.rangePart,
        Hood: b.hoodPart,
        Orders: b.orderCount,
        Units: b.unitsSold,
        NetRevenue: b.netRevenue.toFixed(2),
        FirstSold: b.firstSold ?? "",
        LastSold: b.lastSold ?? "",
      })),
      `bundles-skud-${start}-${end}.csv`
    );
  }
  function exportImplicit() {
    exportToCSV(
      implicitBundles.map((c) => ({
        Range: c.rangeSku,
        Hood: c.hoodSku,
        Orders: c.orderCount,
        RangeUnits: c.rangeUnits,
        HoodUnits: c.hoodUnits,
        GrossRevenue: c.grossRevenue.toFixed(2),
      })),
      `bundles-implicit-${start}-${end}.csv`
    );
  }
  function exportWeekly() {
    exportToCSV(
      weekly.map((w) => ({
        WeekStart: w.weekStart,
        SkudOrders: w.skudOrders,
        ImplicitOrders: w.implicitOrders,
        SkudUnits: w.skudUnits,
        ImplicitUnits: w.implicitUnits,
        TotalUnits: w.totalUnits,
        Revenue: w.revenue.toFixed(2),
      })),
      `bundles-weekly-${start}-${end}.csv`
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-white">Bundles</h1>
          <p className="text-sm text-gray-400 mt-1 max-w-3xl">
            SKU'd bundles (<span className="font-mono text-gray-300">2pc-</span>{" "}
            prefixed products, e.g.{" "}
            <span className="font-mono text-gray-300">2pc-PLSR48GE.PLJW121.48</span>)
            plus implicit bundles — orders where a range (PLSR/PLST) and a hood
            were bought together as separate line items. Draft orders excluded.
          </p>
        </div>
        <DateRangeDropdown value={rangeKey} onChange={setRangeKey} />
      </div>

      {error && (
        <div className="rounded-lg border border-red-900 bg-red-950/40 text-red-300 px-4 py-3 text-sm">
          {error}
        </div>
      )}

      {/* Headline KPIs */}
      {loading || !summary ? (
        <KPISkeleton count={4} />
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KPI
            label="SKU'd bundle orders"
            value={summary.skudBundles.orders.toLocaleString()}
            sub={`${summary.skudBundles.productCount} unique bundle SKUs`}
          />
          <KPI
            label="Implicit bundle orders"
            value={summary.implicitBundles.orders.toLocaleString()}
            sub={`${summary.implicitBundles.comboCount} unique combos`}
          />
          <KPI
            label="Attach rate"
            value={fmtPct(summary.attachRate.rate)}
            sub={`${summary.attachRate.ordersWithRangeAndHood} of ${summary.attachRate.ordersWithRange} range orders`}
          />
          <KPI
            label="Bundle revenue"
            value={fmtC(summary.skudBundles.netRevenue + summary.implicitBundles.grossRevenue)}
            sub="SKU'd net + implicit combined"
          />
        </div>
      )}

      {/* Weekly report */}
      <Section
        title="Weekly report"
        subtitle="Bundle orders and units by ISO week (Monday-start). Stacked: SKU'd vs implicit."
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
        ) : weekly.length === 0 ? (
          <Empty msg="No bundle activity in this window." />
        ) : (
          <WeeklyChart rows={weekly} />
        )}
      </Section>

      {/* SKU'd bundles */}
      <Section
        title="SKU'd bundles (2pc-)"
        subtitle="One row per bundle product. Sorted by gross revenue."
        action={
          <button
            onClick={exportSkud}
            className="px-3 py-1.5 text-xs rounded-lg bg-gray-800 text-gray-200 hover:bg-gray-700"
          >
            Export
          </button>
        }
      >
        {loading ? (
          <TableSkeleton rows={4} />
        ) : skuBundles.length === 0 ? (
          <Empty msg="No SKU'd bundle sales in this window. (These products are new — expect this to fill in over time.)" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-950/50 text-gray-400 text-xs uppercase tracking-wider">
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium">Bundle SKU</th>
                  <th className="text-left px-4 py-2.5 font-medium">Range</th>
                  <th className="text-left px-4 py-2.5 font-medium">Hood</th>
                  <th className="text-right px-4 py-2.5 font-medium">Orders</th>
                  <th className="text-right px-4 py-2.5 font-medium">Units</th>
                  <th className="text-right px-4 py-2.5 font-medium">Avg Price</th>
                  <th className="text-right px-4 py-2.5 font-medium">Net Revenue</th>
                  <th className="text-right px-4 py-2.5 font-medium">Last Sold</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {skuBundles.map((b) => (
                  <tr key={b.sku} className="hover:bg-gray-800/40">
                    <td className="px-4 py-2.5 font-mono text-xs text-gray-200">{b.sku}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-gray-400">{b.rangePart || "—"}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-gray-400">{b.hoodPart || "—"}</td>
                    <td className="px-4 py-2.5 text-right text-gray-300">{b.orderCount}</td>
                    <td className="px-4 py-2.5 text-right text-gray-200">{b.unitsSold}</td>
                    <td className="px-4 py-2.5 text-right text-gray-300">{fmtC(b.avgPrice)}</td>
                    <td className="px-4 py-2.5 text-right text-gray-100 font-medium">{fmtC(b.netRevenue)}</td>
                    <td className="px-4 py-2.5 text-right text-gray-400 text-xs whitespace-nowrap">
                      {b.lastSold ?? "—"}
                      {b.firstSold && b.firstSold !== b.lastSold && (
                        <div className="text-[10px] text-gray-600">first: {b.firstSold}</div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* Implicit bundles */}
      <Section
        title="Implicit bundles (range + hood, same order)"
        subtitle="Customers who bought a range and a hood as separate line items in the same checkout. Ranked by order count."
        action={
          <button
            onClick={exportImplicit}
            className="px-3 py-1.5 text-xs rounded-lg bg-gray-800 text-gray-200 hover:bg-gray-700"
          >
            Export
          </button>
        }
      >
        {loading ? (
          <TableSkeleton rows={6} />
        ) : implicitBundles.length === 0 ? (
          <Empty msg="No range + hood co-purchases in this window." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-950/50 text-gray-400 text-xs uppercase tracking-wider">
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium">Range SKU</th>
                  <th className="text-left px-4 py-2.5 font-medium">Hood SKU</th>
                  <th className="text-right px-4 py-2.5 font-medium">Orders</th>
                  <th className="text-right px-4 py-2.5 font-medium">Range Units</th>
                  <th className="text-right px-4 py-2.5 font-medium">Hood Units</th>
                  <th className="text-right px-4 py-2.5 font-medium">Combined Revenue</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {implicitBundles.map((c) => (
                  <tr key={`${c.rangeSku}|${c.hoodSku}`} className="hover:bg-gray-800/40">
                    <td className="px-4 py-2.5 font-mono text-xs text-gray-200">{c.rangeSku}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-gray-200">{c.hoodSku}</td>
                    <td className="px-4 py-2.5 text-right text-gray-300">{c.orderCount}</td>
                    <td className="px-4 py-2.5 text-right text-gray-200">{c.rangeUnits}</td>
                    <td className="px-4 py-2.5 text-right text-gray-200">{c.hoodUnits}</td>
                    <td className="px-4 py-2.5 text-right text-gray-100 font-medium">{fmtC(c.grossRevenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* Bundle sales detail */}
      <Section
        title="Bundle sales detail"
        subtitle="Every bundle (SKU'd or implicit) sold in this window — date, order, customer, channel, state."
        action={
          <div className="flex items-center gap-2">
            {(["all", "skud", "implicit"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setSalesFilter(f)}
                className={`px-2.5 py-1 text-[11px] rounded-full border transition-colors ${
                  salesFilter === f
                    ? "bg-blue-600/20 border-blue-600 text-blue-300"
                    : "bg-gray-900 border-gray-700 text-gray-400 hover:text-gray-200"
                }`}
              >
                {f === "all" ? "All" : f === "skud" ? "SKU'd" : "Implicit"}
              </button>
            ))}
          </div>
        }
      >
        {loading ? (
          <TableSkeleton rows={6} />
        ) : visibleSales.length === 0 ? (
          <Empty msg="No bundle sales in this window." />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-950/50 text-gray-400 text-xs uppercase tracking-wider">
                  <tr>
                    <th className="text-left px-4 py-2.5 font-medium">Date</th>
                    <th className="text-left px-4 py-2.5 font-medium">Order</th>
                    <th className="text-left px-4 py-2.5 font-medium">Kind</th>
                    <th className="text-left px-4 py-2.5 font-medium">Range</th>
                    <th className="text-left px-4 py-2.5 font-medium">Hood</th>
                    <th className="text-left px-4 py-2.5 font-medium">Customer</th>
                    <th className="text-left px-4 py-2.5 font-medium">State</th>
                    <th className="text-left px-4 py-2.5 font-medium">Channel</th>
                    <th className="text-right px-4 py-2.5 font-medium">Qty</th>
                    <th className="text-right px-4 py-2.5 font-medium">Revenue</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {visibleSales.map((s, i) => (
                    <tr key={`${s.orderName}-${s.rangeSku}-${s.hoodSku}-${i}`} className="hover:bg-gray-800/40">
                      <td className="px-4 py-2.5 text-gray-300 whitespace-nowrap">{s.date}</td>
                      <td className="px-4 py-2.5 font-mono text-xs text-gray-300">{s.orderName}</td>
                      <td className="px-4 py-2.5">
                        <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider ${
                          s.kind === "skud" ? "bg-emerald-900/40 text-emerald-300" : "bg-sky-900/40 text-sky-300"
                        }`}>
                          {s.kind === "skud" ? "SKU'd" : "Implicit"}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs text-gray-200">{s.rangeSku}</td>
                      <td className="px-4 py-2.5 font-mono text-xs text-gray-200">{s.hoodSku}</td>
                      <td className="px-4 py-2.5 text-gray-300 max-w-[180px] truncate" title={s.customer}>{s.customer || "—"}</td>
                      <td className="px-4 py-2.5 text-gray-400">{s.state || "—"}</td>
                      <td className="px-4 py-2.5">
                        <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider ${channelPill(s.channel)}`}>
                          {s.channel}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right text-gray-200">{s.quantity}</td>
                      <td className="px-4 py-2.5 text-right text-gray-100 font-medium">{fmtC(s.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {filteredSales.length > 50 && (
              <div className="px-5 py-2.5 border-t border-gray-800 flex items-center justify-between text-xs text-gray-500">
                <span>Showing {visibleSales.length} of {filteredSales.length.toLocaleString()}</span>
                <button
                  onClick={() => setShowAllSales((v) => !v)}
                  className="text-blue-400 hover:text-blue-300"
                >
                  {showAllSales ? "Show top 50" : "Show all"}
                </button>
              </div>
            )}
          </>
        )}
      </Section>
    </div>
  );
}

function WeeklyChart({ rows }: { rows: WeekRow[] }) {
  const maxUnits = Math.max(1, ...rows.map((r) => r.totalUnits));
  return (
    <div className="px-5 pt-4 pb-2">
      {/* Legend */}
      <div className="flex items-center gap-3 mb-2 text-[11px] text-gray-400">
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500/80" /> SKU'd
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm bg-sky-500/80" /> Implicit
        </span>
      </div>
      <div className="flex items-end gap-1.5 h-32">
        {rows.map((w) => {
          const totalH = Math.max(2, (w.totalUnits / maxUnits) * 100);
          const skudFrac = w.totalUnits > 0 ? w.skudUnits / w.totalUnits : 0;
          return (
            <div
              key={w.weekStart}
              className="flex-1 group relative flex flex-col justify-end min-w-[20px]"
              title={`Week of ${w.weekStart} — ${w.totalUnits} units (SKU'd ${w.skudUnits} / implicit ${w.implicitUnits}), ${fmtC(w.revenue)}`}
            >
              <div className="w-full rounded-t overflow-hidden flex flex-col" style={{ height: `${totalH}%` }}>
                <div className="bg-emerald-500/80" style={{ height: `${skudFrac * 100}%` }} />
                <div className="bg-sky-500/80 flex-1" />
              </div>
              <div className="absolute -top-7 left-1/2 -translate-x-1/2 px-1.5 py-0.5 text-[10px] bg-gray-950 text-gray-200 rounded border border-gray-800 opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-10">
                {w.totalUnits}u · {fmtC(w.revenue)}
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
              <th className="text-right px-4 py-2 font-medium">SKU'd Orders</th>
              <th className="text-right px-4 py-2 font-medium">Implicit Orders</th>
              <th className="text-right px-4 py-2 font-medium">Total Units</th>
              <th className="text-right px-4 py-2 font-medium">Revenue</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {[...rows].reverse().map((w) => (
              <tr key={w.weekStart} className="hover:bg-gray-800/40">
                <td className="px-4 py-2 text-gray-200 whitespace-nowrap">
                  {fmtDate(w.weekStart)} <span className="text-gray-500 text-xs">{w.weekStart}</span>
                </td>
                <td className="px-4 py-2 text-right text-emerald-300">{w.skudOrders}</td>
                <td className="px-4 py-2 text-right text-sky-300">{w.implicitOrders}</td>
                <td className="px-4 py-2 text-right text-gray-100 font-medium">{w.totalUnits}</td>
                <td className="px-4 py-2 text-right text-gray-200">{fmtC(w.revenue)}</td>
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
