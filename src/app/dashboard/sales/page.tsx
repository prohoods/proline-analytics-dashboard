"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import DateRangeDropdown from "@/components/DateRangeDropdown";
import { RangeKey, getRange, getCompareRange, defaultCompareMode, compareLabel, type CompareMode } from "@/lib/date-ranges";
import DeltaBadge from "@/components/DeltaBadge";
import { TableSkeleton, SkeletonCard } from "@/components/Skeleton";
import { exportToCSV } from "@/lib/export-csv";

interface SalesBucket {
  date: string;
  weekStart?: string;
  prh: number;
  prolinePro: number;
  phone: number;
  other: number;
  grossSales: number;
  discounts: number;
  returns: number;
  netSales: number;
  shipping: number;
  salesTax: number;
  redo: number;
  totalSales: number;
  marketplaces?: number;
  shl?: number;
}

interface SHLDay {
  date: string;
  grossRevenue: number;
  discounts: number;
  refunds: number;
  refundTax?: number;
  netRevenue: number;
  shipping: number;
  tax?: number;
}

interface MarketplaceDay {
  date: string;
  amazon: number;
  wayfair: number;
  homeDepot: number;
  gross: number;
  returns: number;
  net: number;
}
interface MarketplaceSummary { days: MarketplaceDay[]; }

interface ShlContribution {
  gross: number;
  discounts: number;
  refunds: number;
  shipping: number;
  netTax: number; // tax collected − tax refunded
  net: number;
}

interface MktContribution {
  gross: number;
  returns: number;
  net: number;
}

type ViewTab = "daily" | "weekly" | "monthly";

const fmt = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function fmtDate(dateStr: string) {
  const d = new Date(dateStr + "T12:00:00Z");
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

function neg(n: number) {
  return n > 0 ? <span className="text-red-400">({fmt(n)})</span> : <span className="text-gray-600">—</span>;
}

// ISO week key
function isoWeek(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00Z");
  const jan4 = new Date(d.getFullYear(), 0, 4);
  const s = new Date(jan4);
  s.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7));
  const diff = Math.floor((d.getTime() - s.getTime()) / 86400000);
  const wk = Math.floor(diff / 7) + 1;
  return `${wk === 0 ? d.getFullYear() - 1 : d.getFullYear()}-W${String(wk).padStart(2, "0")}`;
}

// "Apr 7 – Apr 13" label for a week bucket
function weekRangeLabel(bucket: SalesBucket): string {
  // weekStart is the Monday; date is the ISO week key
  const start = bucket.weekStart ?? bucket.date;
  const end = new Date(start + "T12:00:00Z");
  end.setDate(end.getDate() + 6);
  const endStr = end.toISOString().substring(0, 10);
  const today = new Date().toISOString().substring(0, 10);
  const clampedEnd = endStr > today ? today : endStr;
  return `${fmtDate(start)} – ${fmtDate(clampedEnd)}`;
}

// Drill-in: each channel cell can open a modal listing the orders that
// rolled up into it. Channels backed by Shopify get an order list; mktplc
// has no order-level data (Sheets-only) so it isn't clickable.
type DrillChannel = "prh" | "prolinePro" | "phone" | "other" | "shl";

interface OrderRow {
  id: number;
  name: string;
  date: string;
  customer: string;
  email: string;
  subtotal: number;
  discounts: number;
  shipping: number;
  tax: number;
  total: number;
  refundedAmount: number;
  financialStatus: string;
  tags: string[];
}

const CHANNEL_LABELS: Record<DrillChannel, string> = {
  prh: "PRH",
  prolinePro: "ProlinePro",
  phone: "Phone",
  other: "Other",
  shl: "SHL",
};

// Resolve a row's date string to an inclusive [start, end] range. Daily and
// weekly tables show single-day rows ("YYYY-MM-DD"); monthly rows are
// "YYYY-MM" and need to expand to the month's bounds.
function rowDateRange(rowDate: string): { start: string; end: string } {
  if (rowDate.length === 10) return { start: rowDate, end: rowDate };
  // YYYY-MM → first → last day of month
  const [y, m] = rowDate.split("-").map(Number);
  const start = `${rowDate}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const end = `${rowDate}-${String(lastDay).padStart(2, "0")}`;
  return { start, end };
}

// Aggregate daily SalesBucket rows into weekly or monthly groups. Used for
// the compare overlay so we can pair prev-period rows with the active
// view's grouping (Shopify's own weekly/monthly is fetched for the current
// window only).
function rollDailyToView(daily: SalesBucket[], view: ViewTab): SalesBucket[] {
  if (view === "daily") return daily;
  const keyOf = (d: string) => view === "monthly" ? d.substring(0, 7) : isoWeek(d);
  const groups = new Map<string, SalesBucket>();
  for (const d of daily) {
    const k = keyOf(d.date);
    const acc = groups.get(k);
    if (!acc) {
      groups.set(k, { ...d, date: k });
    } else {
      acc.prh += d.prh;
      acc.prolinePro += d.prolinePro;
      acc.phone += d.phone;
      acc.other += d.other;
      acc.grossSales += d.grossSales;
      acc.discounts += d.discounts;
      acc.returns += d.returns;
      acc.netSales += d.netSales;
      acc.shipping += d.shipping;
      acc.salesTax += d.salesTax;
      acc.redo = (acc.redo ?? 0) + (d.redo ?? 0);
      acc.totalSales += d.totalSales;
      acc.shl = (acc.shl ?? 0) + (d.shl ?? 0);
      acc.marketplaces = (acc.marketplaces ?? 0) + (d.marketplaces ?? 0);
    }
  }
  return Array.from(groups.values()).sort((a, b) => a.date.localeCompare(b.date));
}

function sumBuckets(buckets: SalesBucket[]) {
  return {
    prh: buckets.reduce((s, r) => s + r.prh, 0),
    prolinePro: buckets.reduce((s, r) => s + r.prolinePro, 0),
    phone: buckets.reduce((s, r) => s + r.phone, 0),
    other: buckets.reduce((s, r) => s + r.other, 0),
    marketplaces: buckets.reduce((s, r) => s + (r.marketplaces ?? 0), 0),
    shl: buckets.reduce((s, r) => s + (r.shl ?? 0), 0),
    grossSales: buckets.reduce((s, r) => s + r.grossSales, 0),
    discounts: buckets.reduce((s, r) => s + r.discounts, 0),
    returns: buckets.reduce((s, r) => s + r.returns, 0),
    netSales: buckets.reduce((s, r) => s + r.netSales, 0),
    shipping: buckets.reduce((s, r) => s + r.shipping, 0),
    salesTax: buckets.reduce((s, r) => s + r.salesTax, 0),
    redo: buckets.reduce((s, r) => s + (r.redo ?? 0), 0),
    totalSales: buckets.reduce((s, r) => s + r.totalSales, 0),
  };
}

// Tiny inline delta shown under per-row Net/Total cells when compare is on.
// Renders nothing if both sides are 0 (no signal). Capped at ±999% so a
// near-zero prior doesn't blow up the cell.
function RowDelta({ cur, prev }: { cur: number; prev: number }) {
  if (cur === 0 && prev === 0) return null;
  if (prev === 0) {
    return <div className="text-[10px] text-gray-500 font-normal mt-0.5">new</div>;
  }
  const pct = ((cur - prev) / Math.abs(prev)) * 100;
  const clamped = Math.max(-999, Math.min(999, pct));
  const up = clamped >= 0;
  const color = up ? "text-emerald-400" : "text-red-400";
  const arrow = up ? "▲" : "▼";
  return (
    <div className={`text-[10px] font-normal mt-0.5 ${color}`} title={`Previous: ${fmt(prev)}`}>
      {arrow} {Math.abs(clamped).toFixed(clamped >= 100 || clamped <= -100 ? 0 : 1)}%
    </div>
  );
}

function MetricCell({
  value,
  onClick,
  className,
  render,
  prev,
}: {
  value: number;
  onClick: () => void;
  className?: string;
  render?: (v: number) => React.ReactNode;
  prev?: number;
}) {
  const display = render ? render(value) : (value !== 0 ? fmt(value) : <span className="text-gray-600">—</span>);
  if (value === 0 && !render) {
    return <td className={`py-2 px-3 text-right ${className ?? ""}`}>{display}</td>;
  }
  return (
    <td className={`py-2 px-3 text-right ${className ?? ""}`}>
      <button
        onClick={onClick}
        className="hover:underline underline-offset-2 cursor-pointer focus:outline-none focus:underline"
        title="Click to see calculation"
      >
        {display}
      </button>
      {prev !== undefined && <RowDelta cur={value} prev={prev} />}
    </td>
  );
}

function ChannelCell({
  value,
  colorClass,
  onClick,
}: {
  value: number;
  colorClass?: string;
  onClick: () => void;
}) {
  if (value === 0) {
    return <td className="py-2 px-3 text-right"><span className="text-gray-600">—</span></td>;
  }
  return (
    <td className={`py-2 px-3 text-right ${colorClass ?? ""}`}>
      <button
        onClick={onClick}
        className="hover:underline underline-offset-2 cursor-pointer focus:outline-none focus:underline"
        title="Click to see orders"
      >
        {fmt(value)}
      </button>
    </td>
  );
}

type Metric = "gross" | "refunds" | "redo" | "net" | "total" | "marketplaces";

const METRIC_META: Record<Metric, { label: string; color: string }> = {
  gross: { label: "Gross Sales", color: "text-white" },
  refunds: { label: "Refunds", color: "text-red-400" },
  redo: { label: "Redo", color: "text-cyan-400" },
  net: { label: "Net Sales", color: "text-white" },
  total: { label: "Total Sales", color: "text-green-400" },
  marketplaces: { label: "Marketplaces", color: "text-orange-400" },
};

function MetricBreakdownModal({
  metric,
  row,
  shl,
  mkt,
  rowLabel,
  marketplaceDays,
  onClose,
}: {
  metric: Metric;
  row: SalesBucket;
  shl?: ShlContribution;
  mkt?: MktContribution;
  rowLabel: string;
  marketplaceDays: MarketplaceDay[];
  onClose: () => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const meta = METRIC_META[metric];

  // Top-of-modal value: matches what the user sees in the table cell. With
  // Option B, totalSales/grossSales/etc are already business-wide.
  const value =
    metric === "gross" ? row.grossSales
    : metric === "refunds" ? row.returns
    : metric === "redo" ? row.redo
    : metric === "net" ? row.netSales
    : metric === "marketplaces" ? (row.marketplaces ?? 0)
    : row.totalSales;

  // Per-platform marketplace breakdown for this row's date range.
  const { start: mktStart, end: mktEnd } = rowDateRange(row.date);
  const mktInRange = marketplaceDays.filter(d => d.date >= mktStart && d.date <= mktEnd);
  const mktAmazon = mktInRange.reduce((s, d) => s + d.amazon, 0);
  const mktWayfair = mktInRange.reduce((s, d) => s + d.wayfair, 0);
  const mktHomeDepot = mktInRange.reduce((s, d) => s + d.homeDepot, 0);
  const mktGross = mkt?.gross ?? mktInRange.reduce((s, d) => s + d.gross, 0);
  const mktReturns = mkt?.returns ?? mktInRange.reduce((s, d) => s + d.returns, 0);

  // Per-source decomposition of business-wide totals, derived by subtracting
  // SHL + Marketplace contributions from the merged row.
  const shlGross = shl?.gross ?? 0;
  const shlDiscounts = shl?.discounts ?? 0;
  const shlRefunds = shl?.refunds ?? 0;
  const shlShipping = shl?.shipping ?? 0;
  const shlNetTax = shl?.netTax ?? 0;
  const prolineGross = row.grossSales - shlGross - mktGross;
  const prolineDiscounts = row.discounts - shlDiscounts;
  const prolineRefunds = row.returns - shlRefunds - mktReturns;
  const prolineShipping = row.shipping - shlShipping;
  const prolineNetTax = row.salesTax - shlNetTax;

  // Sum of channel subtotals — equals Proline Gross − Proline Discounts (channels
  // are post-discount). Useful as a sanity check on the Proline gross row.
  const channelSubtotalSum = row.prh + row.prolinePro + row.phone + row.other;

  return (
    <div className="fixed inset-0 bg-black/50 z-40 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-xl max-h-[90vh] bg-gray-900 border border-gray-700 rounded-xl z-50 overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-gray-900 border-b border-gray-800 px-5 py-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">{meta.label} · {rowLabel}</div>
            <div className={`text-2xl font-bold ${meta.color}`}>{fmt(value)}</div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors flex-shrink-0 mt-0.5">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-5 py-5 space-y-5 text-sm">
          {metric === "gross" && (
            <>
              <Section title="Formula">
                <code className="text-blue-300">Proline gross + SHL gross + Marketplace gross</code> — the full business&apos;s line-item revenue before discounts.
              </Section>
              <Section title="Calculation">
                <CalcRow label="Proline (Shopify 861fdb)" value={prolineGross} />
                <CalcSubRow label="PRH" value={row.prh} />
                <CalcSubRow label="ProlinePro" value={row.prolinePro} />
                <CalcSubRow label="Phone" value={row.phone} />
                {row.other > 0 && <CalcSubRow label="Other" value={row.other} />}
                <CalcSubRow label="+ Proline discounts added back" value={prolineDiscounts} />
                <CalcRow label="+ SHL (Shopify a11c08-ce)" value={shlGross} />
                <CalcRow label="+ Marketplaces (Amazon/Wayfair/HD)" value={mktGross} />
                <CalcRow label="= Gross" value={row.grossSales} bold />
                <div className="text-xs text-gray-500 mt-2">
                  Channel subtotals are post-discount, so Proline discounts are added back to recover line-item gross. Sanity: PRH+Pro+Phone{row.other > 0 ? "+Other" : ""} = {fmt(channelSubtotalSum)}.
                </div>
              </Section>
              <Section title="Sources">
                <ul className="list-disc list-inside text-gray-400 space-y-1">
                  <li>Proline — Shopify Admin REST API, store <code className="text-gray-300">861fdb</code></li>
                  <li>SHL — Shopify Admin REST API, store <code className="text-gray-300">a11c08-ce</code> (separate account)</li>
                  <li>Marketplaces — Google Sheets &quot;Marketplace Sales&quot; tab (manually entered Amazon/Wayfair/Home Depot revenue)</li>
                </ul>
              </Section>
            </>
          )}

          {metric === "refunds" && (
            <>
              <Section title="Formula">
                <code className="text-blue-300">Proline refunds + SHL refunds + Marketplace returns</code>, all bucketed on the date the refund was processed.
              </Section>
              <Section title="Calculation">
                <CalcRow label="Proline refunds (Shopify 861fdb)" value={prolineRefunds} />
                <CalcRow label="+ SHL refunds (Shopify a11c08-ce)" value={shlRefunds} />
                <CalcRow label="+ Marketplace returns" value={mktReturns} />
                <CalcRow label="= Refunds" value={row.returns} bold />
                <div className="text-xs text-gray-500 mt-2">
                  Refunded sales tax is netted out of the Tax column instead of subtracted here, matching Shopify&apos;s own &quot;Total sales&quot; breakdown.
                </div>
              </Section>
              <Section title="Sources">
                <ul className="list-disc list-inside text-gray-400 space-y-1">
                  <li>Proline + SHL — Shopify <code className="text-gray-300">refund_line_items.subtotal</code> per refund</li>
                  <li>Marketplaces — Google Sheets &quot;Marketplace Sales&quot; tab (returns column)</li>
                </ul>
              </Section>
              <Section title="Why it might differ from Shopify Analytics">
                <ul className="list-disc list-inside text-gray-400 space-y-1">
                  <li>Refunds are bucketed on refund date, not original order date — same as Shopify, but UTC-7 timezone can shift a midnight refund by a day.</li>
                  <li>Includes both Proline and SHL stores; Shopify Analytics only sees one store at a time.</li>
                </ul>
              </Section>
            </>
          )}

          {metric === "redo" && (
            <>
              <Section title="Formula">
                <code className="text-blue-300">Σ x-redo line items collected − Σ x-redo line items refunded</code>
              </Section>
              <Section title="What this is">
                Redo is the shipping-protection SaaS. Customers pay the fee at checkout (rides as an <code className="text-gray-300">x-redo*</code> SKU line item) and we remit it to Redo. It&apos;s not Proline revenue — surfaced separately and backed out of Net so the table reflects what Proline actually keeps.
              </Section>
              <Section title="Calculation">
                <CalcRow label="Net Redo (collected − refunded)" value={row.redo} bold />
              </Section>
              <Section title="Source">
                Shopify line items where <code className="text-gray-300">sku</code> starts with <code className="text-gray-300">x-redo</code>.
              </Section>
            </>
          )}

          {metric === "net" && (
            <>
              <Section title="Formula">
                <code className="text-blue-300">Gross − Discounts − Refunds − Redo</code> — applied across the full business (Proline + SHL + Marketplaces).
              </Section>
              <Section title="Calculation">
                <CalcRow label="Gross (business-wide)" value={row.grossSales} />
                <CalcRow label="− Discounts" value={-row.discounts} />
                <CalcRow label="− Refunds" value={-row.returns} />
                <CalcRow label="− Redo (pass-through)" value={-row.redo} />
                <CalcRow label="= Net" value={row.netSales} bold />
              </Section>
              <Section title="Source">
                Computed from this row&apos;s business-wide Gross/Discounts/Refunds. See the Gross and Refunds breakdowns for per-source splits.
              </Section>
            </>
          )}

          {metric === "marketplaces" && (
            <>
              <Section title="Formula">
                <code className="text-blue-300">Σ (Amazon + Wayfair + Home Depot)</code> for every day in this row&apos;s window — gross marketplace revenue.
              </Section>
              <Section title="Calculation">
                <CalcRow label="Amazon" value={mktAmazon} />
                <CalcRow label="Wayfair" value={mktWayfair} />
                <CalcRow label="Home Depot" value={mktHomeDepot} />
                <CalcRow label="= Marketplace Gross" value={mktGross} bold />
              </Section>
              <Section title="Returns">
                Marketplace returns ({fmt(mktReturns)} this row) are rolled into the business-wide <span className="text-red-400">Refunds</span> column alongside Proline + SHL refunds, so they aren&apos;t subtracted here — that would double-count them.
              </Section>
              <Section title="Source">
                Google Sheets — <em>2026 Daily Sales Report</em>, &quot;Marketplace Sales&quot; tab. Manually entered by the team because Amazon/Wayfair/Home Depot revenue lives on those platforms, not in Shopify.
              </Section>
              <Section title="Why it&apos;s tracked separately from Shopify">
                These orders sometimes appear in Shopify too (synced for inventory reasons, tagged <code className="text-gray-300">Market Place Order</code>) but with placeholder totals. The dashboard skips those Shopify rows so we don&apos;t double-count against this column.
              </Section>
            </>
          )}

          {metric === "total" && (
            <>
              <Section title="Formula">
                <code className="text-blue-300">Net + Shipping + Tax</code> — Net already includes SHL and Marketplace revenue, so this is the full business total.
              </Section>
              <Section title="Calculation">
                <CalcRow label="Net (business-wide)" value={row.netSales} />
                <CalcRow label="+ Shipping" value={row.shipping} />
                <CalcSubRow label="Proline" value={prolineShipping} />
                <CalcSubRow label="SHL" value={shlShipping} />
                <CalcRow label="+ Sales Tax (collected − refunded)" value={row.salesTax} />
                <CalcSubRow label="Proline" value={prolineNetTax} />
                <CalcSubRow label="SHL" value={shlNetTax} />
                <CalcRow label="= Total" value={row.totalSales} bold />
              </Section>
              <Section title="Sources">
                <ul className="list-disc list-inside text-gray-400 space-y-1">
                  <li>Proline Net/Shipping/Tax — Shopify store <code className="text-gray-300">861fdb</code></li>
                  <li>SHL Net/Shipping/Tax — Shopify store <code className="text-gray-300">a11c08-ce</code> (separate account)</li>
                  <li>Marketplaces — folded into Net via the business-wide Gross/Refunds rollup (Google Sheets manual entry)</li>
                </ul>
              </Section>
              <Section title="Why this differs from Shopify Analytics">
                Shopify Analytics only sees one store at a time. Total here is the full business: Proline + SHL + Marketplaces.
              </Section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-gray-500 uppercase tracking-wide mb-2">{title}</div>
      <div className="text-gray-300">{children}</div>
    </div>
  );
}

function CalcRow({ label, value, bold }: { label: string; value: number; bold?: boolean }) {
  return (
    <div className={`flex items-center justify-between py-1.5 ${bold ? "border-t border-gray-700 mt-1 pt-2 font-semibold text-white" : "text-gray-300"}`}>
      <span>{label}</span>
      <span className="tabular-nums">{value < 0 ? `(${fmt(-value)})` : fmt(value)}</span>
    </div>
  );
}

function CalcSubRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between py-1 pl-4 text-xs text-gray-500">
      <span>{label}</span>
      <span className="tabular-nums">{fmt(value)}</span>
    </div>
  );
}

function OrdersDrillModal({
  channel,
  start,
  end,
  rowLabel,
  onClose,
}: {
  channel: DrillChannel;
  start: string;
  end: string;
  rowLabel: string;
  onClose: () => void;
}) {
  const [orders, setOrders] = useState<OrderRow[] | null>(null);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    setLoadingOrders(true);
    setErr("");
    const url = channel === "shl"
      ? `/api/shopify-shl/order-list?start=${start}&end=${end}`
      : `/api/shopify/channel-orders?start=${start}&end=${end}&channel=${channel}`;
    fetch(url)
      .then(r => r.json())
      .then(d => {
        if (d.error) throw new Error(d.error);
        setOrders(d.orders);
      })
      .catch(e => setErr(e.message))
      .finally(() => setLoadingOrders(false));
  }, [channel, start, end]);

  const totalSubtotal = (orders ?? []).reduce((s, o) => s + o.subtotal, 0);
  const totalRefunded = (orders ?? []).reduce((s, o) => s + o.refundedAmount, 0);

  return (
    <div className="fixed inset-0 bg-black/50 z-40 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-3xl max-h-[90vh] bg-gray-900 border border-gray-700 rounded-xl z-50 overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-gray-900 border-b border-gray-800 px-5 py-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Channel Orders</div>
            <div className="text-white font-semibold">{CHANNEL_LABELS[channel]} · {rowLabel}</div>
            <div className="text-gray-500 text-xs mt-0.5">{start === end ? start : `${start} → ${end}`}</div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors flex-shrink-0 mt-0.5">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-5 py-4">
          {loadingOrders && <div className="text-gray-500 text-sm py-8 text-center">Loading orders…</div>}
          {err && <div className="text-red-400 bg-red-900/20 rounded-lg p-3 text-sm">{err}</div>}
          {!loadingOrders && !err && orders && (
            <>
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="bg-gray-800/60 rounded-lg p-3">
                  <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Orders</div>
                  <div className="text-lg font-bold text-white">{orders.length}</div>
                </div>
                <div className="bg-gray-800/60 rounded-lg p-3">
                  <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Subtotal</div>
                  <div className="text-lg font-bold text-white">{fmt(totalSubtotal)}</div>
                </div>
                <div className="bg-gray-800/60 rounded-lg p-3">
                  <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Refunded</div>
                  <div className="text-lg font-bold text-red-400">{totalRefunded > 0 ? fmt(totalRefunded) : "—"}</div>
                </div>
              </div>

              {orders.length === 0 ? (
                <div className="text-gray-500 text-sm py-8 text-center">No orders in this bucket.</div>
              ) : (
                <div className="bg-gray-800/40 rounded-lg overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-800/80 text-gray-500 uppercase tracking-wider">
                      <tr>
                        <th className="text-left py-2 px-3">Order</th>
                        <th className="text-left py-2 px-3">Date</th>
                        <th className="text-left py-2 px-3">Customer</th>
                        <th className="text-right py-2 px-3">Subtotal</th>
                        <th className="text-right py-2 px-3">Refunded</th>
                        <th className="text-left py-2 px-3">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800">
                      {orders.map(o => (
                        <tr key={o.id} className="text-gray-300 hover:bg-gray-800/40">
                          <td className="py-2 px-3 font-mono text-blue-400">{o.name}</td>
                          <td className="py-2 px-3 text-gray-500">{o.date}</td>
                          <td className="py-2 px-3 truncate max-w-[14rem]">{o.customer || <span className="text-gray-600">—</span>}</td>
                          <td className="py-2 px-3 text-right tabular-nums">{fmt(o.subtotal)}</td>
                          <td className="py-2 px-3 text-right tabular-nums">{o.refundedAmount > 0 ? <span className="text-red-400">({fmt(o.refundedAmount)})</span> : <span className="text-gray-600">—</span>}</td>
                          <td className="py-2 px-3 text-gray-500 capitalize">{o.financialStatus.replace(/_/g, " ")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function fmtCompactCurrency(n: number) {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `$${Math.round(n / 1000)}K`;
  return `$${Math.round(n)}`;
}

// Each series the user can toggle on the trend chart. `accessor` pulls the
// number out of a SalesBucket; `emphasis` thickens the line + adds dots so
// headline series like Total stand out when enabled together.
interface TrendSeries {
  key: string;
  label: string;
  color: string;
  accessor: (b: SalesBucket) => number;
  emphasis?: boolean;
}

const TREND_SERIES: TrendSeries[] = [
  { key: "PRH",       label: "PRH",       color: "#a3a3a3", accessor: b => b.prh },
  { key: "Pro",       label: "Pro",       color: "#fbbf24", accessor: b => b.prolinePro },
  { key: "Phone",     label: "Phone",     color: "#22d3ee", accessor: b => b.phone },
  { key: "SHL",       label: "SHL",       color: "#c084fc", accessor: b => b.shl ?? 0 },
  { key: "Mktplc",    label: "Mktplc",    color: "#fb923c", accessor: b => b.marketplaces ?? 0 },
  { key: "Gross",     label: "Gross",     color: "#94a3b8", accessor: b => b.grossSales },
  { key: "Discounts", label: "Discounts", color: "#f87171", accessor: b => b.discounts },
  { key: "Refunds",   label: "Refunds",   color: "#ef4444", accessor: b => b.returns },
  { key: "Redo",      label: "Redo",      color: "#06b6d4", accessor: b => b.redo },
  { key: "Net",       label: "Net",       color: "#60a5fa", accessor: b => b.netSales },
  { key: "Total",     label: "Total",     color: "#34d399", accessor: b => b.totalSales, emphasis: true },
];

function SalesTrendChart({
  rows,
  prevRows,
  view,
  compareLabel: prevLabel,
}: {
  rows: SalesBucket[];
  prevRows?: SalesBucket[] | null;
  view: ViewTab;
  compareLabel?: string;
}) {
  const [enabled, setEnabled] = useState<Set<string>>(() => new Set(["Gross", "Net", "Total"]));
  const toggle = (k: string) => setEnabled(prev => {
    const next = new Set(prev);
    if (next.has(k)) next.delete(k); else next.add(k);
    return next;
  });

  const data = useMemo(() => rows.map((r, i) => {
    const label =
      view === "monthly" ? (() => {
        const [y, m] = r.date.split("-").map(Number);
        return `${MONTHS[m - 1]} ${String(y).slice(2)}`;
      })()
      : view === "weekly" ? weekRangeLabel(r)
      : fmtDate(r.date);
    const prev = prevRows?.[i];
    const out: Record<string, string | number> = { label };
    for (const s of TREND_SERIES) {
      out[s.key] = Math.round(s.accessor(r));
      if (prev) out[`Prev ${s.key}`] = Math.round(s.accessor(prev));
    }
    return out;
  }), [rows, prevRows, view]);

  if (data.length === 0) return null;
  const hasPrev = !!prevRows && prevRows.length > 0;
  const activeSeries = TREND_SERIES.filter(s => enabled.has(s.key));

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-5 mb-4">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h2 className="text-sm font-semibold text-white">Trend</h2>
        {hasPrev && <span className="text-xs text-gray-500">Dashed = {prevLabel ?? "previous"}</span>}
      </div>

      {/* Series toggles */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        {TREND_SERIES.map(s => {
          const on = enabled.has(s.key);
          return (
            <button
              key={s.key}
              onClick={() => toggle(s.key)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs border transition-colors ${
                on
                  ? "bg-gray-800 border-gray-600 text-white"
                  : "bg-gray-900 border-gray-800 text-gray-500 hover:text-gray-300 hover:border-gray-700"
              }`}
              title={on ? `Hide ${s.label}` : `Show ${s.label}`}
            >
              <span
                className="w-2.5 h-2.5 rounded-full"
                style={{ background: on ? s.color : "transparent", border: on ? "none" : `1px solid ${s.color}` }}
              />
              {s.label}
            </button>
          );
        })}
        {enabled.size > 0 && (
          <button
            onClick={() => setEnabled(new Set())}
            className="px-2.5 py-1 rounded-md text-xs text-gray-500 hover:text-gray-300"
          >
            Clear
          </button>
        )}
      </div>

      {activeSeries.length === 0 ? (
        <div className="h-[280px] flex items-center justify-center text-sm text-gray-500">
          Select at least one series above.
        </div>
      ) : (
        <div style={{ width: "100%", height: 280 }}>
          <ResponsiveContainer>
            <LineChart data={data} margin={{ top: 5, right: 16, bottom: 0, left: 8 }}>
              <CartesianGrid stroke="#1f2937" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: "#9ca3af", fontSize: 11 }} stroke="#374151" />
              <YAxis tick={{ fill: "#9ca3af", fontSize: 11 }} stroke="#374151" tickFormatter={fmtCompactCurrency} width={60} />
              <Tooltip
                contentStyle={{ background: "#0b1220", border: "1px solid #374151", borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: "#9ca3af" }}
                formatter={(v) => fmt(typeof v === "number" ? v : Number(v) || 0)}
              />
              <Legend wrapperStyle={{ fontSize: 12, color: "#9ca3af" }} iconType="plainline" />
              {activeSeries.map(s => (
                <Line
                  key={s.key}
                  type="monotone"
                  dataKey={s.key}
                  stroke={s.color}
                  strokeWidth={s.emphasis ? 2.5 : 2}
                  dot={s.emphasis ? { r: 3, fill: s.color } : false}
                />
              ))}
              {hasPrev && activeSeries.map(s => (
                <Line
                  key={`prev-${s.key}`}
                  type="monotone"
                  dataKey={`Prev ${s.key}`}
                  stroke={s.color}
                  strokeWidth={1.5}
                  strokeDasharray="4 4"
                  dot={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

function CompareDropdown({
  mode,
  onChange,
  rangeKey,
  prevRange,
}: {
  mode: CompareMode;
  onChange: (m: CompareMode) => void;
  rangeKey: RangeKey;
  prevRange: { start: string; end: string } | null;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const active = mode !== "off";
  const label = compareLabel(rangeKey, mode);

  const opts: { key: CompareMode; label: string; sub: string }[] = [
    { key: "off",         label: "Off",                   sub: "Hide comparison" },
    { key: "prev_year",   label: compareLabel(rangeKey, "prev_year").replace(/^vs /, ""),   sub: "Year-over-year comparison" },
    { key: "prev_period", label: compareLabel(rangeKey, "prev_period").replace(/^vs /, ""), sub: prevRange ? `${prevRange.start} → ${prevRange.end}` : "Same-length window before this one" },
  ];

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className={`flex items-center gap-1.5 px-3 py-2 border rounded-lg text-sm transition-colors ${
          active
            ? "bg-purple-600/20 border-purple-600/40 text-purple-300"
            : "bg-gray-800 hover:bg-gray-700 border-gray-700 text-gray-300 hover:text-white"
        }`}
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
        <span>{label}</span>
        <svg className={`w-3 h-3 transition-transform ${open ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 mt-1 w-64 bg-gray-900 border border-gray-700 rounded-lg shadow-xl z-30 py-1">
          {opts.map(o => {
            const selected = o.key === mode;
            return (
              <button
                key={o.key}
                onClick={() => { onChange(o.key); setOpen(false); }}
                className={`w-full text-left px-3 py-2 transition-colors ${
                  selected ? "bg-purple-600/20 text-purple-300" : "text-gray-300 hover:bg-gray-800"
                }`}
              >
                <div className="text-sm font-medium">{o.label}</div>
                {o.sub && <div className="text-xs text-gray-500 mt-0.5">{o.sub}</div>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function SalesPage() {
  const [rangeKey, setRangeKey] = useState<RangeKey>("ytd");
  const [view, setView] = useState<ViewTab>("monthly");
  const [selectedWeek, setSelectedWeek] = useState<string>("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [compareMode, setCompareMode] = useState<CompareMode>("off");
  const showCompare = compareMode !== "off";
  const [prevTotals, setPrevTotals] = useState<ReturnType<typeof sumBuckets> | null>(null);
  const [prevDaily, setPrevDaily] = useState<SalesBucket[] | null>(null);
  const [prevLoading, setPrevLoading] = useState(false);

  // Range-scoped data (drives the table)
  const [shopifyData, setShopifyData] = useState<{ daily: SalesBucket[]; weekly: SalesBucket[]; monthly: SalesBucket[]; otherBreakdown?: { tags: string; count: number; amount: number; sampleOrder: string }[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Always-on YTD data for persistent header
  const [ytdData, setYtdData] = useState<{ daily: SalesBucket[]; monthly: SalesBucket[] } | null>(null);

  // Marketplace
  const [marketplace, setMarketplace] = useState<MarketplaceSummary | null>(null);
  // SHL
  const [shlDays, setShlDays] = useState<SHLDay[]>([]);

  // Fetch marketplace once
  useEffect(() => {
    fetch("/api/sheets/marketplace")
      .then(r => r.json())
      .then(d => { if (!d.error) setMarketplace(d); })
      .catch(() => {});
  }, []);

  // Fetch SHL for the full year so it covers all range selections
  useEffect(() => {
    const year = new Date().getFullYear();
    const today = new Date().toISOString().substring(0, 10);
    fetch(`/api/shopify-shl/orders?start=${year}-01-01&end=${today}`)
      .then(r => r.json())
      .then(d => { if (!d.error && d.daily) setShlDays(d.daily); })
      .catch(() => {});
  }, []);

  // Fetch YTD once for persistent header (re-runs on manual refresh)
  useEffect(() => {
    const now = new Date();
    const year = now.getFullYear();
    const today = now.toISOString().substring(0, 10);
    fetch(`/api/shopify/channel-sales?start=${year}-01-01&end=${today}&_=${refreshKey}`)
      .then(r => r.json())
      .then(d => { if (!d.error) setYtdData(d); })
      .catch(() => {});
  }, [refreshKey]);

  // Fetch range data for the table (re-runs on range change or manual refresh)
  useEffect(() => {
    const { start, end } = getRange(rangeKey);
    setLoading(true);
    setError("");
    fetch(`/api/shopify/channel-sales?start=${start}&end=${end}&_=${refreshKey}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) throw new Error(d.error);
        setShopifyData(d);
        // Default selectedWeek to most recent week
        // Weekly is ascending now, so default to the most recent (last) bucket.
        if (d.weekly?.length > 0) setSelectedWeek(d.weekly[d.weekly.length - 1].date);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [rangeKey, refreshKey]);

  // Fetch previous period when compare is toggled on
  useEffect(() => {
    const prev = getCompareRange(rangeKey, compareMode);
    if (!prev) { setPrevTotals(null); setPrevDaily(null); return; }
    setPrevLoading(true);
    Promise.all([
      fetch(`/api/shopify/channel-sales?start=${prev.start}&end=${prev.end}&_=${refreshKey}`).then(r => r.json()),
    ]).then(([d]) => {
      if (!d.error && d.daily) {
        // Build prev daily with full business-wide merge so the comparison
        // matches the current-period math (Proline + SHL + Marketplaces).
        const prevShl: Record<string, ShlContribution> = {};
        for (const day of shlDays) {
          if (day.date >= prev.start && day.date <= prev.end) {
            prevShl[day.date] = {
              gross: day.grossRevenue ?? 0,
              discounts: day.discounts ?? 0,
              refunds: day.refunds ?? 0,
              shipping: day.shipping ?? 0,
              netTax: (day.tax ?? 0) - (day.refundTax ?? 0),
              net: day.netRevenue ?? 0,
            };
          }
        }
        const prevMkt: Record<string, { gross: number; returns: number; net: number }> = {};
        for (const m of marketplace?.days ?? []) {
          if (m.date >= prev.start && m.date <= prev.end) {
            prevMkt[m.date] = { gross: m.gross, returns: m.returns, net: m.net };
          }
        }
        const merged: SalesBucket[] = d.daily.map((row: SalesBucket) =>
          mergeBucket(row, prevShl[row.date], prevMkt[row.date])
        );
        setPrevDaily(merged);
        setPrevTotals(sumBuckets(merged));
      }
    }).finally(() => setPrevLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compareMode, rangeKey, refreshKey]);

  const range = getRange(rangeKey);
  const prevRange = getCompareRange(rangeKey, compareMode);
  const today = new Date().toISOString().substring(0, 10);
  const currentYM = today.substring(0, 7);

  // Per-source per-day contributions, keyed by date. Folding all three sources
  // into Gross/Discounts/Refunds/Shipping/Tax means the math columns are
  // truly business-wide (Proline + SHL + Marketplaces). The SHL and Mktplc
  // columns still exist as a per-source split for visibility.
  const mktMap = useMemo(() => {
    const map: Record<string, { gross: number; returns: number; net: number }> = {};
    if (!marketplace) return map;
    for (const d of marketplace.days) {
      if (d.date >= range.start && d.date <= range.end) {
        map[d.date] = { gross: d.gross, returns: d.returns, net: d.net };
      }
    }
    return map;
  }, [marketplace, range.start, range.end]);

  const mktYtdMap = useMemo(() => {
    const map: Record<string, { gross: number; returns: number; net: number }> = {};
    if (!marketplace) return map;
    const year = new Date().getFullYear();
    for (const d of marketplace.days) {
      if (d.date >= `${year}-01-01` && d.date <= today) {
        map[d.date] = { gross: d.gross, returns: d.returns, net: d.net };
      }
    }
    return map;
  }, [marketplace, today]);

  const shlMap = useMemo(() => {
    const map: Record<string, ShlContribution> = {};
    for (const d of shlDays) {
      if (d.date >= range.start && d.date <= range.end) {
        map[d.date] = {
          gross: d.grossRevenue ?? 0,
          discounts: d.discounts ?? 0,
          refunds: d.refunds ?? 0,
          shipping: d.shipping ?? 0,
          netTax: (d.tax ?? 0) - (d.refundTax ?? 0),
          net: d.netRevenue ?? 0,
        };
      }
    }
    return map;
  }, [shlDays, range.start, range.end]);

  const shlYtdMap = useMemo(() => {
    const map: Record<string, ShlContribution> = {};
    const year = new Date().getFullYear();
    for (const d of shlDays) {
      if (d.date >= `${year}-01-01` && d.date <= today) {
        map[d.date] = {
          gross: d.grossRevenue ?? 0,
          discounts: d.discounts ?? 0,
          refunds: d.refunds ?? 0,
          shipping: d.shipping ?? 0,
          netTax: (d.tax ?? 0) - (d.refundTax ?? 0),
          net: d.netRevenue ?? 0,
        };
      }
    }
    return map;
  }, [shlDays, today]);

  // Fold a per-day Proline bucket together with that day's SHL + marketplace
  // contributions. After this, every "math" field on the bucket represents
  // the full business; PRH/PRO/Phone/SHL/Mktplc columns continue to expose
  // per-source breakdown for visibility.
  function mergeBucket(
    proline: SalesBucket,
    shl: ShlContribution | undefined,
    mkt: { gross: number; returns: number; net: number } | undefined,
  ): SalesBucket {
    const shlGross = shl?.gross ?? 0;
    const shlDiscounts = shl?.discounts ?? 0;
    const shlRefunds = shl?.refunds ?? 0;
    const shlShipping = shl?.shipping ?? 0;
    const shlNetTax = shl?.netTax ?? 0;
    const shlNet = shl?.net ?? 0;
    const mktGross = mkt?.gross ?? 0;
    const mktReturns = mkt?.returns ?? 0;

    const grossSales = proline.grossSales + shlGross + mktGross;
    const discounts = proline.discounts + shlDiscounts;
    const returns = proline.returns + shlRefunds + mktReturns;
    const shipping = proline.shipping + shlShipping;
    const salesTax = proline.salesTax + shlNetTax;
    const redo = proline.redo;
    const netSales = grossSales - discounts - returns - redo;
    const totalSales = netSales + shipping + salesTax;

    return {
      ...proline,
      grossSales,
      discounts,
      returns,
      shipping,
      salesTax,
      redo,
      netSales,
      totalSales,
      shl: shlNet,
      // Show marketplace gross in the Marketplace column. Returns are already
      // counted in the business-wide Refunds line, so subtracting them here
      // would visually double-count them.
      marketplaces: mktGross,
    };
  }

  // Roll daily contributions into week/month buckets so we can fold into
  // Shopify's pre-aggregated weekly/monthly buckets without re-summing daily.
  function rollShl(src: Record<string, ShlContribution>, keyOf: (d: string) => string): Record<string, ShlContribution> {
    const out: Record<string, ShlContribution> = {};
    for (const [date, c] of Object.entries(src)) {
      const k = keyOf(date);
      if (!out[k]) out[k] = { gross: 0, discounts: 0, refunds: 0, shipping: 0, netTax: 0, net: 0 };
      out[k].gross += c.gross;
      out[k].discounts += c.discounts;
      out[k].refunds += c.refunds;
      out[k].shipping += c.shipping;
      out[k].netTax += c.netTax;
      out[k].net += c.net;
    }
    return out;
  }
  function rollMkt(src: Record<string, { gross: number; returns: number; net: number }>, keyOf: (d: string) => string) {
    const out: Record<string, { gross: number; returns: number; net: number }> = {};
    for (const [date, c] of Object.entries(src)) {
      const k = keyOf(date);
      if (!out[k]) out[k] = { gross: 0, returns: 0, net: 0 };
      out[k].gross += c.gross;
      out[k].returns += c.returns;
      out[k].net += c.net;
    }
    return out;
  }

  const shlWeekMap = useMemo(() => rollShl(shlMap, isoWeek), [shlMap]);
  const mktWeekMap = useMemo(() => rollMkt(mktMap, isoWeek), [mktMap]);
  const shlMonthMap = useMemo(() => rollShl(shlMap, d => d.substring(0, 7)), [shlMap]);
  const mktMonthMap = useMemo(() => rollMkt(mktMap, d => d.substring(0, 7)), [mktMap]);

  const daily = useMemo(() =>
    (shopifyData?.daily ?? []).map(d => mergeBucket(d, shlMap[d.date], mktMap[d.date])),
  [shopifyData, shlMap, mktMap]);

  const weekly = useMemo(() => {
    if (!shopifyData) return [];
    return shopifyData.weekly.map(w => mergeBucket(w, shlWeekMap[w.date], mktWeekMap[w.date]));
  }, [shopifyData, shlWeekMap, mktWeekMap]);

  const monthly = useMemo(() => {
    if (!shopifyData) return [];
    return shopifyData.monthly.map(m => mergeBucket(m, shlMonthMap[m.date], mktMonthMap[m.date]));
  }, [shopifyData, shlMonthMap, mktMonthMap]);

  // For the weekly view: daily rows for the selected week
  const weekDailyRows = useMemo(() => {
    if (!selectedWeek) return [];
    return daily.filter(d => isoWeek(d.date) === selectedWeek);
  }, [daily, selectedWeek]);

  // Active table rows
  const tableRows = view === "daily" ? daily : view === "weekly" ? weekDailyRows : monthly;
  const totals = useMemo(() => sumBuckets(tableRows), [tableRows]);

  // Previous-period rows aligned to the active view. Same length as
  // tableRows whenever the prev fetch completes; index N in prevTableRows
  // corresponds to index N in tableRows.
  const prevTableRows = useMemo<SalesBucket[] | null>(() => {
    if (!prevDaily || !showCompare) return null;
    if (view === "daily") return prevDaily.slice(0, tableRows.length);
    const rolled = rollDailyToView(prevDaily, view);
    return rolled.slice(0, tableRows.length);
  }, [prevDaily, view, tableRows.length, showCompare]);

  // Drill-in modal state
  const [drillIn, setDrillIn] = useState<{ channel: DrillChannel; start: string; end: string; rowLabel: string } | null>(null);
  const [metricDrill, setMetricDrill] = useState<{
    metric: Metric;
    row: SalesBucket;
    shl?: ShlContribution;
    mkt?: { gross: number; returns: number; net: number };
    rowLabel: string;
  } | null>(null);

  function openDrill(channel: DrillChannel, rowDate: string) {
    const { start, end } = rowDateRange(rowDate);
    setDrillIn({ channel, start, end, rowLabel: rowDate });
  }

  function openMetric(metric: Metric, row: SalesBucket) {
    // Daily rows ("YYYY-MM-DD") look up daily contributions; monthly rows
    // ("YYYY-MM") look up the month-rolled maps. Weekly view uses daily rows.
    const isMonthly = row.date.length === 7;
    const shl = isMonthly ? shlMonthMap[row.date] : shlMap[row.date];
    const mkt = isMonthly ? mktMonthMap[row.date] : mktMap[row.date];
    setMetricDrill({ metric, row, shl, mkt, rowLabel: row.date });
  }

  // Hide the Other column when it's all zeros — the marketplace skip + status
  // tag stripping leaves it empty most of the time, and an empty column is
  // just visual noise. The "What's in Other?" panel still surfaces if any
  // unclassified orders exist.
  const showOther = totals.other > 0;

  // ── Persistent header stats ──────────────────────────────────────────────
  const ytdDailyWithMkt = useMemo(() =>
    (ytdData?.daily ?? []).map(d => mergeBucket(d, shlYtdMap[d.date], mktYtdMap[d.date])),
  [ytdData, mktYtdMap, shlYtdMap]);

  const ytdTotals = useMemo(() => sumBuckets(ytdDailyWithMkt), [ytdDailyWithMkt]);

  const currentMonthTotals = useMemo(() =>
    sumBuckets(ytdDailyWithMkt.filter(d => d.date.startsWith(currentYM))),
  [ytdDailyWithMkt, currentYM]);

  const currentMonthLabel = MONTHS[new Date().getMonth()] + " " + new Date().getFullYear();

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Sales by Channel</h1>
          <p className="text-gray-400 mt-1">Gross → Discounts → Refunds → Net → Shipping → Tax → Total</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setRefreshKey(k => k + 1)}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg text-sm text-gray-300 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="Force refresh — bypasses cache"
          >
            <svg className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
          <CompareDropdown mode={compareMode} onChange={setCompareMode} rangeKey={rangeKey} prevRange={prevRange} />

          <DateRangeDropdown value={rangeKey} onChange={setRangeKey} />
        </div>
      </div>

      {error && <div className="text-red-400 bg-red-900/20 rounded-lg p-4 mb-6 text-sm">{error}</div>}

      {/* Methodology note */}
      <MethodologyNote />

      {/* Persistent header: YTD + Current Month */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        {/* YTD */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <div className="text-xs text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
            Year to Date {new Date().getFullYear()}
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <div className="text-xs text-gray-500 mb-0.5">Gross Sales</div>
              <div className="text-base font-bold text-white">{fmt(ytdTotals.grossSales)}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-0.5">Net Sales</div>
              <div className="text-base font-bold text-white">{fmt(ytdTotals.netSales)}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-0.5">Total</div>
              <div className="text-base font-bold text-green-400">{fmt(ytdTotals.totalSales)}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-0.5">Discounts</div>
              <div className="text-sm font-medium text-red-400">({fmt(ytdTotals.discounts)})</div>
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-0.5">Refunds</div>
              <div className="text-sm font-medium text-red-400">({fmt(ytdTotals.returns)})</div>
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-0.5">Mktplc + SHL</div>
              <div className="text-sm font-medium text-orange-400">{fmt(ytdTotals.marketplaces + ytdTotals.shl)}</div>
            </div>
          </div>
        </div>

        {/* Current Month */}
        <div className="bg-gray-900 border border-blue-800/40 rounded-xl p-5">
          <div className="text-xs text-blue-400 uppercase tracking-wider mb-3 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
            {currentMonthLabel} — Live
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <div className="text-xs text-gray-500 mb-0.5">Gross Sales</div>
              <div className="text-base font-bold text-white">{fmt(currentMonthTotals.grossSales)}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-0.5">Net Sales</div>
              <div className="text-base font-bold text-white">{fmt(currentMonthTotals.netSales)}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-0.5">Total</div>
              <div className="text-base font-bold text-green-400">{fmt(currentMonthTotals.totalSales)}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-0.5">Discounts</div>
              <div className="text-sm font-medium text-red-400">({fmt(currentMonthTotals.discounts)})</div>
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-0.5">Refunds</div>
              <div className="text-sm font-medium text-red-400">({fmt(currentMonthTotals.returns)})</div>
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-0.5">Mktplc + SHL</div>
              <div className="text-sm font-medium text-orange-400">{fmt(currentMonthTotals.marketplaces + currentMonthTotals.shl)}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Range summary cards */}
      {!loading && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
          {[
            { label: "Gross Sales",  cur: totals.grossSales,                               prev: prevTotals?.grossSales,  inverted: false, color: "text-white",     display: fmt(totals.grossSales),                              sub: "before discounts" },
            { label: "Discounts",    cur: totals.discounts,                                prev: prevTotals?.discounts,   inverted: true,  color: "text-red-400",  display: `(${fmt(totals.discounts)})`,                        sub: "promo codes & sales" },
            { label: "Refunds",      cur: totals.returns,                                  prev: prevTotals?.returns,     inverted: true,  color: "text-red-400",  display: `(${fmt(totals.returns)})`,                          sub: "bucketed on refund date" },
            { label: "Net Sales",    cur: totals.netSales,                                 prev: prevTotals?.netSales,    inverted: false, color: "text-white",     display: fmt(totals.netSales),                                sub: "after discounts & refunds" },
            { label: "Total Sales",  cur: totals.totalSales, prev: prevTotals?.totalSales, inverted: false, color: "text-green-400", display: fmt(totals.totalSales), sub: "Proline + SHL + Mktplc, net + shipping + tax" },
          ].map(card => (
            <div key={card.label} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">{card.label}</div>
              <div className={`text-xl font-bold ${card.color}`}>{card.display}</div>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs text-gray-600">{card.sub}</span>
                {showCompare && card.prev !== undefined && !prevLoading && (
                  <DeltaBadge current={card.cur} previous={card.prev} inverted={card.inverted} />
                )}
              </div>
              {showCompare && card.prev !== undefined && !prevLoading && (
                <div className="text-xs text-gray-600 mt-0.5">prev: {card.label === "Discounts" || card.label === "Refunds" ? `(${fmt(card.prev)})` : fmt(card.prev)}</div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* What's in "Other" — collapsible diagnostic */}
      {shopifyData?.otherBreakdown && shopifyData.otherBreakdown.length > 0 && (
        <details className="bg-gray-900 border border-gray-800 rounded-xl mb-4 overflow-hidden">
          <summary className="px-4 py-3 cursor-pointer text-sm text-gray-400 hover:text-white flex items-center justify-between">
            <span>What&apos;s in &quot;Other&quot;? <span className="text-gray-600 ml-2">{shopifyData.otherBreakdown.length} unique tag combinations · {fmt(shopifyData.otherBreakdown.reduce((s, b) => s + b.amount, 0))}</span></span>
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
          </summary>
          <div className="border-t border-gray-800 px-4 py-3 text-xs">
            <div className="text-gray-500 mb-2">Orders that didn&apos;t match PRH/Phone/PRO after stripping status tags (REFUNDED, redo_claim) and excluding marketplace-synced orders. If a pattern looks like a real channel, tell me and I&apos;ll add a rule.</div>
            <table className="w-full text-xs">
              <thead className="text-gray-500 uppercase">
                <tr><th className="text-left py-1.5">Tags</th><th className="text-right py-1.5">Orders</th><th className="text-right py-1.5">Subtotal</th><th className="text-left py-1.5 pl-4">Sample order</th></tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {shopifyData.otherBreakdown.map(b => (
                  <tr key={b.tags} className="text-gray-300">
                    <td className="py-1.5 font-mono">{b.tags}</td>
                    <td className="py-1.5 text-right">{b.count}</td>
                    <td className="py-1.5 text-right">{fmt(b.amount)}</td>
                    <td className="py-1.5 pl-4 text-gray-500">{b.sampleOrder}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}

      {/* View tabs + week selector — sticky so they stay visible while scrolling
          long daily/monthly tables. */}
      <div className="sticky top-0 z-20 -mx-8 px-8 py-3 bg-black/80 backdrop-blur border-b border-gray-800/50 flex items-center gap-4 mb-4 flex-wrap">
        <div className="flex gap-1 bg-gray-900 border border-gray-800 rounded-lg p-1">
          {(["daily", "weekly", "monthly"] as ViewTab[]).map(t => (
            <button
              key={t}
              onClick={() => setView(t)}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors capitalize ${
                view === t ? "bg-blue-600 text-white" : "text-gray-400 hover:text-white"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Week selector dropdown — only shown on weekly tab */}
        {view === "weekly" && weekly.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">Week:</span>
            <select
              value={selectedWeek}
              onChange={e => setSelectedWeek(e.target.value)}
              className="bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500"
            >
              {weekly.map(w => (
                <option key={w.date} value={w.date}>
                  {weekRangeLabel(w)}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {loading && <TableSkeleton rows={10} cols={13} />}

      {!loading && tableRows.length > 0 && (
        <SalesTrendChart
          rows={tableRows}
          prevRows={prevTableRows}
          view={view}
          compareLabel={compareLabel(rangeKey, compareMode)}
        />
      )}

      {!loading && tableRows.length > 0 && (
        <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">
              {view === "weekly"
                ? `Week of ${weekRangeLabel(weekly.find(w => w.date === selectedWeek) ?? weekly[0])}`
                : view === "monthly" ? "Monthly Breakdown" : "Daily Breakdown"}
            </h2>
            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-500">
                {view === "weekly"
                  ? `${tableRows.length} days this week`
                  : `${tableRows.length} ${view === "daily" ? "days" : "months"}`}
              </span>
              <button
                onClick={() => exportToCSV(
                  tableRows.map(r => ({
                    Date: r.date, PRH: r.prh, Pro: r.prolinePro, Phone: r.phone,
                    SHL: r.shl ?? 0, Other: r.other, Marketplace: r.marketplaces ?? 0,
                    Gross: r.grossSales, Discounts: r.discounts, Refunds: r.returns,
                    Redo: r.redo, Net: r.netSales, Shipping: r.shipping, Tax: r.salesTax,
                    Total: r.totalSales,
                  })),
                  `proline-sales-${range.start}-${range.end}`
                )}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg text-xs text-gray-300 hover:text-white transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Export CSV
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="text-gray-500 text-xs uppercase tracking-wider bg-gray-800 border-b border-gray-800">
                  <th className="py-3 px-3 text-left">{view === "monthly" ? "Month" : "Date"}</th>
                  <th className="py-3 px-3 text-right">PRH</th>
                  <th className="py-3 px-3 text-right">Pro</th>
                  <th className="py-3 px-3 text-right">Phone</th>
                  <th className="py-3 px-3 text-right text-purple-400">SHL</th>
                  {showOther && <th className="py-3 px-3 text-right text-gray-600">Other</th>}
                  <th className="py-3 px-3 text-right text-orange-400">Mktplc</th>
                  <th className="py-3 px-3 text-right border-l border-gray-800">Gross</th>
                  <th className="py-3 px-3 text-right text-red-400">Discounts</th>
                  <th className="py-3 px-3 text-right text-red-400">Refunds</th>
                  <th className="py-3 px-3 text-right text-cyan-400" title="Redo shipping protection fees — collected at checkout, remitted to Redo. Not Proline revenue.">Redo</th>
                  <th className="py-3 px-3 text-right font-semibold text-white">Net</th>
                  <th className="py-3 px-3 text-right">Shipping</th>
                  <th className="py-3 px-3 text-right" title="Combined Proline + SHL net sales tax (tax collected − refunded tax)">Tax <span className="text-gray-600 normal-case">(Proline+SHL)</span></th>
                  <th className="py-3 px-3 text-right font-semibold text-green-400">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {tableRows.map((row, i) => {
                  const isToday = view === "daily" && row.date === today;
                  const prev = prevTableRows?.[i];
                  return (
                    <tr
                      key={row.date}
                      className={`hover:bg-gray-800/40 ${isToday ? "bg-blue-900/20 ring-1 ring-inset ring-blue-700/50" : "text-gray-300"}`}
                    >
                      <td className={`py-2 px-3 whitespace-nowrap font-medium ${isToday ? "text-blue-300" : "text-gray-400"}`}>
                        {row.date}
                        {isToday && <span className="ml-2 text-xs bg-blue-600 text-white px-1.5 py-0.5 rounded-full">Today</span>}
                      </td>
                      <ChannelCell value={row.prh} onClick={() => openDrill("prh", row.date)} />
                      <ChannelCell value={row.prolinePro} onClick={() => openDrill("prolinePro", row.date)} />
                      <ChannelCell value={row.phone} onClick={() => openDrill("phone", row.date)} />
                      <ChannelCell value={row.shl ?? 0} colorClass="text-purple-400" onClick={() => openDrill("shl", row.date)} />
                      {showOther && <ChannelCell value={row.other} colorClass="text-gray-500" onClick={() => openDrill("other", row.date)} />}
                      <MetricCell value={row.marketplaces ?? 0} onClick={() => openMetric("marketplaces", row)} className="text-orange-400" />
                      <MetricCell value={row.grossSales} onClick={() => openMetric("gross", row)} className="border-l border-gray-800" />
                      <td className="py-2 px-3 text-right">{neg(row.discounts)}</td>
                      <MetricCell
                        value={row.returns}
                        onClick={() => openMetric("refunds", row)}
                        render={v => v > 0 ? <span className="text-red-400">({fmt(v)})</span> : <span className="text-gray-600">—</span>}
                      />
                      <MetricCell value={row.redo} onClick={() => openMetric("redo", row)} className="text-cyan-400" />
                      <MetricCell
                        value={row.netSales}
                        onClick={() => openMetric("net", row)}
                        className="font-semibold text-white"
                        prev={prev?.netSales}
                      />
                      <td className="py-2 px-3 text-right text-gray-400">{row.shipping > 0 ? fmt(row.shipping) : <span className="text-gray-600">—</span>}</td>
                      <td className="py-2 px-3 text-right text-gray-400">{row.salesTax > 0 ? fmt(row.salesTax) : <span className="text-gray-600">—</span>}</td>
                      <MetricCell
                        value={row.totalSales}
                        onClick={() => openMetric("total", row)}
                        className="font-semibold text-green-400"
                        prev={prev?.totalSales}
                      />
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-gray-800/50 border-t border-gray-700 font-semibold text-white text-xs">
                  <td className="py-3 px-3 text-gray-400">Total</td>
                  <td className="py-3 px-3 text-right">{fmt(totals.prh)}</td>
                  <td className="py-3 px-3 text-right">{fmt(totals.prolinePro)}</td>
                  <td className="py-3 px-3 text-right">{fmt(totals.phone)}</td>
                  <td className="py-3 px-3 text-right text-purple-400">{fmt(totals.shl)}</td>
                  {showOther && <td className="py-3 px-3 text-right text-gray-500">{fmt(totals.other)}</td>}
                  <td className="py-3 px-3 text-right text-orange-400">{fmt(totals.marketplaces)}</td>
                  <td className="py-3 px-3 text-right border-l border-gray-800">{fmt(totals.grossSales)}</td>
                  <td className="py-3 px-3 text-right text-red-400">({fmt(totals.discounts)})</td>
                  <td className="py-3 px-3 text-right text-red-400">({fmt(totals.returns)})</td>
                  <td className="py-3 px-3 text-right text-cyan-400">{fmt(totals.redo)}</td>
                  <td className="py-3 px-3 text-right">{fmt(totals.netSales)}</td>
                  <td className="py-3 px-3 text-right text-gray-400">{fmt(totals.shipping)}</td>
                  <td className="py-3 px-3 text-right text-gray-400">{fmt(totals.salesTax)}</td>
                  <td className="py-3 px-3 text-right text-green-400">{fmt(totals.totalSales)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {!loading && !error && tableRows.length === 0 && (
        <div className="text-gray-500 text-sm text-center py-12">No data for this period.</div>
      )}

      {drillIn && (
        <OrdersDrillModal
          channel={drillIn.channel}
          start={drillIn.start}
          end={drillIn.end}
          rowLabel={drillIn.rowLabel}
          onClose={() => setDrillIn(null)}
        />
      )}

      {metricDrill && (
        <MetricBreakdownModal
          metric={metricDrill.metric}
          row={metricDrill.row}
          shl={metricDrill.shl}
          mkt={metricDrill.mkt}
          rowLabel={metricDrill.rowLabel}
          marketplaceDays={marketplace?.days ?? []}
          onClose={() => setMetricDrill(null)}
        />
      )}
    </div>
  );
}

function MethodologyNote() {
  const [open, setOpen] = useState(false);
  return (
    <div className="mb-6 bg-gray-900 border border-gray-700/50 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm text-gray-400 hover:text-gray-200 transition-colors"
      >
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-blue-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="font-medium text-gray-300">How these numbers are calculated</span>
          <span className="text-xs text-gray-600">— Numbers will not match Shopify Analytics exactly. Click to understand why.</span>
        </div>
        <svg className={`w-4 h-4 transition-transform ${open ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="px-4 pb-4 border-t border-gray-800 pt-4 grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Column Definitions</h3>
            <div className="space-y-2 text-xs text-gray-400">
              <div><span className="text-gray-200 font-medium">PRH / PRO / PHONE / OTHER</span> — Shopify orders split by tag, in priority order: <code className="bg-gray-800 px-1 rounded">ProlinePro B2B</code> = PRO (wins over phone if both tags are present), <code className="bg-gray-800 px-1 rounded">[]</code> alone = Phone, no tags = PRH (website), anything else = Other. Status tags (<code className="bg-gray-800 px-1 rounded">REFUNDED</code>, <code className="bg-gray-800 px-1 rounded">redo_claim</code>) are stripped before classification — they describe what happened to the order, not how the sale came in. Orders tagged <code className="bg-gray-800 px-1 rounded">Market Place Order</code>/<code className="bg-gray-800 px-1 rounded">Marketplace</code> are excluded entirely (tracked via the Mktplc column from Sheets).</div>
              <div><span className="text-gray-200 font-medium">SHL</span> — Smart Home Luxury Shopify store (separate account). Net revenue by order date.</div>
              <div><span className="text-gray-200 font-medium">MKTPLC</span> — Amazon, Wayfair, Home Depot. Pulled from Google Sheets (manually entered).</div>
              <div><span className="text-gray-200 font-medium">GROSS</span> — Business-wide line-item revenue before discounts: <code className="bg-gray-800 px-1 rounded">Proline (subtotal + total_discounts) + SHL (subtotal + total_discounts) + Marketplaces gross</code>.</div>
              <div><span className="text-gray-200 font-medium">DISCOUNTS</span> — Proline + SHL <code className="bg-gray-800 px-1 rounded">total_discounts</code>. Marketplaces aren&apos;t broken out by discount in Sheets.</div>
              <div><span className="text-gray-200 font-medium">REFUNDS</span> — Business-wide: Proline + SHL refund line-item subtotals plus Marketplace returns. Attributed to the <span className="text-yellow-400">date the refund was processed</span> (not the original order date). Includes refunds processed in the window for orders placed before the window.</div>
              <div><span className="text-gray-200 font-medium">NET</span> — Gross − Discounts − Refunds − Redo. All four are business-wide.</div>
              <div><span className="text-gray-200 font-medium">TOTAL</span> — Net + Shipping + Tax. Net already folds in SHL and Marketplaces, so Total is the full business in a single number. <span className="text-orange-400">Larger than Shopify Analytics by design — it sees one store at a time.</span></div>
            </div>
          </div>
          <div>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Why Numbers Differ from Shopify Analytics</h3>
            <div className="space-y-3 text-xs text-gray-400">
              <div className="flex gap-2">
                <span className="text-yellow-400 font-bold flex-shrink-0">1.</span>
                <div><span className="text-gray-200 font-medium">All math columns are business-wide by design</span> — Shopify Analytics only shows one store at a time. Our Gross, Refunds, Net, and Total fold in Proline + SHL + Marketplaces so the dashboard reflects the full business in a single row.</div>
              </div>
              <div className="flex gap-2">
                <span className="text-yellow-400 font-bold flex-shrink-0">2.</span>
                <div><span className="text-gray-200 font-medium">Refunds may shift dates</span> — Refunds processed on a different day than the original order will appear on the refund date. A refund processed today for a week-old order shows in today&apos;s row.</div>
              </div>
              <div className="flex gap-2">
                <span className="text-yellow-400 font-bold flex-shrink-0">3.</span>
                <div><span className="text-gray-200 font-medium">Timezone</span> — Orders are fetched using UTC-7 (Mountain Time). If your Shopify store is set to a different timezone, orders placed near midnight may land on a different date here vs Shopify Analytics.</div>
              </div>
              <div className="flex gap-2">
                <span className="text-yellow-400 font-bold flex-shrink-0">4.</span>
                <div><span className="text-gray-200 font-medium">Refund amount calculation</span> — We sum refund line items (subtotal only — refunded tax is netted out of the Tax column to match Shopify&apos;s Total sales breakdown).</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
