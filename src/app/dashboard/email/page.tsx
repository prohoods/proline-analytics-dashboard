"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface KlaviyoList {
  id: string;
  name: string;
}

interface Last30Days {
  campaignDelivered: number;
  campaignOpens: number;
  campaignClicks: number;
  campaignRevenue: number;
  avgOpenRate: number;
  avgClickRate: number;
  flowRevenue: number;
  flowDelivered: number;
  totalEmailRevenue: number;
}

interface OverviewData {
  totalProfiles: number | null;
  lists: KlaviyoList[];
  last30Days: Last30Days;
  metricId: string | null;
}

function fmt$( n: number | null ) {
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

export default function EmailOverviewPage() {
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch("/api/klaviyo/overview")
      .then(r => r.json())
      .then(d => {
        if (d.error) setError(d.error);
        else setData(d);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const d = data?.last30Days;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Email Marketing</h1>
          <p className="text-gray-400 text-sm mt-1">Powered by Klaviyo — last 30 days</p>
        </div>
        <div className="flex gap-3">
          <Link
            href="/dashboard/email/campaigns"
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg transition-colors"
          >
            Campaigns →
          </Link>
          <Link
            href="/dashboard/email/flows"
            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm rounded-lg transition-colors"
          >
            Flows →
          </Link>
        </div>
      </div>

      {error && (
        <div className="bg-red-900/20 border border-red-700/30 rounded-xl p-4 text-red-400 text-sm">
          {error}
        </div>
      )}

      {loading && (
        <div className="text-gray-500 text-sm animate-pulse">Loading Klaviyo data…</div>
      )}

      {!loading && !error && data && (
        <>
          {/* Top KPI cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard
              label="Total Subscribers"
              value={data.totalProfiles !== null ? fmtN(data.totalProfiles) : "—"}
              sub="All profiles"
              color="blue"
            />
            <KpiCard
              label="Email Revenue (30d)"
              value={fmt$(d?.totalEmailRevenue ?? null)}
              sub={`Campaigns ${fmt$(d?.campaignRevenue ?? null)} + Flows ${fmt$(d?.flowRevenue ?? null)}`}
              color="green"
            />
            <KpiCard
              label="Avg Open Rate"
              value={fmtPct(d?.avgOpenRate ?? null)}
              sub={`${fmtN(d?.campaignOpens ?? null)} opens from ${fmtN(d?.campaignDelivered ?? null)} delivered`}
              color="yellow"
            />
            <KpiCard
              label="Avg Click Rate"
              value={fmtPct(d?.avgClickRate ?? null)}
              sub={`${fmtN(d?.campaignClicks ?? null)} clicks`}
              color="purple"
            />
          </div>

          {/* Revenue split */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-4">Revenue Split (30d)</h2>
              <div className="space-y-3">
                <RevenueBar label="Campaigns" value={d?.campaignRevenue ?? 0} total={d?.totalEmailRevenue ?? 0} color="bg-blue-500" />
                <RevenueBar label="Flows / Automations" value={d?.flowRevenue ?? 0} total={d?.totalEmailRevenue ?? 0} color="bg-purple-500" />
              </div>
              <div className="mt-4 pt-4 border-t border-gray-800 flex justify-between text-sm">
                <span className="text-gray-400">Total email-attributed</span>
                <span className="text-white font-semibold">{fmt$(d?.totalEmailRevenue ?? null)}</span>
              </div>
            </div>

            {/* Lists */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-4">Lists</h2>
              {data.lists.length === 0 ? (
                <p className="text-gray-500 text-sm">No lists found.</p>
              ) : (
                <div className="space-y-2">
                  {data.lists
                    .slice(0, 8)
                    .map(list => (
                      <div key={list.id} className="flex items-center">
                        <span className="text-gray-300 text-sm">{list.name}</span>
                      </div>
                    ))}
                </div>
              )}
            </div>
          </div>

          {/* Quick links */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Link href="/dashboard/email/campaigns" className="bg-gray-900 border border-gray-800 hover:border-blue-700/50 rounded-xl p-5 transition-colors group">
              <div className="flex items-center gap-3 mb-2">
                <span className="text-2xl">📧</span>
                <h3 className="text-white font-semibold group-hover:text-blue-400 transition-colors">Campaign Performance</h3>
              </div>
              <p className="text-gray-400 text-sm">Open rates, click rates, revenue per campaign for the last 50 email sends.</p>
            </Link>
            <Link href="/dashboard/email/flows" className="bg-gray-900 border border-gray-800 hover:border-purple-700/50 rounded-xl p-5 transition-colors group">
              <div className="flex items-center gap-3 mb-2">
                <span className="text-2xl">🔄</span>
                <h3 className="text-white font-semibold group-hover:text-purple-400 transition-colors">Flow Performance</h3>
              </div>
              <p className="text-gray-400 text-sm">Abandoned cart, welcome series, post-purchase and other automation revenue.</p>
            </Link>
          </div>
        </>
      )}
    </div>
  );
}

function KpiCard({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) {
  const colorMap: Record<string, string> = {
    blue: "text-blue-400",
    green: "text-green-400",
    yellow: "text-yellow-400",
    purple: "text-purple-400",
  };
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
      <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">{label}</div>
      <div className={`text-2xl font-bold ${colorMap[color] ?? "text-white"}`}>{value}</div>
      <div className="text-xs text-gray-500 mt-1 truncate">{sub}</div>
    </div>
  );
}

function RevenueBar({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const pct = total > 0 ? (value / total) * 100 : 0;
  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span className="text-gray-300">{label}</span>
        <span className="text-white font-medium">${value.toLocaleString("en-US", { maximumFractionDigits: 0 })} <span className="text-gray-500">({pct.toFixed(0)}%)</span></span>
      </div>
      <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
