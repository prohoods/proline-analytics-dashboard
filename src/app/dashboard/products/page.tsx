"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import DateRangeDropdown from "@/components/DateRangeDropdown";
import { RangeKey, getRange } from "@/lib/date-ranges";
import { KPISkeleton, TableSkeleton } from "@/components/Skeleton";
import { exportToCSV } from "@/lib/export-csv";

interface RefundIncident {
  orderName: string;
  date: string;
  quantity: number;
  amount: number;
  note: string;
}

interface ZoneRow {
  zip3: string;
  shipments: number;
  totalCost: number;
  avgCost: number;
}

interface ZoneBreakdownRow {
  zip3: string;
  state: string;
  shipments: number;
  totalCost: number;
  avgCost: number;
}

type Category = "Range Hood" | "BBQ Hood" | "Insert" | "Parts" | "Other";

interface CategoryBreakdown {
  category: Category;
  shipments: number;
  totalCost: number;
  avgCost: number;
}

interface StateBreakdownRow {
  state: string;
  shipments: number;
  totalCost: number;
  avgCost: number;
  byCategory: CategoryBreakdown[];
}

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
  tariffPerUnit: number | null;
  landedCostPerUnit: number | null;
  baseCOGS: number | null;
  totalTariff: number | null;
  totalCOGS: number | null;
  grossProfit: number | null;
  grossMarginPct: number | null;
  shippingCost: number;
  avgShippingPerUnit: number | null;
  shippedUnits: number;
  trueProfit: number | null;
  trueMarginPct: number | null;
  topZones: ZoneRow[];
  refundIncidents: RefundIncident[];
}

interface Summary {
  totalGross: number;
  totalNet: number;
  totalUnits: number;
  totalBaseCOGS: number;
  totalTariff: number;
  totalCOGS: number;
  totalProfit: number;
  overallMarginPct: number;
  productCount: number;
  coveredProducts: number;
  tariffRate: number;
  totalShipping: number;
  totalTrueProfit: number;
  trueMarginPct: number;
  shippingCoveredOrders: number;
  totalOrdersInWindow: number;
}

const fmt = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
const fmt2 = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
const fmtN = (n: number) => new Intl.NumberFormat("en-US").format(n);
const fmtPct = (n: number) => n.toFixed(1) + "%";

type SortKey =
  | "grossRevenue" | "netRevenue" | "unitsSold" | "refundRate" | "avgPrice"
  | "grossProfit" | "grossMarginPct" | "totalCOGS"
  | "avgShippingPerUnit" | "trueMarginPct";

// Dictionary of every metric on the page — what it means, how it's computed,
// and where the data comes from. Surfaces in <Explainer> popovers.
type Explainer = {
  title: string;
  what: string;          // plain-English definition
  formula: string;       // math
  source: string;        // where the underlying data comes from
  notes?: string;        // gotchas / nuances
};

const EX: Record<string, Explainer> = {
  grossRevenue: {
    title: "Gross Revenue",
    what: "Total dollars Shopify charged customers before any refunds, taxes, or fees.",
    formula: "Σ (line item price × quantity) across orders created in the date range.",
    source: "Shopify Orders API — line_items[].price × quantity.",
    notes: "Includes the full order amount even on partially-refunded orders. The refund hit shows up separately in Net Revenue.",
  },
  netRevenue: {
    title: "Net Revenue",
    what: "Gross Revenue minus refunded amounts — the dollars we actually kept.",
    formula: "Gross Revenue − Refunded Revenue.",
    source: "Shopify Orders API. Refunds use the refund's own date, not the original order date.",
    notes: "A refund processed in the current window on a March order still counts here.",
  },
  totalCOGS: {
    title: "Total COGS (landed)",
    what: "What it cost us to buy and import the goods we sold (after tariffs).",
    formula: "Landed cost per unit × Net Units sold (refunded units excluded).",
    source: "Base supplier cost per SKU from our cost sheet × (1 + 45% tariff). Tariff rate lives in lib/constants.ts.",
    notes: "SKUs without a cost sheet entry are excluded — they show '—' in the COGS column and are flagged in the SKUs Tracked tile.",
  },
  grossProfit: {
    title: "Gross Profit",
    what: "What's left after we pay for the goods and import duties — but before shipping, ads, or overhead.",
    formula: "Net Revenue − Total COGS (landed).",
    source: "Calculated. Only includes SKUs with a known cost.",
    notes: "Still excludes shipping. See True Profit for the version that subtracts shipping.",
  },
  overallMargin: {
    title: "Overall Margin",
    what: "What percent of our net revenue is profit, before shipping/ads/overhead.",
    formula: "Gross Profit ÷ Net Revenue.",
    source: "Calculated.",
  },
  avgProfitPerUnit: {
    title: "Avg Profit / Unit",
    what: "Average gross profit on each unit shipped.",
    formula: "Total Gross Profit ÷ Total Units Sold.",
    source: "Calculated. Skews lower when SKUs without COGS are included in unit count.",
  },
  skusTracked: {
    title: "SKUs Tracked",
    what: "How many of your active SKUs we have a supplier cost for. Profit/margin numbers only include this slice.",
    formula: "Count of SKUs with a cost sheet entry / Total SKUs sold.",
    source: "Cost sheet (lib/cogs.ts) vs. Shopify Orders.",
  },
  avgSellingPrice: {
    title: "Avg Selling Price",
    what: "The average price you sold a unit for in this window.",
    formula: "Gross Revenue ÷ Total Units Sold.",
    source: "Shopify Orders.",
  },
  totalShipping: {
    title: "Total Shipping Cost",
    what: "What we paid carriers (UPS/USPS/FedEx) to ship outbound packages.",
    formula: "Sum of label rates from REDO export, deduped by tracking number.",
    source: "REDO CSV uploaded to our Postgres. Joined to Shopify orders by order number.",
    notes: "Shows the 'matched' ratio — orders that didn't match to a REDO row are excluded. SHL orders typically don't match.",
  },
  totalTrueProfit: {
    title: "True Profit (after shipping)",
    what: "Gross profit minus what we paid carriers — closer to real take-home before ads & overhead.",
    formula: "Gross Profit − Total Shipping Cost.",
    source: "Calculated.",
    notes: "Still doesn't include ad spend, payment processing fees, or fixed overhead.",
  },
  trueMargin: {
    title: "True Margin %",
    what: "Margin after shipping is factored in. The most realistic single % on this page.",
    formula: "(Gross Profit − Shipping) ÷ Net Revenue.",
    source: "Calculated.",
  },
  avgShippingPerOrder: {
    title: "Avg Shipping / Order",
    what: "Average label cost per order — a sanity-check on freight inflation.",
    formula: "Total Shipping ÷ Orders matched to a shipping record.",
    source: "REDO CSV joined to Shopify Orders.",
  },
  // Modal-only / column header explainers
  unitsSold: {
    title: "Units Sold",
    what: "Total quantity ordered in the window (before refunds).",
    formula: "Σ line_items.quantity.",
    source: "Shopify Orders.",
  },
  refundRate: {
    title: "Refund Rate",
    what: "What percent of units sold get refunded.",
    formula: "Refunded Units ÷ Units Sold.",
    source: "Shopify Refunds. Refunded units count toward the order's date even if the refund was processed later.",
  },
  avgPrice: {
    title: "Avg Price",
    what: "Average selling price for this SKU in the window.",
    formula: "Gross Revenue ÷ Units Sold.",
    source: "Shopify Orders.",
  },
  baseCostPerUnit: {
    title: "Base Cost / Unit",
    what: "Supplier price for one unit, before import duties.",
    formula: "From the cost sheet, matched by SKU.",
    source: "lib/cogs.ts.",
  },
  tariffPerUnit: {
    title: "Tariff / Unit",
    what: "Import duty per unit at the current 45% rate.",
    formula: "Base Cost × 0.45.",
    source: "Rate stored in lib/constants.ts (TARIFF_RATE).",
    notes: "Editing the constant updates every margin calc on the dashboard at once.",
  },
  landedPerUnit: {
    title: "Landed / Unit",
    what: "Real cost we incur per unit after both supplier price and tariff.",
    formula: "Base + Tariff.",
    source: "Calculated.",
  },
  marginPct: {
    title: "Margin %",
    what: "Margin before shipping. Use True Margin for the real number.",
    formula: "Gross Profit ÷ Net Revenue.",
    source: "Calculated.",
  },
  marginNoTariff: {
    title: "Margin without tariff",
    what: "Hypothetical margin if there were no import duty — useful for what-if analysis.",
    formula: "(Net Revenue − Base COGS) ÷ Net Revenue.",
    source: "Calculated.",
  },
  shipPerUnit: {
    title: "Ship / Unit",
    what: "Average shipping cost allocated to each unit of this SKU.",
    formula: "Shipping cost (allocated by quantity) ÷ Units shipped (for this SKU).",
    source: "REDO CSV joined to Shopify orders. When an order has multiple SKUs, the order's shipping is split across them by quantity.",
    notes: "Shown as '—' when none of this SKU's orders matched a REDO row.",
  },
  totalShippingSku: {
    title: "Total Shipping (this SKU)",
    what: "Total label cost allocated to this SKU across all its orders in the window.",
    formula: "Σ (order shipping × this SKU's quantity ÷ total order quantity).",
    source: "Calculated.",
  },
  trueProfitSku: {
    title: "True Profit (this SKU)",
    what: "Gross profit on this SKU after the allocated shipping cost is taken out.",
    formula: "Gross Profit − Total Shipping.",
    source: "Calculated.",
  },
  trueMarginSku: {
    title: "True Margin %",
    what: "Margin on this SKU after shipping. The most realistic single number for this SKU.",
    formula: "(Gross Profit − Shipping) ÷ Net Revenue.",
    source: "Calculated.",
  },
  topZones: {
    title: "Avg shipping by destination ZIP3",
    what: "What it costs to ship this product to different parts of the country, grouped by the first 3 digits of the destination ZIP.",
    formula: "Σ allocated shipping ÷ units shipped, grouped by ZIP3.",
    source: "REDO CSV joined to each order's Shopify shipping_address.zip.",
    notes: "ZIP3 buckets correspond loosely to carrier shipping zones, so this is a reasonable estimate of cost-to-deliver per region. Top 10 zones by shipment volume.",
  },
};

function ExplainerPopover({ ex, onClose }: { ex: Explainer; onClose: () => void }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md bg-gray-900 border border-gray-700 rounded-xl shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-800 flex items-start justify-between gap-3">
          <div>
            <div className="text-xs text-blue-400 uppercase tracking-wide mb-1">How this is calculated</div>
            <div className="text-white font-semibold text-lg">{ex.title}</div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="px-5 py-4 space-y-3 text-sm">
          <div>
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">What it means</div>
            <div className="text-gray-200 leading-relaxed">{ex.what}</div>
          </div>
          <div>
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Formula</div>
            <div className="text-gray-200 font-mono text-xs bg-gray-800/60 rounded px-2 py-1.5">{ex.formula}</div>
          </div>
          <div>
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Where the data comes from</div>
            <div className="text-gray-300 leading-relaxed">{ex.source}</div>
          </div>
          {ex.notes && (
            <div className="bg-yellow-900/15 border border-yellow-800/30 rounded px-3 py-2">
              <div className="text-xs text-yellow-500 uppercase tracking-wide mb-1">Heads up</div>
              <div className="text-yellow-200/90 text-xs leading-relaxed">{ex.notes}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function InfoIcon() {
  return (
    <svg className="w-3.5 h-3.5 text-gray-500 group-hover:text-blue-400 transition-colors" fill="currentColor" viewBox="0 0 20 20">
      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2h-1V9z" clipRule="evenodd" />
    </svg>
  );
}

// Wraps a tile with click-to-explain. The whole tile is clickable; an info
// icon next to the label hints at it.
function KPITile({
  exKey, label, value, sub, className = "", onClick,
}: {
  exKey: keyof typeof EX | string;
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  className?: string;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={`bg-gray-900 border rounded-xl p-5 cursor-pointer transition-colors hover:border-gray-600 group ${className}`}
    >
      <div className="flex items-center gap-1.5 mb-1">
        <div className="text-xs text-gray-500 uppercase tracking-wide">{label}</div>
        <InfoIcon />
      </div>
      <div className="text-2xl font-bold">{value}</div>
      {sub && <div className="text-xs text-gray-500 mt-1">{sub}</div>}
      <div className="hidden">{exKey}</div>
    </div>
  );
}

// Smaller version used inside the detail modal.
function MetricCard({
  exKey, label, value, sub, onClick,
}: {
  exKey: string;
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <div onClick={onClick} className="bg-gray-800/60 rounded-lg p-3 cursor-pointer hover:bg-gray-800 group transition-colors">
      <div className="flex items-center gap-1.5 mb-1">
        <div className="text-xs text-gray-500 uppercase tracking-wide">{label}</div>
        <InfoIcon />
      </div>
      <div className="text-lg font-bold text-white">{value}</div>
      {sub && <div className="text-xs text-gray-500 mt-0.5">{sub}</div>}
      <div className="hidden">{exKey}</div>
    </div>
  );
}

function ProductDetailPanel({
  product, onClose, onExplain,
}: {
  product: Product;
  onClose: () => void;
  onExplain: (key: string) => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const marginColor = product.grossMarginPct == null ? "text-gray-500"
    : product.grossMarginPct >= 50 ? "text-green-400"
    : product.grossMarginPct >= 30 ? "text-yellow-400"
    : "text-red-400";

  return (
    <div className="fixed inset-0 bg-black/50 z-40 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-lg max-h-[90vh] bg-gray-900 border border-gray-700 rounded-xl z-50 overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-gray-900 border-b border-gray-800 px-5 py-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Product Detail</div>
            <div className="font-mono text-white font-semibold">{product.sku || "—"}</div>
            <div className="text-gray-400 text-sm mt-0.5 leading-snug">{product.title}</div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors flex-shrink-0 mt-0.5">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-5 py-5 space-y-5">
          <div className="bg-blue-900/15 border border-blue-800/30 rounded-lg px-3 py-2 text-xs text-blue-300/80">
            Click any tile below to see its formula, data source, and gotchas.
          </div>

          {/* Revenue */}
          <div>
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-3">Revenue</div>
            <div className="grid grid-cols-2 gap-2.5">
              <MetricCard exKey="grossRevenue" label="Gross Revenue" value={fmt(product.grossRevenue)} onClick={() => onExplain("grossRevenue")} />
              <MetricCard exKey="netRevenue" label="Net Revenue" value={fmt(product.netRevenue)} sub="After refunds" onClick={() => onExplain("netRevenue")} />
              <MetricCard exKey="avgPrice" label="Avg Price" value={fmt2(product.avgPrice)} onClick={() => onExplain("avgPrice")} />
              <MetricCard
                exKey="refundRate"
                label="Refund Rate"
                value={
                  <span className={product.refundRate > 10 ? "text-red-400" : product.refundRate > 5 ? "text-yellow-400" : "text-green-400"}>
                    {fmtPct(product.refundRate)}
                  </span>
                }
                sub={`${fmt(product.refundedRevenue)} refunded`}
                onClick={() => onExplain("refundRate")}
              />
            </div>
          </div>

          <div className="border-t border-gray-800" />

          {/* Volume */}
          <div>
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-3">Volume</div>
            <div className="grid grid-cols-3 gap-2.5">
              <MetricCard exKey="unitsSold" label="Units Sold" value={fmtN(product.unitsSold)} onClick={() => onExplain("unitsSold")} />
              <MetricCard exKey="refundRate" label="Refunded" value={fmtN(product.refundedUnits)} onClick={() => onExplain("refundRate")} />
              <MetricCard exKey="unitsSold" label="Net Units" value={fmtN(product.netUnits)} onClick={() => onExplain("unitsSold")} />
            </div>
          </div>

          {product.refundIncidents.length > 0 && (
            <>
              <div className="border-t border-gray-800" />
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="text-xs text-gray-500 uppercase tracking-wide">Why it was refunded</div>
                  <div className="text-xs text-gray-600">{product.refundIncidents.length} {product.refundIncidents.length === 1 ? "refund" : "refunds"}</div>
                </div>
                <div className="bg-gray-800/40 rounded-lg divide-y divide-gray-800 max-h-64 overflow-y-auto">
                  {product.refundIncidents.map((inc, i) => (
                    <div key={i} className="px-3 py-2.5 text-xs">
                      <div className="flex items-center justify-between gap-3 mb-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-blue-400">{inc.orderName}</span>
                          <span className="text-gray-500">{inc.date}</span>
                          <span className="text-gray-600">· {inc.quantity}×</span>
                        </div>
                        <span className="text-red-400 font-medium tabular-nums">({fmt2(inc.amount)})</span>
                      </div>
                      <div className={`${inc.note ? "text-gray-300" : "text-gray-600 italic"} leading-snug`}>
                        {inc.note || "No reason provided"}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          <div className="border-t border-gray-800" />

          {/* COGS & Margin */}
          <div>
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-3">COGS & Margin (before shipping)</div>
            {product.costPerUnit == null ? (
              <div className="bg-gray-800/40 rounded-lg p-4 text-sm text-gray-500">
                No COGS data for this SKU. Add it to the cost sheet to see margin analysis.
              </div>
            ) : (
              <div className="space-y-2.5">
                <div className="grid grid-cols-3 gap-2.5">
                  <MetricCard exKey="baseCostPerUnit" label="Base Cost / Unit" value={fmt2(product.costPerUnit)} sub="Supplier price" onClick={() => onExplain("baseCostPerUnit")} />
                  <MetricCard exKey="tariffPerUnit" label="Tariff / Unit (45%)" value={<span className="text-orange-400">{fmt2(product.tariffPerUnit ?? 0)}</span>} sub="Import duty" onClick={() => onExplain("tariffPerUnit")} />
                  <MetricCard exKey="landedPerUnit" label="Landed / Unit" value={<span className="text-red-400">{fmt2(product.landedCostPerUnit ?? 0)}</span>} sub="Base + tariff" onClick={() => onExplain("landedPerUnit")} />
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  <MetricCard exKey="totalCOGS" label="Total COGS (landed)" value={<span className="text-red-400">{fmt(product.totalCOGS!)}</span>} sub={`${fmtN(product.netUnits)} net units · incl. ${fmt(product.totalTariff ?? 0)} tariff`} onClick={() => onExplain("totalCOGS")} />
                  <MetricCard exKey="grossProfit" label="Gross Profit" value={
                    <span className={product.grossProfit! >= 0 ? "text-green-400" : "text-red-400"}>{fmt(product.grossProfit!)}</span>
                  } onClick={() => onExplain("grossProfit")} />
                  <MetricCard exKey="marginPct" label="Margin %" value={
                    <span className={marginColor}>{fmtPct(product.grossMarginPct!)}</span>
                  } sub="Profit ÷ Net Revenue" onClick={() => onExplain("marginPct")} />
                  <MetricCard exKey="marginNoTariff" label="Margin without tariff" value={
                    <span className="text-gray-300">{product.netRevenue > 0 && product.baseCOGS != null ? fmtPct(((product.netRevenue - product.baseCOGS) / product.netRevenue) * 100) : "—"}</span>
                  } sub="Hypothetical, base cost only" onClick={() => onExplain("marginNoTariff")} />
                </div>
                <div className="bg-gray-800/60 rounded-lg p-3">
                  <div className="flex justify-between text-xs text-gray-500 mb-1.5">
                    <span>Margin breakdown (no shipping)</span>
                    <span>{fmtPct(product.grossMarginPct!)} margin</span>
                  </div>
                  <div className="h-3 bg-gray-700 rounded-full overflow-hidden flex">
                    <div
                      className={`h-full rounded-full transition-all ${product.grossMarginPct! >= 50 ? "bg-green-500" : product.grossMarginPct! >= 30 ? "bg-yellow-500" : "bg-red-500"}`}
                      style={{ width: `${Math.min(100, Math.max(0, product.grossMarginPct!))}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-xs mt-1.5 text-gray-500">
                    <span>COGS {fmtPct(100 - product.grossMarginPct!)}</span>
                    <span>Profit {fmtPct(product.grossMarginPct!)}</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="border-t border-gray-800" />

          {/* Shipping */}
          <div>
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-3">Shipping & True Margin</div>
            {product.shippedUnits === 0 ? (
              <div className="bg-gray-800/40 rounded-lg p-4 text-sm text-gray-500">
                No shipping records matched this SKU&apos;s orders. Either it ships through a channel that isn&apos;t in REDO (e.g. SHL), or those orders aren&apos;t in your latest CSV upload.
              </div>
            ) : (
              <div className="space-y-2.5">
                <div className="grid grid-cols-2 gap-2.5">
                  <MetricCard exKey="totalShippingSku" label="Total Shipping" value={<span className="text-orange-400">{fmt(product.shippingCost)}</span>} sub={`${fmtN(product.shippedUnits)} units shipped`} onClick={() => onExplain("totalShippingSku")} />
                  <MetricCard exKey="shipPerUnit" label="Avg Ship / Unit" value={product.avgShippingPerUnit != null ? fmt2(product.avgShippingPerUnit) : "—"} onClick={() => onExplain("shipPerUnit")} />
                  {product.trueProfit != null && (
                    <MetricCard exKey="trueProfitSku" label="True Profit" value={
                      <span className={product.trueProfit >= 0 ? "text-emerald-400" : "text-red-400"}>{fmt(product.trueProfit)}</span>
                    } sub="Gross Profit − Shipping" onClick={() => onExplain("trueProfitSku")} />
                  )}
                  {product.trueMarginPct != null && (
                    <MetricCard exKey="trueMarginSku" label="True Margin %" value={
                      <span className={product.trueMarginPct >= 50 ? "text-green-400" : product.trueMarginPct >= 30 ? "text-yellow-400" : "text-red-400"}>
                        {fmtPct(product.trueMarginPct)}
                      </span>
                    } sub="After shipping" onClick={() => onExplain("trueMarginSku")} />
                  )}
                </div>
                {product.grossMarginPct != null && product.trueMarginPct != null && (
                  <div className="bg-gray-800/60 rounded-lg p-3 text-xs">
                    <div className="flex justify-between mb-1.5 text-gray-400">
                      <span>Margin before shipping: <span className="text-gray-200 font-medium">{fmtPct(product.grossMarginPct)}</span></span>
                      <span>True margin: <span className="text-emerald-400 font-medium">{fmtPct(product.trueMarginPct)}</span></span>
                    </div>
                    <div className="text-gray-500">
                      Shipping eats <span className="text-orange-400 font-medium">{fmtPct(product.grossMarginPct - product.trueMarginPct)}</span> of margin on this SKU.
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {product.topZones.length > 0 && (
            <>
              <div className="border-t border-gray-800" />
              <div>
                <div className="flex items-center justify-between mb-3">
                  <button onClick={() => onExplain("topZones")} className="flex items-center gap-1.5 text-xs text-gray-500 uppercase tracking-wide hover:text-gray-300 group">
                    Avg shipping by destination region
                    <InfoIcon />
                  </button>
                  <div className="text-xs text-gray-600">Top {product.topZones.length} ZIP3 zones</div>
                </div>
                <div className="bg-gray-800/40 rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-800/60">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs text-gray-500 uppercase tracking-wide font-semibold">ZIP3</th>
                        <th className="px-3 py-2 text-right text-xs text-gray-500 uppercase tracking-wide font-semibold">Shipments</th>
                        <th className="px-3 py-2 text-right text-xs text-gray-500 uppercase tracking-wide font-semibold">Avg / Unit</th>
                        <th className="px-3 py-2 text-right text-xs text-gray-500 uppercase tracking-wide font-semibold">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800/60">
                      {product.topZones.map(z => (
                        <tr key={z.zip3}>
                          <td className="px-3 py-2 font-mono text-blue-400">{z.zip3}xx</td>
                          <td className="px-3 py-2 text-right text-gray-300">{fmtN(z.shipments)}</td>
                          <td className="px-3 py-2 text-right text-orange-300">{fmt2(z.avgCost)}</td>
                          <td className="px-3 py-2 text-right text-gray-400">{fmt(z.totalCost)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="text-xs text-gray-600 mt-2 leading-relaxed">
                  ZIP3 = first 3 digits of the destination ZIP. Roughly maps to carrier shipping zones — useful as a per-region cost estimate.
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function MarginBadge({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="text-gray-600 text-xs">No COGS</span>;
  const color = pct >= 50 ? "text-green-400" : pct >= 30 ? "text-yellow-400" : "text-red-400";
  return <span className={`font-semibold ${color}`}>{fmtPct(pct)}</span>;
}

// Per-state shipping panel with category breakdown. The user's question:
// "what does it cost to ship a range hood to TX vs parts to TX" — answered
// here by classifying each order by its biggest item and aggregating by
// destination state.
function StateBreakdownPanel({
  rows,
  national,
}: {
  rows: StateBreakdownRow[];
  national: CategoryBreakdown[];
}) {
  const [sortKey, setSortKey] = useState<"shipments" | "avgCost" | "totalCost">("shipments");
  const [filterCategory, setFilterCategory] = useState<Category | "All">("All");
  const [expanded, setExpanded] = useState<string | null>(null);

  const visibleRows = rows.map(r => {
    if (filterCategory === "All") return r;
    const bc = r.byCategory.find(c => c.category === filterCategory);
    return {
      ...r,
      shipments: bc?.shipments ?? 0,
      totalCost: bc?.totalCost ?? 0,
      avgCost: bc && bc.shipments > 0 ? bc.totalCost / bc.shipments : 0,
    };
  }).filter(r => r.shipments > 0);

  const sorted = [...visibleRows].sort((a, b) => b[sortKey] - a[sortKey]);
  const totalShipments = visibleRows.reduce((s, r) => s + r.shipments, 0);
  const totalCost = visibleRows.reduce((s, r) => s + r.totalCost, 0);
  const overallAvg = totalShipments > 0 ? totalCost / totalShipments : 0;

  const cheapest = [...visibleRows].filter(r => r.shipments >= 3).sort((a, b) => a.avgCost - b.avgCost)[0];
  const priciest = [...visibleRows].filter(r => r.shipments >= 3).sort((a, b) => b.avgCost - a.avgCost)[0];

  const SortBtn = ({ k, label }: { k: typeof sortKey; label: string }) => (
    <button
      onClick={() => setSortKey(k)}
      className={`px-3 py-1.5 rounded-lg text-xs transition-colors border ${sortKey === k ? "bg-blue-600/20 border-blue-600/40 text-blue-300" : "bg-gray-800 border-gray-700 text-gray-400 hover:text-gray-200"}`}
    >
      {label}
    </button>
  );

  const CategoryPill = ({ c }: { c: Category | "All" }) => (
    <button
      onClick={() => setFilterCategory(c)}
      className={`px-3 py-1.5 rounded-lg text-xs transition-colors border ${filterCategory === c ? "bg-purple-600/20 border-purple-600/40 text-purple-300" : "bg-gray-800 border-gray-700 text-gray-400 hover:text-gray-200"}`}
    >
      {c}
    </button>
  );

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-800 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-white">Shipping cost by state · category breakdown</div>
          <div className="text-xs text-gray-500 mt-0.5">
            Each order is classified by its biggest item — shipping a range hood costs 5–10× more than shipping parts. Click a state to see all categories.
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <SortBtn k="shipments" label="Most shipments" />
          <SortBtn k="avgCost" label="Highest avg" />
          <SortBtn k="totalCost" label="Most $ spent" />
        </div>
      </div>

      <div className="px-5 py-3 border-b border-gray-800 flex flex-wrap gap-2 items-center">
        <span className="text-xs text-gray-500 uppercase tracking-wide mr-1">Filter:</span>
        <CategoryPill c="All" />
        {(["Range Hood", "BBQ Hood", "Insert", "Parts", "Other"] as const).map(c => {
          const nat = national.find(n => n.category === c);
          if (!nat || nat.shipments === 0) return null;
          return <CategoryPill key={c} c={c} />;
        })}
      </div>

      {/* National per-category averages — gives context for state numbers */}
      {filterCategory === "All" && (
        <div className="px-5 py-3 border-b border-gray-800 bg-gray-950/50">
          <div className="text-xs text-gray-500 uppercase tracking-wide mb-2">National average per shipment, by category</div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {national.filter(c => c.shipments > 0).map(c => (
              <div key={c.category} className="bg-gray-900 border border-gray-800 rounded-lg p-3">
                <div className="text-xs text-gray-500">{c.category}</div>
                <div className="text-lg font-bold text-white mt-1">{fmt2(c.avgCost)}</div>
                <div className="text-xs text-gray-600 mt-0.5">{fmtN(c.shipments)} shipments</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-gray-800">
        <div className="bg-gray-900 p-4">
          <div className="text-xs text-gray-500 uppercase tracking-wide">
            {filterCategory === "All" ? "Overall avg / shipment" : `Avg / ${filterCategory.toLowerCase()} shipment`}
          </div>
          <div className="text-2xl font-bold text-white mt-1">{fmt2(overallAvg)}</div>
          <div className="text-xs text-gray-600 mt-1">{fmtN(totalShipments)} shipments · {visibleRows.length} states</div>
        </div>
        {cheapest && (
          <div className="bg-gray-900 p-4">
            <div className="text-xs text-gray-500 uppercase tracking-wide">Cheapest state</div>
            <div className="text-2xl font-bold text-emerald-400 mt-1">{fmt2(cheapest.avgCost)}</div>
            <div className="text-xs text-gray-600 mt-1 font-mono">{cheapest.state} · {fmtN(cheapest.shipments)} shipments</div>
          </div>
        )}
        {priciest && (
          <div className="bg-gray-900 p-4">
            <div className="text-xs text-gray-500 uppercase tracking-wide">Priciest state</div>
            <div className="text-2xl font-bold text-rose-400 mt-1">{fmt2(priciest.avgCost)}</div>
            <div className="text-xs text-gray-600 mt-1 font-mono">{priciest.state} · {fmtN(priciest.shipments)} shipments</div>
          </div>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-900 border-b border-gray-800">
            <tr>
              <th className="px-4 py-2 text-left text-xs text-gray-500 uppercase tracking-wide font-semibold">State</th>
              <th className="px-4 py-2 text-right text-xs text-gray-500 uppercase tracking-wide font-semibold">Shipments</th>
              <th className="px-4 py-2 text-right text-xs text-gray-500 uppercase tracking-wide font-semibold">Avg Cost</th>
              <th className="px-4 py-2 text-right text-xs text-gray-500 uppercase tracking-wide font-semibold">vs National</th>
              <th className="px-4 py-2 text-right text-xs text-gray-500 uppercase tracking-wide font-semibold">Total Spent</th>
              <th className="px-4 py-2 text-right text-xs text-gray-500 uppercase tracking-wide font-semibold w-12"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {sorted.map(r => {
              const delta = overallAvg > 0 ? ((r.avgCost - overallAvg) / overallAvg) * 100 : 0;
              const deltaColor = delta > 10 ? "text-rose-400" : delta < -10 ? "text-emerald-400" : "text-gray-500";
              const isOpen = expanded === r.state;
              return (
                <Fragment key={r.state}>
                  <tr
                    onClick={() => setExpanded(isOpen ? null : r.state)}
                    className="hover:bg-gray-800/40 cursor-pointer"
                  >
                    <td className="px-4 py-2 font-mono text-blue-400 font-semibold">{r.state}</td>
                    <td className="px-4 py-2 text-right text-gray-300">{fmtN(r.shipments)}</td>
                    <td className="px-4 py-2 text-right text-white font-semibold">{fmt2(r.avgCost)}</td>
                    <td className={`px-4 py-2 text-right ${deltaColor}`}>{delta > 0 ? "+" : ""}{delta.toFixed(0)}%</td>
                    <td className="px-4 py-2 text-right text-gray-400">{fmt(r.totalCost)}</td>
                    <td className="px-4 py-2 text-right text-gray-600 text-xs">{isOpen ? "▾" : "▸"}</td>
                  </tr>
                  {isOpen && filterCategory === "All" && (
                    <tr className="bg-gray-950/60">
                      <td colSpan={6} className="px-6 py-4">
                        <div className="text-xs text-gray-500 uppercase tracking-wide mb-2">{r.state} — by category</div>
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                          {r.byCategory.filter(c => c.shipments > 0).map(c => {
                            const nat = national.find(n => n.category === c.category);
                            const natDelta = nat && nat.avgCost > 0 ? ((c.avgCost - nat.avgCost) / nat.avgCost) * 100 : 0;
                            const natColor = natDelta > 10 ? "text-rose-400" : natDelta < -10 ? "text-emerald-400" : "text-gray-500";
                            return (
                              <div key={c.category} className="bg-gray-900 border border-gray-800 rounded-lg p-3">
                                <div className="text-xs text-gray-500">{c.category}</div>
                                <div className="text-lg font-bold text-white mt-1">{fmt2(c.avgCost)}</div>
                                <div className="text-xs text-gray-600 mt-0.5">{fmtN(c.shipments)} shipments · {fmt(c.totalCost)}</div>
                                {nat && nat.shipments > 0 && (
                                  <div className={`text-xs mt-1 ${natColor}`}>
                                    {natDelta > 0 ? "+" : ""}{natDelta.toFixed(0)}% vs national
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ZoneBreakdownPanel({ rows }: { rows: ZoneBreakdownRow[] }) {
  const [open, setOpen] = useState(false);
  const [sortKey, setSortKey] = useState<"shipments" | "avgCost" | "totalCost">("shipments");
  const [showAll, setShowAll] = useState(false);

  const sorted = [...rows].sort((a, b) => b[sortKey] - a[sortKey]);
  const totalShipments = rows.reduce((s, r) => s + r.shipments, 0);
  const totalCost = rows.reduce((s, r) => s + r.totalCost, 0);
  const overallAvg = totalShipments > 0 ? totalCost / totalShipments : 0;

  const display = showAll ? sorted : sorted.slice(0, 15);
  const cheapest = [...rows].filter(r => r.shipments >= 5).sort((a, b) => a.avgCost - b.avgCost)[0];
  const priciest = [...rows].filter(r => r.shipments >= 5).sort((a, b) => b.avgCost - a.avgCost)[0];

  const SortBtn = ({ k, label }: { k: typeof sortKey; label: string }) => (
    <button
      onClick={() => setSortKey(k)}
      className={`px-3 py-1.5 rounded-lg text-xs transition-colors border ${sortKey === k ? "bg-blue-600/20 border-blue-600/40 text-blue-300" : "bg-gray-800 border-gray-700 text-gray-400 hover:text-gray-200"}`}
    >
      {label}
    </button>
  );

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full px-5 py-4 border-b border-gray-800 flex items-center justify-between hover:bg-gray-800/40 transition-colors"
      >
        <div className="text-left">
          <div className="text-sm font-semibold text-white">Drill deeper: shipping by ZIP3 region</div>
          <div className="text-xs text-gray-500 mt-0.5">
            For when you want sub-state granularity. ZIP3 = first 3 digits of destination ZIP.
          </div>
        </div>
        <span className="text-gray-500 text-xs">{open ? "▾ Hide" : "▸ Show"}</span>
      </button>
      {!open ? null : (<>
      <div className="px-5 py-3 border-b border-gray-800 flex justify-end gap-2">
        <SortBtn k="shipments" label="Most shipments" />
        <SortBtn k="avgCost" label="Highest avg cost" />
        <SortBtn k="totalCost" label="Most $ spent" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-gray-800">
        <div className="bg-gray-900 p-4">
          <div className="text-xs text-gray-500 uppercase tracking-wide">Overall avg / shipment</div>
          <div className="text-2xl font-bold text-white mt-1">{fmt2(overallAvg)}</div>
          <div className="text-xs text-gray-600 mt-1">{fmtN(totalShipments)} shipments · {rows.length} ZIP3 zones</div>
        </div>
        {cheapest && (
          <div className="bg-gray-900 p-4">
            <div className="text-xs text-gray-500 uppercase tracking-wide">Cheapest region</div>
            <div className="text-2xl font-bold text-emerald-400 mt-1">{fmt2(cheapest.avgCost)}</div>
            <div className="text-xs text-gray-600 mt-1 font-mono">
              {cheapest.zip3}xx {cheapest.state && `· ${cheapest.state}`} · {fmtN(cheapest.shipments)} shipments
            </div>
          </div>
        )}
        {priciest && (
          <div className="bg-gray-900 p-4">
            <div className="text-xs text-gray-500 uppercase tracking-wide">Priciest region</div>
            <div className="text-2xl font-bold text-rose-400 mt-1">{fmt2(priciest.avgCost)}</div>
            <div className="text-xs text-gray-600 mt-1 font-mono">
              {priciest.zip3}xx {priciest.state && `· ${priciest.state}`} · {fmtN(priciest.shipments)} shipments
            </div>
          </div>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-900 border-b border-gray-800">
            <tr>
              <th className="px-4 py-2 text-left text-xs text-gray-500 uppercase tracking-wide font-semibold">ZIP3</th>
              <th className="px-4 py-2 text-left text-xs text-gray-500 uppercase tracking-wide font-semibold">State</th>
              <th className="px-4 py-2 text-right text-xs text-gray-500 uppercase tracking-wide font-semibold">Shipments</th>
              <th className="px-4 py-2 text-right text-xs text-gray-500 uppercase tracking-wide font-semibold">Avg Cost</th>
              <th className="px-4 py-2 text-right text-xs text-gray-500 uppercase tracking-wide font-semibold">vs Overall</th>
              <th className="px-4 py-2 text-right text-xs text-gray-500 uppercase tracking-wide font-semibold">Total Spent</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {display.map(r => {
              const delta = overallAvg > 0 ? ((r.avgCost - overallAvg) / overallAvg) * 100 : 0;
              const deltaColor = delta > 10 ? "text-rose-400" : delta < -10 ? "text-emerald-400" : "text-gray-500";
              return (
                <tr key={r.zip3} className="hover:bg-gray-800/40">
                  <td className="px-4 py-2 font-mono text-blue-400">{r.zip3}xx</td>
                  <td className="px-4 py-2 text-gray-400 font-mono">{r.state || "—"}</td>
                  <td className="px-4 py-2 text-right text-gray-300">{fmtN(r.shipments)}</td>
                  <td className="px-4 py-2 text-right text-white font-semibold">{fmt2(r.avgCost)}</td>
                  <td className={`px-4 py-2 text-right ${deltaColor}`}>
                    {delta > 0 ? "+" : ""}{delta.toFixed(0)}%
                  </td>
                  <td className="px-4 py-2 text-right text-gray-400">{fmt(r.totalCost)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {sorted.length > 15 && (
        <div className="px-5 py-3 border-t border-gray-800 text-center">
          <button onClick={() => setShowAll(v => !v)} className="text-xs text-blue-400 hover:text-blue-300">
            {showAll ? "Show top 15" : `Show all ${sorted.length} zones`}
          </button>
        </div>
      )}
      </>)}
    </div>
  );
}

function SortableTH({
  label, sortKey, currentSort, currentDir, onSort, align = "right",
}: {
  label: string;
  sortKey: SortKey;
  currentSort: SortKey;
  currentDir: "asc" | "desc";
  onSort: (k: SortKey) => void;
  align?: "left" | "right";
}) {
  const arrow = currentSort !== sortKey ? <span className="text-gray-600 ml-1">↕</span>
    : <span className="text-blue-400 ml-1">{currentDir === "desc" ? "↓" : "↑"}</span>;
  return (
    <th className={`px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide whitespace-nowrap select-none ${align === "right" ? "text-right" : "text-left"}`}>
      <button onClick={() => onSort(sortKey)} className={`hover:text-gray-200 cursor-pointer w-full ${align === "right" ? "text-right" : "text-left"}`}>
        {label}{arrow}
      </button>
    </th>
  );
}

export default function ProductsPage() {
  const [rangeKey, setRangeKey] = useState<RangeKey>("ytd");
  const [products, setProducts] = useState<Product[]>([]);
  const [zoneBreakdown, setZoneBreakdown] = useState<ZoneBreakdownRow[]>([]);
  const [stateBreakdown, setStateBreakdown] = useState<StateBreakdownRow[]>([]);
  const [categoryNational, setCategoryNational] = useState<CategoryBreakdown[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortKey>("grossRevenue");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [showNoCOGS, setShowNoCOGS] = useState(true);
  const [selected, setSelected] = useState<Product | null>(null);
  const [uploadStatus, setUploadStatus] = useState<string>("");
  const [uploading, setUploading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [explaining, setExplaining] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const { start, end } = getRange(rangeKey);
    setLoading(true);
    setError("");
    fetch(`/api/shopify/products?start=${start}&end=${end}&_=${refreshKey}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) throw new Error(d.error);
        setProducts(d.products);
        setZoneBreakdown(d.zoneBreakdown ?? []);
        setStateBreakdown(d.stateBreakdown ?? []);
        setCategoryNational(d.categoryNational ?? []);
        setSummary(d.summary);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [rangeKey, refreshKey]);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadStatus("Uploading…");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/shipping/upload", { method: "POST", body: fd });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Upload failed");
      setUploadStatus(`Added ${data.inserted} new shipments (${data.skippedDuplicates} duplicates skipped). Total in DB: ${data.totalRowsInDb}`);
      setRefreshKey(k => k + 1);
    } catch (err) {
      setUploadStatus(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

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
      base_cost_per_unit: p.costPerUnit != null ? p.costPerUnit.toFixed(2) : "",
      tariff_per_unit: p.tariffPerUnit != null ? p.tariffPerUnit.toFixed(2) : "",
      landed_cost_per_unit: p.landedCostPerUnit != null ? p.landedCostPerUnit.toFixed(2) : "",
      base_cogs: p.baseCOGS != null ? p.baseCOGS.toFixed(2) : "",
      total_tariff: p.totalTariff != null ? p.totalTariff.toFixed(2) : "",
      total_cogs_landed: p.totalCOGS != null ? p.totalCOGS.toFixed(2) : "",
      gross_profit: p.grossProfit != null ? p.grossProfit.toFixed(2) : "",
      gross_margin_pct: p.grossMarginPct != null ? fmtPct(p.grossMarginPct) : "",
      avg_shipping_per_unit: p.avgShippingPerUnit != null ? p.avgShippingPerUnit.toFixed(2) : "",
      total_shipping: p.shippingCost.toFixed(2),
      true_profit: p.trueProfit != null ? p.trueProfit.toFixed(2) : "",
      true_margin_pct: p.trueMarginPct != null ? fmtPct(p.trueMarginPct) : "",
    })), `product-profitability-${rangeKey}.csv`);
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Product Profitability</h1>
          <p className="text-gray-400 text-sm mt-1">Revenue, COGS, shipping, and true margin by SKU</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <label className={`px-3 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm rounded-lg transition-colors cursor-pointer ${uploading ? "opacity-50 pointer-events-none" : ""}`}>
            {uploading ? "Uploading…" : "Upload REDO CSV"}
            <input ref={fileRef} type="file" accept=".csv" onChange={handleUpload} disabled={uploading} className="hidden" />
          </label>
          <button onClick={handleExport} className="px-3 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm rounded-lg transition-colors">
            Export CSV
          </button>
          <DateRangeDropdown value={rangeKey} onChange={setRangeKey} />
        </div>
      </div>

      {error && <div className="text-red-400 bg-red-900/20 rounded-xl p-4 text-sm">{error}</div>}

      {uploadStatus && (
        <div className={`text-sm rounded-lg px-4 py-2 ${uploadStatus.startsWith("Error") ? "bg-red-900/20 border border-red-800/40 text-red-300" : "bg-blue-900/20 border border-blue-800/40 text-blue-300"}`}>
          {uploadStatus}
        </div>
      )}

      <div className="bg-blue-900/10 border border-blue-800/30 rounded-lg px-4 py-2.5 text-sm text-blue-200/90 flex items-center gap-2">
        <InfoIcon />
        <span>Click any tile, column header, or product row to see how the numbers were calculated.</span>
      </div>

      {loading && (
        <div className="space-y-6">
          <KPISkeleton count={4} />
          <KPISkeleton count={4} />
          <KPISkeleton count={4} />
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <TableSkeleton rows={12} cols={11} />
          </div>
        </div>
      )}

      {!loading && !error && summary && (
        <>
          {/* Revenue KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KPITile
              exKey="grossRevenue"
              label="Gross Revenue"
              value={<span className="text-white">{fmt(summary.totalGross)}</span>}
              sub={`${fmtN(summary.totalUnits)} units sold`}
              className="border-gray-800"
              onClick={() => setExplaining("grossRevenue")}
            />
            <KPITile
              exKey="netRevenue"
              label="Net Revenue"
              value={<span className="text-white">{fmt(summary.totalNet)}</span>}
              sub="After refunds"
              className="border-gray-800"
              onClick={() => setExplaining("netRevenue")}
            />
            <KPITile
              exKey="totalCOGS"
              label="Total COGS (landed)"
              value={<span className="text-red-400">{fmt(summary.totalCOGS)}</span>}
              sub={<>{fmt(summary.totalBaseCOGS)} base + <span className="text-orange-400">{fmt(summary.totalTariff)} tariff</span> ({fmtPct(summary.tariffRate * 100)})</>}
              className="border-red-800/30"
              onClick={() => setExplaining("totalCOGS")}
            />
            <KPITile
              exKey="grossProfit"
              label="Gross Profit"
              value={<span className="text-green-400">{fmt(summary.totalProfit)}</span>}
              sub="On COGS-covered SKUs"
              className="border-green-800/40"
              onClick={() => setExplaining("grossProfit")}
            />
          </div>

          {/* Margin + coverage KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KPITile
              exKey="overallMargin"
              label="Overall Margin"
              value={
                <span className={summary.overallMarginPct >= 50 ? "text-green-400" : summary.overallMarginPct >= 30 ? "text-yellow-400" : "text-red-400"}>
                  {fmtPct(summary.overallMarginPct)}
                </span>
              }
              sub="Gross Profit ÷ Net Revenue"
              className="border-gray-800"
              onClick={() => setExplaining("overallMargin")}
            />
            <KPITile
              exKey="avgProfitPerUnit"
              label="Avg Profit / Unit"
              value={<span className="text-white">{summary.totalUnits > 0 ? fmt2(summary.totalProfit / summary.totalUnits) : "—"}</span>}
              className="border-gray-800"
              onClick={() => setExplaining("avgProfitPerUnit")}
            />
            <KPITile
              exKey="skusTracked"
              label="SKUs Tracked"
              value={<span className="text-white">{summary.coveredProducts} <span className="text-sm text-gray-500">/ {summary.productCount}</span></span>}
              sub="Have COGS data"
              className="border-gray-800"
              onClick={() => setExplaining("skusTracked")}
            />
            <KPITile
              exKey="avgSellingPrice"
              label="Avg Selling Price"
              value={<span className="text-white">{summary.totalUnits > 0 ? fmt2(summary.totalGross / summary.totalUnits) : "—"}</span>}
              className="border-gray-800"
              onClick={() => setExplaining("avgSellingPrice")}
            />
          </div>

          {/* Shipping KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KPITile
              exKey="totalShipping"
              label="Total Shipping Cost"
              value={<span className="text-orange-400">{fmt(summary.totalShipping)}</span>}
              sub={summary.totalOrdersInWindow > 0 ? `${summary.shippingCoveredOrders} / ${summary.totalOrdersInWindow} orders matched` : "No orders in window"}
              className="border-orange-800/30"
              onClick={() => setExplaining("totalShipping")}
            />
            <KPITile
              exKey="totalTrueProfit"
              label="True Profit (after shipping)"
              value={<span className="text-emerald-400">{fmt(summary.totalTrueProfit)}</span>}
              sub="Gross Profit − Shipping"
              className="border-emerald-800/40"
              onClick={() => setExplaining("totalTrueProfit")}
            />
            <KPITile
              exKey="trueMargin"
              label="True Margin %"
              value={
                <span className={summary.trueMarginPct >= 40 ? "text-green-400" : summary.trueMarginPct >= 25 ? "text-yellow-400" : "text-red-400"}>
                  {fmtPct(summary.trueMarginPct)}
                </span>
              }
              sub="Includes shipping"
              className="border-gray-800"
              onClick={() => setExplaining("trueMargin")}
            />
            <KPITile
              exKey="avgShippingPerOrder"
              label="Avg Shipping / Order"
              value={<span className="text-white">{summary.shippingCoveredOrders > 0 ? fmt2(summary.totalShipping / summary.shippingCoveredOrders) : "—"}</span>}
              sub="Across matched orders"
              className="border-gray-800"
              onClick={() => setExplaining("avgShippingPerOrder")}
            />
          </div>

          {/* Shipping cost by destination state, with category breakdown */}
          {stateBreakdown.length > 0 && (
            <StateBreakdownPanel rows={stateBreakdown} national={categoryNational} />
          )}

          {/* ZIP3 view (more granular — collapsed by default) */}
          {zoneBreakdown.length > 0 && (
            <ZoneBreakdownPanel rows={zoneBreakdown} />
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
              onClick={() => setShowNoCOGS(v => !v)}
              className={`px-3 py-2 rounded-lg text-sm transition-colors border ${showNoCOGS ? "bg-gray-800 border-gray-700 text-gray-300" : "bg-blue-600/20 border-blue-600/40 text-blue-300"}`}
            >
              {showNoCOGS ? "Showing all SKUs" : "COGS only"}
            </button>
            <span className="text-xs text-gray-500">{filtered.length} products · click any row to expand</span>
          </div>

          {/* Table */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 bg-gray-900 border-b border-gray-800">
                  <tr>
                    <SortableTH label="Product"     sortKey="grossRevenue"       currentSort={sortBy} currentDir={sortDir} onSort={handleSort} align="left" />
                    <SortableTH label="Units"       sortKey="unitsSold"          currentSort={sortBy} currentDir={sortDir} onSort={handleSort} />
                    <SortableTH label="Gross Rev"   sortKey="grossRevenue"       currentSort={sortBy} currentDir={sortDir} onSort={handleSort} />
                    <SortableTH label="Net Rev"     sortKey="netRevenue"         currentSort={sortBy} currentDir={sortDir} onSort={handleSort} />
                    <SortableTH label="Avg Price"   sortKey="avgPrice"           currentSort={sortBy} currentDir={sortDir} onSort={handleSort} />
                    <SortableTH label="COGS"        sortKey="totalCOGS"          currentSort={sortBy} currentDir={sortDir} onSort={handleSort} />
                    <SortableTH label="Profit"      sortKey="grossProfit"        currentSort={sortBy} currentDir={sortDir} onSort={handleSort} />
                    <SortableTH label="Margin %"    sortKey="grossMarginPct"     currentSort={sortBy} currentDir={sortDir} onSort={handleSort} />
                    <SortableTH label="Ship/Unit"   sortKey="avgShippingPerUnit" currentSort={sortBy} currentDir={sortDir} onSort={handleSort} />
                    <SortableTH label="True Margin" sortKey="trueMarginPct"      currentSort={sortBy} currentDir={sortDir} onSort={handleSort} />
                    <SortableTH label="Refund Rate" sortKey="refundRate"         currentSort={sortBy} currentDir={sortDir} onSort={handleSort} />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {filtered.length === 0 && (
                    <tr><td colSpan={11} className="px-4 py-8 text-center text-gray-500">No products found.</td></tr>
                  )}
                  {filtered.map((p, i) => (
                    <tr
                      key={i}
                      onClick={() => setSelected(p)}
                      className={`hover:bg-gray-800/60 transition-colors cursor-pointer ${selected?.sku === p.sku ? "bg-blue-900/20 ring-1 ring-inset ring-blue-700/40" : ""}`}
                    >
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
                      <td className="px-4 py-2.5 text-right"><MarginBadge pct={p.grossMarginPct} /></td>
                      <td className="px-4 py-2.5 text-right text-orange-300/90">
                        {p.avgShippingPerUnit != null ? fmt2(p.avgShippingPerUnit) : <span className="text-gray-600">—</span>}
                      </td>
                      <td className="px-4 py-2.5 text-right"><MarginBadge pct={p.trueMarginPct} /></td>
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
                    <td className="px-4 py-3 text-right text-orange-300/90">
                      {fmt(filtered.reduce((s, p) => s + p.shippingCost, 0))}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {(() => {
                        const net = filtered.reduce((s, p) => s + p.netRevenue, 0);
                        const profit = filtered.reduce((s, p) => s + (p.grossProfit ?? 0), 0);
                        const ship = filtered.reduce((s, p) => s + p.shippingCost, 0);
                        const pct = net > 0 ? ((profit - ship) / net) * 100 : 0;
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

      {selected && <ProductDetailPanel product={selected} onClose={() => setSelected(null)} onExplain={setExplaining} />}
      {explaining && EX[explaining] && <ExplainerPopover ex={EX[explaining]} onClose={() => setExplaining(null)} />}
    </div>
  );
}
