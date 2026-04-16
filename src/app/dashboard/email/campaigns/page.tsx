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

interface Campaign {
  id: string;
  name: string;
  status: string;
  sentAt: string | null;
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
function fmtDate(s: string | null) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

type SortKey = "sentAt" | "delivered" | "openRate" | "clickRate" | "bounceRate" | "unsubRate" | "revenue";

export default function CampaignsPage() {
  const [timeframe, setTimeframe] = useState("last_365_days");
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("sentAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [filter, setFilter] = useState<"all" | "sent">("sent");

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/klaviyo/campaigns?timeframe=${timeframe}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) setError(d.error);
        else setCampaigns(d.campaigns ?? []);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [timeframe]);

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
  }

  const visible = campaigns
    .filter(c => filter === "all" || c.status === "Sent")
    .sort((a, b) => {
      let av: number, bv: number;
      if (sortKey === "sentAt") {
        av = a.sentAt ? new Date(a.sentAt).getTime() : 0;
        bv = b.sentAt ? new Date(b.sentAt).getTime() : 0;
      } else {
        av = (a[sortKey] as number | null) ?? -1;
        bv = (b[sortKey] as number | null) ?? -1;
      }
      return sortDir === "desc" ? bv - av : av - bv;
    });

  const totalRevenue = visible.reduce((s, c) => s + (c.revenue ?? 0), 0);
  const totalDelivered = visible.reduce((s, c) => s + (c.delivered ?? 0), 0);
  const totalOpens = visible.reduce((s, c) => s + (c.opens ?? 0), 0);
  const totalClicks = visible.reduce((s, c) => s + (c.clicks ?? 0), 0);
  const totalBounced = visible.reduce((s, c) => s + (c.bounced ?? 0), 0);
  const totalUnsub = visible.reduce((s, c) => s + (c.unsubscribed ?? 0), 0);

  const tfLabel = TIMEFRAMES.find(t => t.key === timeframe)?.label ?? timeframe;

  function handleExport() {
    if (!visible.length) return;
    exportToCSV(visible.map(c => ({
      name: c.name,
      status: c.status,
      sent_at: fmtDate(c.sentAt),
      delivered: c.delivered ?? "",
      opens: c.opens ?? "",
      open_rate: c.openRate != null ? fmtPct(c.openRate) : "",
      clicks: c.clicks ?? "",
      click_rate: c.clickRate != null ? fmtPct(c.clickRate) : "",
      bounced: c.bounced ?? "",
      bounce_rate: c.bounceRate != null ? fmtPct(c.bounceRate) : "",
      unsubscribed: c.unsubscribed ?? "",
      unsub_rate: c.unsubRate != null ? fmtPct(c.unsubRate) : "",
      revenue: c.revenue ?? "",
      revenue_per_email: c.revenuePerEmail != null ? c.revenuePerEmail.toFixed(2) : "",
    })), `campaigns-${timeframe}.csv`);
  }

  function SortIcon({ k }: { k: SortKey }) {
    if (sortKey !== k) return <span className="text-gray-600 ml-1">↕</span>;
    return <span className="text-blue-400 ml-1">{sortDir === "desc" ? "↓" : "↑"}</span>;
  }

  const th = "px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide whitespace-nowrap cursor-pointer hover:text-gray-200 select-none";
  const td = "px-4 py-3 text-sm";

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
            <Link href="/dashboard/email" className="hover:text-gray-300">Email Marketing</Link>
            <span>/</span>
            <span className="text-gray-300">Campaigns</span>
          </div>
          <h1 className="text-2xl font-bold text-white">Campaign Performance</h1>
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
            onClick={() => setFilter("sent")}
            className={`px-3 py-2 rounded-lg text-sm transition-colors ${filter === "sent" ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-400 hover:text-gray-200"}`}
          >Sent only</button>
          <button
            onClick={() => setFilter("all")}
            className={`px-3 py-2 rounded-lg text-sm transition-colors ${filter === "all" ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-400 hover:text-gray-200"}`}
          >All</button>
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
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <TableSkeleton rows={10} cols={9} />
          </div>
        </div>
      )}

      {!loading && !error && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Campaigns</div>
              <div className="text-2xl font-bold text-white">{visible.length}</div>
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

          {/* Table */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="sticky top-0 z-10 border-b border-gray-800 bg-gray-900">
                  <tr>
                    <th className={th} onClick={() => handleSort("sentAt")}>Campaign <SortIcon k="sentAt" /></th>
                    <th className={`${th} text-center`}>Status</th>
                    <th className={`${th} text-right`} onClick={() => handleSort("delivered")}>Delivered <SortIcon k="delivered" /></th>
                    <th className={`${th} text-right`} onClick={() => handleSort("openRate")}>Open Rate <SortIcon k="openRate" /></th>
                    <th className={`${th} text-right`} onClick={() => handleSort("clickRate")}>Click Rate <SortIcon k="clickRate" /></th>
                    <th className={`${th} text-right`} onClick={() => handleSort("bounceRate")}>Bounce Rate <SortIcon k="bounceRate" /></th>
                    <th className={`${th} text-right`} onClick={() => handleSort("unsubRate")}>Unsub Rate <SortIcon k="unsubRate" /></th>
                    <th className={`${th} text-right`} onClick={() => handleSort("revenue")}>Revenue <SortIcon k="revenue" /></th>
                    <th className={`${th} text-right`}>Rev / Email</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {visible.length === 0 && (
                    <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-500">No campaigns found.</td></tr>
                  )}
                  {visible.map(c => (
                    <tr key={c.id} className="hover:bg-gray-800/40 transition-colors">
                      <td className={td}>
                        <div className="text-white font-medium max-w-xs truncate">{c.name}</div>
                        <div className="text-gray-500 text-xs mt-0.5">{fmtDate(c.sentAt)}</div>
                      </td>
                      <td className={`${td} text-center`}>
                        <StatusBadge status={c.status} />
                      </td>
                      <td className={`${td} text-right text-gray-300`}>{fmtN(c.delivered)}</td>
                      <td className={`${td} text-right`}>
                        <RateCell value={c.openRate} low={0.20} high={0.35} />
                      </td>
                      <td className={`${td} text-right`}>
                        <RateCell value={c.clickRate} low={0.01} high={0.03} />
                      </td>
                      <td className={`${td} text-right`}>
                        <RateCell value={c.bounceRate} low={0.02} high={0.01} inverted />
                      </td>
                      <td className={`${td} text-right`}>
                        <RateCell value={c.unsubRate} low={0.005} high={0.002} inverted />
                      </td>
                      <td className={`${td} text-right font-medium text-green-400`}>{fmt$(c.revenue)}</td>
                      <td className={`${td} text-right text-gray-400`}>
                        {c.revenuePerEmail !== null ? "$" + c.revenuePerEmail.toFixed(2) : "—"}
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

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    Sent: "bg-green-900/20 text-green-400",
    Draft: "bg-gray-800 text-gray-400",
    Scheduled: "bg-blue-900/20 text-blue-400",
    Cancelled: "bg-red-900/20 text-red-400",
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${map[status] ?? "bg-gray-800 text-gray-400"}`}>
      {status}
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
