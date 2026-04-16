"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { KPISkeleton, TableSkeleton } from "@/components/Skeleton";
import { exportToCSV } from "@/lib/export-csv";

const TIMEFRAMES = [
  { key: "last_30_days",  label: "Last 30 Days" },
  { key: "last_90_days",  label: "Last 90 Days" },
  { key: "this_month",    label: "This Month" },
  { key: "last_month",    label: "Last Month" },
  { key: "last_365_days", label: "Last 365 Days" },
  { key: "this_year",     label: "This Year" },
  { key: "all_time",      label: "All Time" },
];

interface Flow {
  id: string;
  name: string;
  status: string;
  triggerType: string | null;
  createdAt: string | null;
  delivered: number | null;
  opens: number | null;
  openRate: number | null;
  clicks: number | null;
  clickRate: number | null;
  bounced: number | null;
  bounceRate: number | null;
  unsubscribed: number | null;
  unsubRate: number | null;
  revenue: number | null;
  revenuePerEmail: number | null;
}

function fmt$(n: number | null) {
  if (n === null) return "—";
  return "$" + n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}
function fmtN(n: number | null) {
  if (n === null) return "—";
  return n.toLocaleString("en-US");
}
function fmtPct(n: number | null) {
  if (n === null) return "—";
  return (n * 100).toFixed(1) + "%";
}

function triggerLabel(t: string | null) {
  if (!t) return "—";
  const map: Record<string, string> = {
    added_to_list: "List Added",
    metric: "Metric / Event",
    price_drop: "Price Drop",
    back_in_stock: "Back in Stock",
    date_based: "Date Based",
    abandoned_cart: "Abandoned Cart",
  };
  return map[t] ?? t.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

export default function FlowsPage() {
  const [timeframe, setTimeframe] = useState("last_365_days");
  const [flows, setFlows] = useState<Flow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/klaviyo/flows?timeframe=${timeframe}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) setError(d.error);
        else setFlows(d.flows ?? []);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [timeframe]);

  const activeFlows = flows.filter(f => f.status === "live" || f.status === "manual");
  const totalRevenue = flows.reduce((s, f) => s + (f.revenue ?? 0), 0);
  const totalDelivered = flows.reduce((s, f) => s + (f.delivered ?? 0), 0);
  const totalOpens = flows.reduce((s, f) => s + (f.opens ?? 0), 0);
  const totalClicks = flows.reduce((s, f) => s + (f.clicks ?? 0), 0);
  const totalBounced = flows.reduce((s, f) => s + (f.bounced ?? 0), 0);
  const totalUnsub = flows.reduce((s, f) => s + (f.unsubscribed ?? 0), 0);

  const tfLabel = TIMEFRAMES.find(t => t.key === timeframe)?.label ?? timeframe;

  function handleExport() {
    if (!flows.length) return;
    exportToCSV(flows.map(f => ({
      name: f.name,
      status: f.status,
      trigger: triggerLabel(f.triggerType),
      delivered: f.delivered ?? "",
      opens: f.opens ?? "",
      open_rate: f.openRate != null ? fmtPct(f.openRate) : "",
      clicks: f.clicks ?? "",
      click_rate: f.clickRate != null ? fmtPct(f.clickRate) : "",
      bounced: f.bounced ?? "",
      bounce_rate: f.bounceRate != null ? fmtPct(f.bounceRate) : "",
      unsubscribed: f.unsubscribed ?? "",
      unsub_rate: f.unsubRate != null ? fmtPct(f.unsubRate) : "",
      revenue: f.revenue ?? "",
      revenue_per_email: f.revenuePerEmail != null ? f.revenuePerEmail.toFixed(2) : "",
    })), `flows-${timeframe}.csv`);
  }

  const th = "px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide whitespace-nowrap";
  const td = "px-4 py-3 text-sm";

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
            <Link href="/dashboard/email" className="hover:text-gray-300">Email Marketing</Link>
            <span>/</span>
            <span className="text-gray-300">Flows</span>
          </div>
          <h1 className="text-2xl font-bold text-white">Flow Performance</h1>
          <p className="text-gray-400 text-sm mt-1">Powered by Klaviyo · {tfLabel}</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <select
            value={timeframe}
            onChange={e => setTimeframe(e.target.value)}
            className="bg-gray-800 border border-gray-700 text-gray-300 text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500"
          >
            {TIMEFRAMES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
          </select>
          <button
            onClick={handleExport}
            className="px-3 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm rounded-lg transition-colors"
          >Export CSV</button>
        </div>
      </div>

      {error && <div className="bg-red-900/20 border border-red-700/30 rounded-xl p-4 text-red-400 text-sm">{error}</div>}

      {loading && (
        <div className="space-y-6">
          <KPISkeleton count={4} />
          <KPISkeleton count={4} />
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <TableSkeleton rows={8} cols={9} />
          </div>
        </div>
      )}

      {!loading && !error && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Active Flows</div>
              <div className="text-2xl font-bold text-white">{activeFlows.length} <span className="text-sm text-gray-500">/ {flows.length}</span></div>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Total Delivered</div>
              <div className="text-2xl font-bold text-blue-400">{fmtN(totalDelivered)}</div>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Total Revenue</div>
              <div className="text-2xl font-bold text-green-400">{fmt$(totalRevenue)}</div>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Revenue / Email</div>
              <div className="text-2xl font-bold text-yellow-400">
                {totalDelivered > 0 ? "$" + (totalRevenue / totalDelivered).toFixed(2) : "—"}
              </div>
            </div>
          </div>

          {/* Aggregate rates */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Avg Open Rate</div>
              <div className={`text-2xl font-bold ${totalDelivered > 0 && totalOpens / totalDelivered >= 0.30 ? "text-green-400" : totalDelivered > 0 && totalOpens / totalDelivered >= 0.20 ? "text-yellow-400" : "text-red-400"}`}>
                {totalDelivered > 0 ? fmtPct(totalOpens / totalDelivered) : "—"}
              </div>
              <div className="text-xs text-gray-600 mt-1">Weighted avg</div>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Avg Click Rate</div>
              <div className={`text-2xl font-bold ${totalDelivered > 0 && totalClicks / totalDelivered >= 0.03 ? "text-green-400" : totalDelivered > 0 && totalClicks / totalDelivered >= 0.01 ? "text-yellow-400" : "text-red-400"}`}>
                {totalDelivered > 0 ? fmtPct(totalClicks / totalDelivered) : "—"}
              </div>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Bounce Rate</div>
              <div className={`text-2xl font-bold ${totalDelivered > 0 && totalBounced / totalDelivered <= 0.01 ? "text-green-400" : totalDelivered > 0 && totalBounced / totalDelivered <= 0.02 ? "text-yellow-400" : "text-red-400"}`}>
                {totalDelivered > 0 ? fmtPct(totalBounced / totalDelivered) : "—"}
              </div>
              <div className="text-xs text-gray-500 mt-1">{fmtN(totalBounced)} bounces</div>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Unsubscribe Rate</div>
              <div className={`text-2xl font-bold ${totalDelivered > 0 && totalUnsub / totalDelivered <= 0.002 ? "text-green-400" : totalDelivered > 0 && totalUnsub / totalDelivered <= 0.005 ? "text-yellow-400" : "text-red-400"}`}>
                {totalDelivered > 0 ? fmtPct(totalUnsub / totalDelivered) : "—"}
              </div>
              <div className="text-xs text-gray-500 mt-1">{fmtN(totalUnsub)} unsubs</div>
            </div>
          </div>

          {/* Revenue bars */}
          {flows.filter(f => (f.revenue ?? 0) > 0).length > 0 && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-4">Revenue by Flow</h2>
              <div className="space-y-3">
                {flows
                  .filter(f => (f.revenue ?? 0) > 0)
                  .slice(0, 8)
                  .map(f => {
                    const pct = totalRevenue > 0 ? ((f.revenue ?? 0) / totalRevenue) * 100 : 0;
                    return (
                      <div key={f.id}>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-gray-300 truncate max-w-xs">{f.name}</span>
                          <span className="text-white font-medium ml-4 flex-shrink-0">
                            {fmt$(f.revenue)} <span className="text-gray-500">({pct.toFixed(0)}%)</span>
                          </span>
                        </div>
                        <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                          <div className="h-full bg-purple-500 rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                        <div className="text-xs text-gray-600 mt-1">{fmtN(f.delivered)} delivered · {fmtN(f.opens)} opens</div>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}

          {/* Flows table */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="sticky top-0 z-10 border-b border-gray-800 bg-gray-900">
                  <tr>
                    <th className={th}>Flow</th>
                    <th className={`${th} text-center`}>Status</th>
                    <th className={`${th} text-center`}>Trigger</th>
                    <th className={`${th} text-right`}>Delivered</th>
                    <th className={`${th} text-right`}>Open Rate</th>
                    <th className={`${th} text-right`}>Click Rate</th>
                    <th className={`${th} text-right`}>Bounce Rate</th>
                    <th className={`${th} text-right`}>Unsub Rate</th>
                    <th className={`${th} text-right`}>Revenue</th>
                    <th className={`${th} text-right`}>Rev / Email</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {flows.length === 0 && (
                    <tr><td colSpan={10} className="px-4 py-8 text-center text-gray-500">No flows found.</td></tr>
                  )}
                  {flows.map(f => (
                    <tr key={f.id} className="hover:bg-gray-800/40 transition-colors">
                      <td className={td}>
                        <div className="text-white font-medium max-w-xs truncate">{f.name}</div>
                      </td>
                      <td className={`${td} text-center`}>
                        <FlowStatusBadge status={f.status} />
                      </td>
                      <td className={`${td} text-center text-gray-400 text-xs`}>{triggerLabel(f.triggerType)}</td>
                      <td className={`${td} text-right text-gray-300`}>{fmtN(f.delivered)}</td>
                      <td className={`${td} text-right`}>
                        <RateCell value={f.openRate} low={0.20} high={0.35} />
                      </td>
                      <td className={`${td} text-right`}>
                        <RateCell value={f.clickRate} low={0.01} high={0.03} />
                      </td>
                      <td className={`${td} text-right`}>
                        <RateCell value={f.bounceRate} low={0.02} high={0.01} inverted />
                      </td>
                      <td className={`${td} text-right`}>
                        <RateCell value={f.unsubRate} low={0.005} high={0.002} inverted />
                      </td>
                      <td className={`${td} text-right font-medium text-green-400`}>{fmt$(f.revenue)}</td>
                      <td className={`${td} text-right text-gray-400`}>
                        {f.revenuePerEmail !== null ? "$" + f.revenuePerEmail.toFixed(2) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function FlowStatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    live: "bg-green-900/20 text-green-400",
    manual: "bg-yellow-900/20 text-yellow-400",
    draft: "bg-gray-800 text-gray-400",
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${map[status] ?? "bg-gray-800 text-gray-400"}`}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

function RateCell({ value, low, high, inverted = false }: { value: number | null; low: number; high: number; inverted?: boolean }) {
  if (value === null) return <span className="text-gray-500">—</span>;
  let color: string;
  if (inverted) {
    color = value <= high ? "text-green-400" : value <= low ? "text-yellow-400" : "text-red-400";
  } else {
    color = value >= high ? "text-green-400" : value >= low ? "text-yellow-400" : "text-red-400";
  }
  return <span className={color}>{(value * 100).toFixed(1)}%</span>;
}
