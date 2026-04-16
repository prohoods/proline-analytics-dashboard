"use client";

import { useEffect, useState, useMemo } from "react";
import DateRangeDropdown from "@/components/DateRangeDropdown";
import { RangeKey, getRange } from "@/lib/date-ranges";
import { KPISkeleton, TableSkeleton } from "@/components/Skeleton";

// ── Types ────────────────────────────────────────────────────────────────────
interface AcqSummary {
  totalOrders: number;
  newCustomers: number;
  repeatCustomers: number;
  guestOrders: number;
  repeatRate: number;
  newRevenue: number;
  repeatRevenue: number;
  guestRevenue: number;
  gclidNewCount: number;
  gclidNewRevenue: number;
  aovNew: number;
  aovRepeat: number;
  aovGuest: number;
  aovAll: number;
}
interface MonthBucket {
  month: string;
  newCustomers: number;
  repeatCustomers: number;
  guestOrders: number;
  newRevenue: number;
  repeatRevenue: number;
  guestRevenue: number;
  gclidNew: number;
  gclidRevenue: number;
  aov: number;
}
interface GeoRow { state: string; code: string; orders: number; revenue: number; newCustomers: number; repeatCustomers: number; }
interface TierRow { label: string; min: number; max: number; count: number; revenue: number; }
interface ChannelRow { source: string; orders: number; revenue: number; newCustomers: number; }
interface CohortRow { cohortMonth: string; size: number; retention: (number | null)[]; }
interface WinbackRow { label: string; count: number; totalRevenue: number; }
interface GoogleMonth { month: string; totalSpend: number; }

// ── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
const pct = (n: number, dec = 1) => `${(n * 100).toFixed(dec)}%`;
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
function fmtMonth(ym: string) {
  const [y, m] = ym.split("-");
  return `${MONTHS[parseInt(m) - 1]} ${y}`;
}
function retentionColor(rate: number): string {
  if (rate >= 0.15) return "bg-emerald-500/80 text-white";
  if (rate >= 0.08) return "bg-emerald-700/60 text-emerald-200";
  if (rate >= 0.03) return "bg-blue-800/60 text-blue-200";
  if (rate > 0)     return "bg-gray-700 text-gray-300";
  return "bg-gray-900 text-gray-600";
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function AcquisitionPage() {
  const [rangeKey, setRangeKey] = useState<RangeKey>("30d");
  const [acqData, setAcqData] = useState<{
    summary: AcqSummary;
    monthly: MonthBucket[];
    geographic: GeoRow[];
    valueTiers: TierRow[];
    channels: ChannelRow[];
  } | null>(null);
  const [cohortData, setCohortData] = useState<{
    cohorts: CohortRow[];
    winback: WinbackRow[];
    timeToSecond: { avg: number | null; median: number | null; count: number };
  } | null>(null);
  const [googleMonths, setGoogleMonths] = useState<GoogleMonth[]>([]);
  const [loading, setLoading] = useState(true);
  const [cohortLoading, setCohortLoading] = useState(true);
  const [error, setError] = useState("");

  // Fetch acquisition data (re-runs on range change)
  useEffect(() => {
    const range = getRange(rangeKey);
    setLoading(true);
    setError("");
    Promise.allSettled([
      fetch(`/api/shopify/customer-acquisition?start=${range.start}&end=${range.end}`).then(r => r.json()),
      fetch(`/api/google-ads/campaigns?start=${range.start}&end=${range.end}`).then(r => r.json()),
    ]).then(([acqRes, googleRes]) => {
      if (acqRes.status === "fulfilled" && !acqRes.value.error) setAcqData(acqRes.value);
      else if (acqRes.status === "fulfilled") setError(acqRes.value.error);
      if (googleRes.status === "fulfilled" && Array.isArray(googleRes.value)) setGoogleMonths(googleRes.value);
      setLoading(false);
    });
  }, [rangeKey]);

  // Cohort data fetched once (covers 15 months regardless of range)
  useEffect(() => {
    setCohortLoading(true);
    fetch("/api/shopify/customer-cohort")
      .then(r => r.json())
      .then(d => { if (!d.error) setCohortData(d); })
      .finally(() => setCohortLoading(false));
  }, []);

  const range = getRange(rangeKey);
  const s = acqData?.summary;
  const totalRevenue = s ? s.newRevenue + s.repeatRevenue + s.guestRevenue : 0;

  const googleSpend = useMemo(() =>
    googleMonths.filter(m => m.month >= range.startYM && m.month <= range.endYM)
      .reduce((sum, m) => sum + m.totalSpend, 0),
  [googleMonths, range.startYM, range.endYM]);

  const googleSpendByMonth: Record<string, number> = {};
  for (const m of googleMonths) googleSpendByMonth[m.month] = (googleSpendByMonth[m.month] ?? 0) + m.totalSpend;

  const cpa = s && s.gclidNewCount > 0 && googleSpend > 0 ? googleSpend / s.gclidNewCount : null;

  // Max revenue for geographic bar scaling
  const maxGeoRev = useMemo(() =>
    Math.max(...(acqData?.geographic ?? []).map(g => g.revenue), 1),
  [acqData]);

  // Max orders for channel bar scaling
  const maxChannelOrders = useMemo(() =>
    Math.max(...(acqData?.channels ?? []).map(c => c.orders), 1),
  [acqData]);

  // Total orders for tier percentages
  const totalTierCount = useMemo(() =>
    (acqData?.valueTiers ?? []).reduce((s, t) => s + t.count, 0),
  [acqData]);

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Customer Acquisition & Retention</h1>
          <p className="text-gray-400 mt-1">New vs repeat · channels · geography · cohorts · win-back</p>
          <div className="mt-2 flex items-center gap-2">
            <div className="inline-flex items-center gap-2 bg-green-900/20 border border-green-700/30 rounded-lg px-3 py-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
              <span className="text-green-400 text-xs font-medium">Shopify Live</span>
            </div>
            {!cohortLoading && cohortData && (
              <div className="inline-flex items-center gap-2 bg-blue-900/20 border border-blue-700/30 rounded-lg px-3 py-1.5">
                <span className="text-blue-400 text-xs font-medium">15-month cohort history loaded</span>
              </div>
            )}
          </div>
        </div>
        <DateRangeDropdown value={rangeKey} onChange={setRangeKey} />
      </div>

      {error && <div className="text-red-400 bg-red-900/20 rounded-lg p-4 text-sm">{error}</div>}
      {loading && (
        <div className="space-y-6">
          <KPISkeleton count={8} />
          <TableSkeleton rows={6} cols={10} />
        </div>
      )}

      {!loading && s && (
        <>
          {/* ── KPI Cards ── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-gray-900 border border-emerald-800/40 rounded-xl p-5">
              <div className="text-xs text-emerald-400 uppercase tracking-wider mb-1">New Customers</div>
              <div className="text-2xl font-bold text-white">{s.newCustomers.toLocaleString()}</div>
              <div className="text-xs text-gray-500 mt-1">{fmt(s.newRevenue)} revenue</div>
              <div className="text-xs text-emerald-400 mt-0.5">AOV {fmt(s.aovNew)}</div>
            </div>
            <div className="bg-gray-900 border border-blue-800/40 rounded-xl p-5">
              <div className="text-xs text-blue-400 uppercase tracking-wider mb-1">Repeat Customers</div>
              <div className="text-2xl font-bold text-white">{s.repeatCustomers.toLocaleString()}</div>
              <div className="text-xs text-gray-500 mt-1">{fmt(s.repeatRevenue)} revenue</div>
              <div className="text-xs text-blue-400 mt-0.5">AOV {fmt(s.aovRepeat)}</div>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Repeat Rate</div>
              <div className="text-2xl font-bold text-white">{pct(s.repeatRate)}</div>
              <div className="text-xs text-gray-500 mt-1">of customers with accounts</div>
              <div className="text-xs text-gray-400 mt-0.5">incl. Proline Pro B2B</div>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Avg Order Value</div>
              <div className="text-2xl font-bold text-white">{fmt(s.aovAll)}</div>
              <div className="text-xs text-gray-500 mt-1">all {s.totalOrders.toLocaleString()} orders</div>
              <div className="text-xs text-gray-400 mt-0.5">Guest AOV {fmt(s.aovGuest)}</div>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">New via Google (GCLID)</div>
              <div className="text-2xl font-bold text-white">{s.gclidNewCount}</div>
              <div className="text-xs text-gray-500 mt-1">{s.newCustomers > 0 ? `${((s.gclidNewCount / s.newCustomers) * 100).toFixed(1)}% of new` : "—"}</div>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Google CPA</div>
              <div className="text-2xl font-bold text-white">{cpa ? fmt(cpa) : "—"}</div>
              <div className="text-xs text-gray-500 mt-1">Google spend ÷ GCLID new customers</div>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Google Ad Spend</div>
              <div className="text-2xl font-bold text-white">{googleSpend > 0 ? fmt(googleSpend) : "—"}</div>
              <div className="text-xs text-gray-500 mt-1">{range.label}</div>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">GCLID New Revenue</div>
              <div className="text-2xl font-bold text-emerald-400">{fmt(s.gclidNewRevenue)}</div>
              <div className="text-xs text-gray-500 mt-1">from Google-acquired new customers</div>
            </div>
          </div>

          {/* ── Revenue mix bar ── */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
            <h2 className="text-sm font-semibold text-white mb-4">Revenue Mix — New vs Repeat vs Guest</h2>
            {totalRevenue > 0 && (
              <>
                <div className="flex h-3 rounded-full overflow-hidden mb-4 bg-gray-800">
                  <div className="bg-emerald-500" style={{ width: `${(s.newRevenue / totalRevenue) * 100}%` }} />
                  <div className="bg-blue-500" style={{ width: `${(s.repeatRevenue / totalRevenue) * 100}%` }} />
                  <div className="bg-gray-600" style={{ width: `${(s.guestRevenue / totalRevenue) * 100}%` }} />
                </div>
                <div className="flex flex-wrap gap-6 text-sm">
                  {[
                    { label: "New Customers", value: s.newRevenue, color: "bg-emerald-500" },
                    { label: "Repeat Customers", value: s.repeatRevenue, color: "bg-blue-500" },
                    { label: "Guest Checkout", value: s.guestRevenue, color: "bg-gray-600" },
                  ].map(item => (
                    <div key={item.label} className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${item.color}`} />
                      <span className="text-gray-400">{item.label}</span>
                      <span className="font-medium text-white">{fmt(item.value)}</span>
                      <span className="text-gray-500">{pct(totalRevenue > 0 ? item.value / totalRevenue : 0)}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* ── Channels + Value Tiers (side by side) ── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Channel attribution */}
            {acqData.channels.length > 0 && (
              <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-800">
                  <h2 className="text-sm font-semibold text-white">Acquisition Channels</h2>
                  <p className="text-xs text-gray-500 mt-0.5">Orders by traffic source</p>
                </div>
                <div className="p-4 space-y-3">
                  {acqData.channels.slice(0, 8).map(ch => (
                    <div key={ch.source}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm text-gray-300">{ch.source}</span>
                        <div className="flex items-center gap-4 text-xs text-gray-500">
                          <span>{ch.orders} orders</span>
                          <span className="text-white font-medium">{fmt(ch.revenue)}</span>
                        </div>
                      </div>
                      <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-500 rounded-full"
                          style={{ width: `${(ch.orders / maxChannelOrders) * 100}%` }}
                        />
                      </div>
                      <div className="text-xs text-gray-600 mt-0.5">{ch.newCustomers} new customers · AOV {ch.orders > 0 ? fmt(ch.revenue / ch.orders) : "—"}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Value tiers */}
            {acqData.valueTiers.length > 0 && (
              <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-800">
                  <h2 className="text-sm font-semibold text-white">Order Value Tiers</h2>
                  <p className="text-xs text-gray-500 mt-0.5">How customers distribute across price points</p>
                </div>
                <div className="p-4 space-y-4">
                  {acqData.valueTiers.map(tier => {
                    const share = totalTierCount > 0 ? tier.count / totalTierCount : 0;
                    const colors = ["bg-purple-500", "bg-blue-500", "bg-emerald-500", "bg-orange-500"];
                    const idx = acqData.valueTiers.indexOf(tier);
                    return (
                      <div key={tier.label}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm text-gray-300">{tier.label}</span>
                          <div className="flex items-center gap-3 text-xs">
                            <span className="text-gray-500">{tier.count} orders · {pct(share)}</span>
                            <span className="text-white font-medium">{fmt(tier.revenue)}</span>
                          </div>
                        </div>
                        <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                          <div className={`h-full ${colors[idx]} rounded-full`} style={{ width: `${share * 100}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* ── Geographic Breakdown ── */}
          {acqData.geographic.length > 0 && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-white">Geographic Breakdown</h2>
                  <p className="text-xs text-gray-500 mt-0.5">Top states by revenue (billing address)</p>
                </div>
                <span className="text-xs text-gray-500">{acqData.geographic.length} states</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 z-10">
                    <tr className="text-gray-500 text-xs uppercase tracking-wider bg-gray-800 border-b border-gray-800">
                      <th className="py-3 px-4 text-left">State</th>
                      <th className="py-3 px-4 text-right">Orders</th>
                      <th className="py-3 px-4 text-right text-emerald-400">New</th>
                      <th className="py-3 px-4 text-right text-blue-400">Repeat</th>
                      <th className="py-3 px-4 text-right">Revenue</th>
                      <th className="py-3 px-4 text-right">AOV</th>
                      <th className="py-3 px-4 text-left">Share</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800">
                    {acqData.geographic.map(geo => (
                      <tr key={geo.code} className="text-gray-300 hover:bg-gray-800/40">
                        <td className="py-2.5 px-4 font-medium text-white">{geo.state} <span className="text-gray-600 text-xs ml-1">{geo.code}</span></td>
                        <td className="py-2.5 px-4 text-right">{geo.orders}</td>
                        <td className="py-2.5 px-4 text-right text-emerald-400">{geo.newCustomers}</td>
                        <td className="py-2.5 px-4 text-right text-blue-400">{geo.repeatCustomers > 0 ? geo.repeatCustomers : <span className="text-gray-600">—</span>}</td>
                        <td className="py-2.5 px-4 text-right font-semibold">{fmt(geo.revenue)}</td>
                        <td className="py-2.5 px-4 text-right text-gray-400">{geo.orders > 0 ? fmt(geo.revenue / geo.orders) : "—"}</td>
                        <td className="py-2.5 px-4">
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden w-20">
                              <div className="h-full bg-blue-500 rounded-full" style={{ width: `${(geo.revenue / maxGeoRev) * 100}%` }} />
                            </div>
                            <span className="text-xs text-gray-500">{pct(geo.revenue / totalRevenue)}</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── Monthly Breakdown ── */}
          {acqData.monthly.length > 0 && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-800">
                <h2 className="text-sm font-semibold text-white">Monthly Breakdown</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 z-10">
                    <tr className="text-gray-500 text-xs uppercase tracking-wider bg-gray-800 border-b border-gray-800">
                      <th className="py-3 px-4 text-left">Month</th>
                      <th className="py-3 px-4 text-right text-emerald-400">New</th>
                      <th className="py-3 px-4 text-right text-emerald-400">New Rev</th>
                      <th className="py-3 px-4 text-right text-blue-400">Repeat</th>
                      <th className="py-3 px-4 text-right text-blue-400">Repeat Rev</th>
                      <th className="py-3 px-4 text-right">Guest</th>
                      <th className="py-3 px-4 text-right">AOV</th>
                      <th className="py-3 px-4 text-right">GCLID New</th>
                      <th className="py-3 px-4 text-right">Google Spend</th>
                      <th className="py-3 px-4 text-right">CPA</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800">
                    {acqData.monthly.map(m => {
                      const spend = googleSpendByMonth[m.month] ?? 0;
                      const mCpa = m.gclidNew > 0 && spend > 0 ? spend / m.gclidNew : null;
                      return (
                        <tr key={m.month} className="text-gray-300 hover:bg-gray-800/40">
                          <td className="py-2.5 px-4 font-medium text-white">{fmtMonth(m.month)}</td>
                          <td className="py-2.5 px-4 text-right text-emerald-400 font-semibold">{m.newCustomers}</td>
                          <td className="py-2.5 px-4 text-right text-emerald-400">{fmt(m.newRevenue)}</td>
                          <td className="py-2.5 px-4 text-right text-blue-400 font-semibold">{m.repeatCustomers > 0 ? m.repeatCustomers : <span className="text-gray-600">—</span>}</td>
                          <td className="py-2.5 px-4 text-right text-blue-400">{m.repeatRevenue > 0 ? fmt(m.repeatRevenue) : <span className="text-gray-600">—</span>}</td>
                          <td className="py-2.5 px-4 text-right text-gray-500">{m.guestOrders > 0 ? m.guestOrders : <span className="text-gray-600">—</span>}</td>
                          <td className="py-2.5 px-4 text-right font-semibold text-white">{fmt(m.aov)}</td>
                          <td className="py-2.5 px-4 text-right">{m.gclidNew > 0 ? m.gclidNew : <span className="text-gray-600">—</span>}</td>
                          <td className="py-2.5 px-4 text-right">{spend > 0 ? fmt(spend) : <span className="text-gray-600">—</span>}</td>
                          <td className="py-2.5 px-4 text-right font-semibold">{mCpa ? fmt(mCpa) : <span className="text-gray-600">—</span>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-gray-800/50 border-t border-gray-700 font-semibold text-white text-xs">
                      <td className="py-3 px-4">Total</td>
                      <td className="py-3 px-4 text-right text-emerald-400">{s.newCustomers}</td>
                      <td className="py-3 px-4 text-right text-emerald-400">{fmt(s.newRevenue)}</td>
                      <td className="py-3 px-4 text-right text-blue-400">{s.repeatCustomers}</td>
                      <td className="py-3 px-4 text-right text-blue-400">{fmt(s.repeatRevenue)}</td>
                      <td className="py-3 px-4 text-right text-gray-400">{s.guestOrders}</td>
                      <td className="py-3 px-4 text-right">{fmt(s.aovAll)}</td>
                      <td className="py-3 px-4 text-right">{s.gclidNewCount}</td>
                      <td className="py-3 px-4 text-right">{googleSpend > 0 ? fmt(googleSpend) : "—"}</td>
                      <td className="py-3 px-4 text-right">{cpa ? fmt(cpa) : "—"}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Cohort + Win-back (always shown, uses 15-mo history) ── */}
      {cohortLoading && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center text-gray-500 text-sm">
          Loading 15 months of cohort history…
        </div>
      )}

      {!cohortLoading && cohortData && (
        <>
          {/* Time to second purchase + win-back KPIs */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Time to second purchase */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
              <h2 className="text-sm font-semibold text-white mb-1">Time to Second Purchase</h2>
              <p className="text-xs text-gray-500 mb-4">Among customers who ordered twice or more</p>
              {cohortData.timeToSecond.count > 0 ? (
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <div className="text-xs text-gray-500 mb-1">Avg Days</div>
                    <div className="text-2xl font-bold text-white">{cohortData.timeToSecond.avg ?? "—"}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 mb-1">Median Days</div>
                    <div className="text-2xl font-bold text-white">{cohortData.timeToSecond.median ?? "—"}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 mb-1">Sample Size</div>
                    <div className="text-2xl font-bold text-white">{cohortData.timeToSecond.count}</div>
                    <div className="text-xs text-gray-600">repeat buyers</div>
                  </div>
                </div>
              ) : (
                <div className="text-gray-600 text-sm">No repeat buyers found in the 15-month window.</div>
              )}
            </div>

            {/* Win-back segments */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
              <h2 className="text-sm font-semibold text-white mb-1">Win-back Opportunities</h2>
              <p className="text-xs text-gray-500 mb-4">Customers by days since last order</p>
              <div className="space-y-3">
                {cohortData.winback.map((seg, i) => {
                  const colors = ["text-yellow-400", "text-orange-400", "text-red-400"];
                  const bgColors = ["bg-yellow-500/20 border-yellow-700/30", "bg-orange-500/20 border-orange-700/30", "bg-red-500/20 border-red-700/30"];
                  return (
                    <div key={seg.label} className={`flex items-center justify-between rounded-lg px-4 py-3 border ${bgColors[i]}`}>
                      <div>
                        <div className={`text-sm font-medium ${colors[i]}`}>{seg.label}</div>
                        <div className="text-xs text-gray-500">{seg.count} customers</div>
                      </div>
                      <div className="text-right">
                        <div className="text-white font-semibold">{fmt(seg.totalRevenue)}</div>
                        <div className="text-xs text-gray-500">historical revenue</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Cohort retention heatmap */}
          {cohortData.cohorts.length > 0 && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-800">
                <h2 className="text-sm font-semibold text-white">Cohort Retention</h2>
                <p className="text-xs text-gray-500 mt-0.5">% of first-time buyers who ordered again in each subsequent month</p>
              </div>
              <div className="overflow-x-auto p-4">
                <table className="text-xs w-full">
                  <thead className="sticky top-0 z-10">
                    <tr className="text-gray-500 uppercase tracking-wider">
                      <th className="py-2 px-3 text-left">Cohort</th>
                      <th className="py-2 px-3 text-right">Size</th>
                      <th className="py-2 px-3 text-center w-20">M+0</th>
                      <th className="py-2 px-3 text-center w-20">M+1</th>
                      <th className="py-2 px-3 text-center w-20">M+2</th>
                      <th className="py-2 px-3 text-center w-20">M+3</th>
                      <th className="py-2 px-3 text-center w-20">M+4</th>
                      <th className="py-2 px-3 text-center w-20">M+5</th>
                      <th className="py-2 px-3 text-center w-20">M+6</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800">
                    {cohortData.cohorts.map(row => (
                      <tr key={row.cohortMonth} className="hover:bg-gray-800/30">
                        <td className="py-2 px-3 font-medium text-gray-300 whitespace-nowrap">{fmtMonth(row.cohortMonth)}</td>
                        <td className="py-2 px-3 text-right text-gray-400">{row.size}</td>
                        {Array.from({ length: 7 }, (_, i) => {
                          const val = row.retention[i];
                          if (val === null) return <td key={i} className="py-2 px-3 text-center text-gray-700">—</td>;
                          const rate = i === 0 ? 1 : row.size > 0 ? val / row.size : 0;
                          return (
                            <td key={i} className="py-2 px-3 text-center">
                              <div className={`inline-flex items-center justify-center rounded px-2 py-1 text-xs font-medium min-w-[3rem] ${retentionColor(i === 0 ? 1 : rate)}`}>
                                {i === 0 ? `${row.size}` : val > 0 ? `${pct(rate, 0)} (${val})` : "—"}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="px-6 py-3 border-t border-gray-800 flex items-center gap-4 text-xs text-gray-500">
                <span>Legend:</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-emerald-500/80" /> ≥15%</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-emerald-700/60" /> 8–15%</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-blue-800/60" /> 3–8%</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-gray-700" /> &gt;0%</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-gray-900 border border-gray-700" /> 0% or future</span>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
