"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

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
  revenue: number | null;
  bounced: number | null;
  unsubscribed: number | null;
  revenuePerEmail: number | null;
}

function fmt$(n: number | null) {
  if (n === null) return "—";
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}
function fmtN(n: number | null) {
  if (n === null) return "—";
  return n.toLocaleString("en-US");
}

function triggerLabel(t: string | null) {
  if (!t) return "—";
  const map: Record<string, string> = {
    "added_to_list": "List Added",
    "metric": "Metric / Event",
    "price_drop": "Price Drop",
    "back_in_stock": "Back in Stock",
    "date_based": "Date Based",
    "abandoned_cart": "Abandoned Cart",
  };
  return map[t] ?? t.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

export default function FlowsPage() {
  const [flows, setFlows] = useState<Flow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/klaviyo/flows")
      .then(r => r.json())
      .then(d => {
        if (d.error) setError(d.error);
        else setFlows(d.flows ?? []);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const activeFlows = flows.filter(f => f.status === "live" || f.status === "manual");
  const totalRevenue = flows.reduce((s, f) => s + (f.revenue ?? 0), 0);
  const totalDelivered = flows.reduce((s, f) => s + (f.delivered ?? 0), 0);

  const td = "px-4 py-3 text-sm";
  const th = "px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide whitespace-nowrap";

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
            <Link href="/dashboard/email" className="hover:text-gray-300">Email Marketing</Link>
            <span>/</span>
            <span className="text-gray-300">Flows</span>
          </div>
          <h1 className="text-2xl font-bold text-white">Flow Performance</h1>
          <p className="text-gray-400 text-sm mt-1">Last 365 days — automated email sequences</p>
        </div>
      </div>

      {error && (
        <div className="bg-red-900/20 border border-red-700/30 rounded-xl p-4 text-red-400 text-sm">{error}</div>
      )}

      {loading && <div className="text-gray-500 text-sm animate-pulse">Loading flows…</div>}

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

          {/* Revenue bars — top flows */}
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
                <thead className="border-b border-gray-800">
                  <tr>
                    <th className={th}>Flow</th>
                    <th className={`${th} text-center`}>Status</th>
                    <th className={`${th} text-center`}>Trigger</th>
                    <th className={`${th} text-right`}>Delivered</th>
                    <th className={`${th} text-right`}>Open Rate</th>
                    <th className={`${th} text-right`}>Click Rate</th>
                    <th className={`${th} text-right`}>Revenue</th>
                    <th className={`${th} text-right`}>Rev / Email</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {flows.length === 0 && (
                    <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-500">No flows found.</td></tr>
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

function RateCell({ value, low, high }: { value: number | null; low: number; high: number }) {
  if (value === null) return <span className="text-gray-500">—</span>;
  const color = value >= high ? "text-green-400" : value >= low ? "text-yellow-400" : "text-red-400";
  return <span className={color}>{(value * 100).toFixed(1)}%</span>;
}
