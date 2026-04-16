"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { KPISkeleton, SkeletonBar } from "@/components/Skeleton";

const TIMEFRAMES = [
  { key: "last_30_days",  label: "Last 30 Days" },
  { key: "last_90_days",  label: "Last 90 Days" },
  { key: "this_month",    label: "This Month" },
  { key: "last_month",    label: "Last Month" },
  { key: "last_365_days", label: "Last 365 Days" },
  { key: "this_year",     label: "This Year" },
  { key: "all_time",      label: "All Time" },
];

interface Stats {
  campaignDelivered: number;
  campaignOpens: number;
  campaignClicks: number;
  campaignBounced: number;
  campaignUnsubscribed: number;
  campaignRevenue: number;
  avgOpenRate: number;
  avgClickRate: number;
  avgBounceRate: number;
  avgUnsubRate: number;
  flowRevenue: number;
  flowDelivered: number;
  flowOpens: number;
  flowClicks: number;
  totalEmailRevenue: number;
}

const fmt$ = (n: number) => "$" + n.toLocaleString("en-US", { maximumFractionDigits: 0 });
const fmtN = (n: number) => n.toLocaleString("en-US");
const fmtPct = (n: number) => (n * 100).toFixed(1) + "%";

export default function EmailOverviewPage() {
  const [timeframe, setTimeframe] = useState("last_30_days");
  const [data, setData] = useState<{ totalProfiles: number | null; lists: { id: string; name: string }[]; stats: Stats } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/klaviyo/overview?timeframe=${timeframe}`)
      .then(r => r.json())
      .then(d => { if (d.error) setError(d.error); else setData(d); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [timeframe]);

  const s = data?.stats;
  const tfLabel = TIMEFRAMES.find(t => t.key === timeframe)?.label ?? timeframe;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Email Marketing</h1>
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
          <Link href="/dashboard/email/campaigns" className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg transition-colors">
            Campaigns →
          </Link>
          <Link href="/dashboard/email/flows" className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm rounded-lg transition-colors">
            Flows →
          </Link>
        </div>
      </div>

      {error && <div className="bg-red-900/20 border border-red-700/30 rounded-xl p-4 text-red-400 text-sm">{error}</div>}

      {loading && (
        <div className="space-y-6">
          <KPISkeleton count={4} />
          <KPISkeleton count={4} />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-3">
              {[1,2,3].map(i => <SkeletonBar key={i} className="h-6 w-full" />)}
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-3">
              {[1,2,3,4].map(i => <SkeletonBar key={i} className="h-4 w-full" />)}
            </div>
          </div>
        </div>
      )}

      {!loading && !error && s && (
        <>
          {/* Revenue KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-gray-900 border border-green-800/40 rounded-xl p-5">
              <div className="text-xs text-green-400 uppercase tracking-wide mb-1">Total Email Revenue</div>
              <div className="text-2xl font-bold text-white">{fmt$(s.totalEmailRevenue)}</div>
              <div className="text-xs text-gray-500 mt-1">Campaigns + Flows</div>
            </div>
            <div className="bg-gray-900 border border-blue-800/40 rounded-xl p-5">
              <div className="text-xs text-blue-400 uppercase tracking-wide mb-1">Campaign Revenue</div>
              <div className="text-2xl font-bold text-white">{fmt$(s.campaignRevenue)}</div>
              <div className="text-xs text-gray-500 mt-1">{s.totalEmailRevenue > 0 ? ((s.campaignRevenue / s.totalEmailRevenue) * 100).toFixed(0) + "% of email total" : "—"}</div>
            </div>
            <div className="bg-gray-900 border border-purple-800/40 rounded-xl p-5">
              <div className="text-xs text-purple-400 uppercase tracking-wide mb-1">Flow Revenue</div>
              <div className="text-2xl font-bold text-white">{fmt$(s.flowRevenue)}</div>
              <div className="text-xs text-gray-500 mt-1">{s.totalEmailRevenue > 0 ? ((s.flowRevenue / s.totalEmailRevenue) * 100).toFixed(0) + "% of email total" : "—"}</div>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Total Subscribers</div>
              <div className="text-2xl font-bold text-white">{data?.totalProfiles != null ? fmtN(data.totalProfiles) : "—"}</div>
              <div className="text-xs text-gray-500 mt-1">All Klaviyo profiles</div>
            </div>
          </div>

          {/* Engagement KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Avg Open Rate</div>
              <div className={`text-2xl font-bold ${s.avgOpenRate >= 0.30 ? "text-green-400" : s.avgOpenRate >= 0.20 ? "text-yellow-400" : "text-red-400"}`}>
                {fmtPct(s.avgOpenRate)}
              </div>
              <div className="text-xs text-gray-500 mt-1">{fmtN(s.campaignOpens)} opens · {fmtN(s.campaignDelivered)} delivered</div>
              <div className="text-xs text-gray-600 mt-0.5">Weighted avg</div>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Avg Click Rate</div>
              <div className={`text-2xl font-bold ${s.avgClickRate >= 0.03 ? "text-green-400" : s.avgClickRate >= 0.01 ? "text-yellow-400" : "text-red-400"}`}>
                {fmtPct(s.avgClickRate)}
              </div>
              <div className="text-xs text-gray-500 mt-1">{fmtN(s.campaignClicks)} clicks</div>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Bounce Rate</div>
              <div className={`text-2xl font-bold ${s.avgBounceRate <= 0.01 ? "text-green-400" : s.avgBounceRate <= 0.02 ? "text-yellow-400" : "text-red-400"}`}>
                {fmtPct(s.avgBounceRate)}
              </div>
              <div className="text-xs text-gray-500 mt-1">{fmtN(s.campaignBounced)} bounces</div>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Unsubscribe Rate</div>
              <div className={`text-2xl font-bold ${s.avgUnsubRate <= 0.002 ? "text-green-400" : s.avgUnsubRate <= 0.005 ? "text-yellow-400" : "text-red-400"}`}>
                {fmtPct(s.avgUnsubRate)}
              </div>
              <div className="text-xs text-gray-500 mt-1">{fmtN(s.campaignUnsubscribed)} unsubs</div>
            </div>
          </div>

          {/* Revenue split + Lists */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <h2 className="text-sm font-semibold text-white mb-4">Revenue Split</h2>
              <div className="space-y-4">
                {[
                  { label: "Campaigns", value: s.campaignRevenue, color: "bg-blue-500", delivered: s.campaignDelivered, opens: s.campaignOpens },
                  { label: "Flows / Automations", value: s.flowRevenue, color: "bg-purple-500", delivered: s.flowDelivered, opens: s.flowOpens },
                ].map(item => {
                  const pct = s.totalEmailRevenue > 0 ? (item.value / s.totalEmailRevenue) * 100 : 0;
                  return (
                    <div key={item.label}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-gray-300">{item.label}</span>
                        <span className="text-white font-medium">{fmt$(item.value)} <span className="text-gray-500">({pct.toFixed(0)}%)</span></span>
                      </div>
                      <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                        <div className={`h-full ${item.color} rounded-full`} style={{ width: `${pct}%` }} />
                      </div>
                      <div className="text-xs text-gray-600 mt-1">{fmtN(item.delivered)} delivered · {fmtN(item.opens)} opens</div>
                    </div>
                  );
                })}
                <div className="pt-3 border-t border-gray-800 flex justify-between text-sm">
                  <span className="text-gray-400">Total email-attributed</span>
                  <span className="text-white font-semibold">{fmt$(s.totalEmailRevenue)}</span>
                </div>
              </div>
            </div>

            {/* Lists */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <h2 className="text-sm font-semibold text-white mb-4">Lists ({data?.lists.length ?? 0})</h2>
              {(data?.lists.length ?? 0) === 0 ? (
                <p className="text-gray-500 text-sm">No lists found.</p>
              ) : (
                <div className="space-y-1.5">
                  {data!.lists.slice(0, 10).map(list => (
                    <div key={list.id} className="flex items-center gap-2 py-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-500 flex-shrink-0" />
                      <span className="text-gray-300 text-sm">{list.name}</span>
                    </div>
                  ))}
                  {(data?.lists.length ?? 0) > 10 && (
                    <div className="text-xs text-gray-600 mt-2">+{data!.lists.length - 10} more lists</div>
                  )}
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
              <p className="text-gray-400 text-sm">Open rates, click rates, bounces, unsubscribes, and revenue per campaign.</p>
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
