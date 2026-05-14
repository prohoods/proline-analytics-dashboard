"use client";

// Bundle analytics — covers both Shopify-SKU'd bundles ("2pc-...") and
// implicit bundles (a range and a hood checked out in the same order
// without the bundle SKU).

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
  rangeCost: number | null;
  hoodCost: number | null;
  landedCostPerUnit: number | null;
  totalCOGS: number | null;
  grossProfit: number | null;
  grossMarginPct: number | null;
}

interface ImplicitBundle {
  rangeSku: string;
  hoodSku: string;
  orderCount: number;
  rangeUnits: number;
  hoodUnits: number;
  grossRevenue: number;
}

interface Summary {
  skudBundles: { productCount: number; orders: number; unitsSold: number; netRevenue: number; grossProfit: number };
  implicitBundles: { comboCount: number; orders: number; grossRevenue: number };
  attachRate: { ordersWithRange: number; ordersWithRangeAndHood: number; rate: number };
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

export default function BundlesPage() {
  const [rangeKey, setRangeKey] = useState<RangeKey>("ytd");
  const [skuBundles, setSkuBundles] = useState<SkudBundle[]>([]);
  const [implicitBundles, setImplicitBundles] = useState<ImplicitBundle[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [start, end]);

  function exportSkud() {
    exportToCSV(
      skuBundles.map((b) => ({
        SKU: b.sku,
        Range: b.rangePart,
        Hood: b.hoodPart,
        Orders: b.orderCount,
        Units: b.unitsSold,
        NetRevenue: b.netRevenue.toFixed(2),
        GrossProfit: b.grossProfit?.toFixed(2) ?? "",
        MarginPct: b.grossMarginPct?.toFixed(1) ?? "",
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

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-white">Bundles</h1>
          <p className="text-sm text-gray-400 mt-1 max-w-3xl">
            Two flavors of bundle: SKU'd bundles (the new{" "}
            <span className="font-mono text-gray-300">2pc-</span> prefixed
            Shopify products, e.g.{" "}
            <span className="font-mono text-gray-300">2pc-PLSR48GE.PLJW121.48</span>
            ), and implicit bundles — orders where a customer checked out with
            a range (PLSR / PLST) and a hood as separate line items.
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
            sub={`${fmtC(summary.skudBundles.grossProfit)} GP on SKU'd bundles`}
          />
        </div>
      )}

      {/* SKU'd bundles */}
      <Section
        title="SKU'd bundles (2pc-)"
        subtitle="One row per bundle product. COGS = range cost + hood cost + tariff."
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
                  <th className="text-right px-4 py-2.5 font-medium">Cost / Unit</th>
                  <th className="text-right px-4 py-2.5 font-medium">Gross Profit</th>
                  <th className="text-right px-4 py-2.5 font-medium">Margin</th>
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
                    <td className="px-4 py-2.5 text-right text-gray-400">
                      {b.landedCostPerUnit != null ? fmtC(b.landedCostPerUnit) : <span className="text-amber-500">no cogs</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right text-gray-100 font-medium">
                      {b.grossProfit != null ? fmtC(b.grossProfit) : "—"}
                    </td>
                    <td className={`px-4 py-2.5 text-right font-medium ${marginColor(b.grossMarginPct)}`}>
                      {fmtPct(b.grossMarginPct)}
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
