"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

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
function fmtPct(n: number | null) {
  if (n === null) return "—";
  return (n * 100).toFixed(1) + "%";
}
function fmtDate(s: string | null) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

type SortKey = "sentAt" | "delivered" | "openRate" | "clickRate" | "revenue";

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("sentAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [filter, setFilter] = useState<"all" | "sent">("sent");

  useEffect(() => {
    fetch("/api/klaviyo/campaigns")
      .then(r => r.json())
      .then(d => {
        if (d.error) setError(d.error);
        else setCampaigns(d.campaigns ?? []);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

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

  function SortIcon({ k }: { k: SortKey }) {
    if (sortKey !== k) return <span className="text-gray-600 ml-1">↕</span>;
    return <span className="text-blue-400 ml-1">{sortDir === "desc" ? "↓" : "↑"}</span>;
  }

  const th = "px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide whitespace-nowrap cursor-pointer hover:text-gray-200 select-none";
  const td = "px-4 py-3 text-sm";

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
            <Link href="/dashboard/email" className="hover:text-gray-300">Email Marketing</Link>
            <span>/</span>
            <span className="text-gray-300">Campaigns</span>
          </div>
          <h1 className="text-2xl font-bold text-white">Campaign Performance</h1>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setFilter("sent")}
            className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${filter === "sent" ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-400 hover:text-gray-200"}`}
          >Sent only</button>
          <button
            onClick={() => setFilter("all")}
            className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${filter === "all" ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-400 hover:text-gray-200"}`}
          >All</button>
        </div>
      </div>

      {/* Summary cards */}
      {!loading && !error && (
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
      )}

      {error && (
        <div className="bg-red-900/20 border border-red-700/30 rounded-xl p-4 text-red-400 text-sm">{error}</div>
      )}

      {loading && <div className="text-gray-500 text-sm animate-pulse">Loading campaigns…</div>}

      {!loading && !error && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-gray-800">
                <tr>
                  <th className={th} onClick={() => handleSort("sentAt")}>Campaign <SortIcon k="sentAt" /></th>
                  <th className={`${th} text-center`}>Status</th>
                  <th className={`${th} text-right`} onClick={() => handleSort("delivered")}>Delivered <SortIcon k="delivered" /></th>
                  <th className={`${th} text-right`} onClick={() => handleSort("openRate")}>Open Rate <SortIcon k="openRate" /></th>
                  <th className={`${th} text-right`} onClick={() => handleSort("clickRate")}>Click Rate <SortIcon k="clickRate" /></th>
                  <th className={`${th} text-right`} onClick={() => handleSort("revenue")}>Revenue <SortIcon k="revenue" /></th>
                  <th className={`${th} text-right`}>Rev / Email</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {visible.length === 0 && (
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-500">No campaigns found.</td></tr>
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

function RateCell({ value, low, high }: { value: number | null; low: number; high: number }) {
  if (value === null) return <span className="text-gray-500">—</span>;
  const color = value >= high ? "text-green-400" : value >= low ? "text-yellow-400" : "text-red-400";
  return <span className={color}>{(value * 100).toFixed(1)}%</span>;
}
