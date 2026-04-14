"use client";

import { useEffect, useState, useMemo } from "react";
import DateRangeDropdown from "@/components/DateRangeDropdown";
import { RangeKey, getRange } from "@/lib/date-ranges";
import Link from "next/link";

const fmt = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

const PLATFORMS = [
  { key: "google",     label: "Google Ads",       color: "bg-blue-500",   href: "/dashboard/google-ads" },
  { key: "bing",       label: "Bing / Microsoft",  color: "bg-teal-500",   href: "/dashboard/bing" },
  { key: "meta",       label: "Meta",              color: "bg-indigo-500", href: "/dashboard/meta" },
  { key: "amazon",     label: "Amazon Ads",        color: "bg-orange-500", href: "/dashboard/amazon-ads" },
  { key: "connexity",  label: "Connexity",         color: "bg-purple-500", href: "/dashboard/connexity" },
  { key: "pinterest",  label: "Pinterest",         color: "bg-pink-500",   href: "/dashboard/pinterest" },
] as const;

type PlatformKey = typeof PLATFORMS[number]["key"];

interface MonthRow {
  month: string;
  google: number;
  bing: number;
  meta: number;
  amazon: number;
  connexity: number;
  pinterest: number;
  total: number;
  googleRevenue: number;
  bingRevenue: number;
  metaRevenue: number;
  amazonRevenue: number;
  connexityRevenue: number;
  pinterestRevenue: number;
  totalRevenue: number;
}

interface GoogleCampaignMonth { month: string; totalSpend: number; totalConvValue: number }

export default function AdSpendPage() {
  const [rangeKey, setRangeKey] = useState<RangeKey>("ytd");

  // Raw data from each platform — fetched once, filtered client-side
  const [googleRaw, setGoogleRaw] = useState<GoogleCampaignMonth[]>([]);
  const [bingRaw, setBingRaw] = useState<{ month: string; cost: number }[]>([]);
  const [metaRaw, setMetaRaw] = useState<{ month: string; cost: number }[]>([]);
  const [amazonRaw, setAmazonRaw] = useState<{ month: string; cost: number }[]>([]);
  const [connexityRaw, setConnexityRaw] = useState<{ month: string; cost: number }[]>([]);
  const [pinterestRaw, setPinterestRaw] = useState<{ month: string; cost: number }[]>([]);
  const [errors, setErrors] = useState<Partial<Record<PlatformKey, string>>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const year = new Date().getFullYear();
    const prevYear = year - 1;

    // Fetch both years for Google so date range filtering works fully
    const errs: Partial<Record<PlatformKey, string>> = {};

    Promise.allSettled([
      Promise.all([
        fetch(`/api/google-ads/campaigns?start=${prevYear}-01-01&end=${year}-12-31`).then(r => r.json()),
      ]).then(([d]) => {
        if (d.error) throw new Error(d.error);
        setGoogleRaw(Array.isArray(d) ? d : []);
      }),
      fetch("/api/sheets/bing").then(r => r.json()).then(d => {
        if (d.error) throw new Error(d.error);
        setBingRaw(d.rows ?? []);
      }),
      fetch("/api/sheets/meta").then(r => r.json()).then(d => {
        if (d.error) throw new Error(d.error);
        setMetaRaw(d.rows ?? []);
      }),
      fetch("/api/sheets/amazon-ads").then(r => r.json()).then(d => {
        if (d.error) throw new Error(d.error);
        setAmazonRaw(d.rows ?? []);
      }),
      fetch("/api/sheets/connexity").then(r => r.json()).then(d => {
        if (d.error) throw new Error(d.error);
        setConnexityRaw(d.rows ?? []);
      }),
      fetch("/api/sheets/pinterest").then(r => r.json()).then(d => {
        if (d.error) throw new Error(d.error);
        setPinterestRaw(d.rows ?? []);
      }),
    ]).then(results => {
      const keys: PlatformKey[] = ["google", "bing", "meta", "amazon", "connexity", "pinterest"];
      results.forEach((res, i) => {
        if (res.status === "rejected") errs[keys[i]] = res.reason?.message ?? "Failed";
      });
      setErrors(errs);
      setLoading(false);
    });
  }, []);

  const range = getRange(rangeKey);

  // Aggregate all platforms into monthly rows, filtered by range
  const monthlyData = useMemo((): MonthRow[] => {
    const map: Record<string, MonthRow> = {};

    function ensure(month: string) {
      if (!map[month]) {
        map[month] = { month, google: 0, bing: 0, meta: 0, amazon: 0, connexity: 0, pinterest: 0, total: 0, googleRevenue: 0, bingRevenue: 0, metaRevenue: 0, amazonRevenue: 0, connexityRevenue: 0, pinterestRevenue: 0, totalRevenue: 0 };
      }
    }
    function inRange(month: string) {
      return month >= range.startYM && month <= range.endYM;
    }

    for (const m of googleRaw) {
      if (!inRange(m.month)) continue;
      ensure(m.month);
      map[m.month].google += m.totalSpend;
      map[m.month].googleRevenue += m.totalConvValue;
      map[m.month].total += m.totalSpend;
      map[m.month].totalRevenue += m.totalConvValue;
    }
    for (const r of bingRaw) {
      if (!inRange(r.month)) continue;
      ensure(r.month);
      map[r.month].bing += r.cost;
      map[r.month].total += r.cost;
    }
    for (const r of metaRaw) {
      if (!inRange(r.month)) continue;
      ensure(r.month);
      map[r.month].meta += r.cost;
      map[r.month].total += r.cost;
    }
    for (const r of amazonRaw) {
      if (!inRange(r.month)) continue;
      ensure(r.month);
      map[r.month].amazon += r.cost;
      map[r.month].total += r.cost;
    }
    for (const r of connexityRaw) {
      if (!inRange(r.month)) continue;
      ensure(r.month);
      map[r.month].connexity += r.cost;
      map[r.month].total += r.cost;
    }
    for (const r of pinterestRaw) {
      if (!inRange(r.month)) continue;
      ensure(r.month);
      map[r.month].pinterest += r.cost;
      map[r.month].total += r.cost;
    }

    return Object.values(map).sort((a, b) => b.month.localeCompare(a.month));
  }, [googleRaw, bingRaw, metaRaw, amazonRaw, connexityRaw, pinterestRaw, range.startYM, range.endYM]);

  // Summary totals
  const totalSpend = monthlyData.reduce((s, m) => s + m.total, 0);
  const totalRevenue = monthlyData.reduce((s, m) => s + m.totalRevenue, 0);
  const blendedRoas = totalSpend > 0 ? totalRevenue / totalSpend : 0;

  // Platform totals for the bar chart
  const revenueKey: Record<PlatformKey, keyof MonthRow> = {
    google: "googleRevenue", bing: "bingRevenue", meta: "metaRevenue",
    amazon: "amazonRevenue", connexity: "connexityRevenue", pinterest: "pinterestRevenue",
  };
  const platformTotals = PLATFORMS.map(p => ({
    ...p,
    spend: monthlyData.reduce((s, m) => s + m[p.key], 0),
    revenue: monthlyData.reduce((s, m) => s + (m[revenueKey[p.key]] as number), 0),
    hasError: !!errors[p.key],
  })).sort((a, b) => b.spend - a.spend);

  const topSpend = platformTotals[0]?.spend ?? 1;

  const roasColor = (r: number) => r >= 5 ? "text-green-400" : r >= 3 ? "text-yellow-400" : r > 0 ? "text-red-400" : "text-gray-600";

  return (
    <div className="p-8">
      <div className="mb-6 flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">All Ad Spend</h1>
          <p className="text-gray-400 mt-1">Aggregated from all platform sources — Google Ads API + manual sheets</p>
        </div>
        <DateRangeDropdown value={rangeKey} onChange={setRangeKey} />
      </div>

      {Object.keys(errors).length > 0 && (
        <div className="bg-yellow-900/20 border border-yellow-700/30 rounded-lg p-4 mb-6 text-sm text-yellow-400">
          Data missing from: {Object.keys(errors).join(", ")} — check sheet entries
        </div>
      )}

      {loading && <div className="text-gray-400 mb-8">Loading...</div>}

      {!loading && (
        <>
          {/* KPI cards */}
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Total Ad Spend</div>
              <div className="text-2xl font-bold text-white">{fmt(totalSpend)}</div>
              <div className="text-xs text-gray-500 mt-1">{range.label} · {platformTotals.filter(p => p.spend > 0).length} platforms</div>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Attributed Revenue</div>
              <div className="text-2xl font-bold text-white">{fmt(totalRevenue)}</div>
              <div className="text-xs text-gray-500 mt-1">platform-reported conv value</div>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Blended ROAS</div>
              <div className={`text-2xl font-bold mt-1 ${roasColor(blendedRoas)}`}>
                {blendedRoas > 0 ? `${blendedRoas.toFixed(2)}x` : "—"}
              </div>
              <div className="text-xs text-gray-500 mt-1">attributed rev ÷ spend</div>
            </div>
          </div>

          {/* Platform spend bars */}
          <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 mb-6">
            <h2 className="text-sm font-semibold text-white mb-5">Spend by Platform — {range.label}</h2>
            <div className="space-y-4">
              {platformTotals.map(p => {
                const pct = totalSpend > 0 ? (p.spend / totalSpend) * 100 : 0;
                const pRoas = p.spend > 0 ? p.revenue / p.spend : 0;
                return (
                  <Link key={p.key} href={p.href} className="flex items-center gap-4 group">
                    <div className="w-36 text-sm text-gray-400 group-hover:text-gray-200 flex items-center gap-2 flex-shrink-0">
                      <span className={`w-2 h-2 rounded-full ${p.color}`} />
                      {p.label}
                      {p.hasError && <span className="text-xs text-red-400">err</span>}
                    </div>
                    <div className="flex-1 bg-gray-800 rounded-full h-2">
                      <div
                        className={`${p.color} rounded-full h-2 transition-all`}
                        style={{ width: `${topSpend > 0 ? (p.spend / topSpend) * 100 : 0}%` }}
                      />
                    </div>
                    <div className="w-24 text-right text-sm font-medium text-white">{fmt(p.spend)}</div>
                    <div className="w-10 text-right text-xs text-gray-500">{pct.toFixed(1)}%</div>
                    <div className={`w-16 text-right text-xs font-semibold ${roasColor(pRoas)}`}>
                      {pRoas > 0 ? `${pRoas.toFixed(2)}x` : "—"}
                    </div>
                  </Link>
                );
              })}
            </div>
            <div className="mt-5 pt-4 border-t border-gray-800 flex justify-between text-sm font-semibold text-white">
              <span className="text-gray-400">Total</span>
              <span>{fmt(totalSpend)}</span>
            </div>
          </div>

          {/* Monthly breakdown table */}
          {monthlyData.length > 0 && (
            <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-800">
                <h2 className="text-sm font-semibold text-white">Monthly Breakdown</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-gray-500 text-xs uppercase tracking-wider bg-gray-800/50 border-b border-gray-800">
                      <th className="py-3 px-4 text-left">Month</th>
                      <th className="py-3 px-4 text-right text-blue-400">Google</th>
                      <th className="py-3 px-4 text-right text-teal-400">Bing</th>
                      <th className="py-3 px-4 text-right text-indigo-400">Meta</th>
                      <th className="py-3 px-4 text-right text-orange-400">Amazon</th>
                      <th className="py-3 px-4 text-right text-purple-400">Connexity</th>
                      <th className="py-3 px-4 text-right text-pink-400">Pinterest</th>
                      <th className="py-3 px-4 text-right font-semibold text-white">Total</th>
                      <th className="py-3 px-4 text-right text-green-400">Conv Value</th>
                      <th className="py-3 px-4 text-right">ROAS</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800">
                    {monthlyData.map(m => {
                      const mRoas = m.total > 0 ? m.totalRevenue / m.total : 0;
                      return (
                        <tr key={m.month} className="text-gray-300 hover:bg-gray-800/40">
                          <td className="py-2.5 px-4 font-medium text-white">{m.month}</td>
                          <td className="py-2.5 px-4 text-right">{m.google > 0 ? fmt(m.google) : <span className="text-gray-700">—</span>}</td>
                          <td className="py-2.5 px-4 text-right">{m.bing > 0 ? fmt(m.bing) : <span className="text-gray-700">—</span>}</td>
                          <td className="py-2.5 px-4 text-right">{m.meta > 0 ? fmt(m.meta) : <span className="text-gray-700">—</span>}</td>
                          <td className="py-2.5 px-4 text-right">{m.amazon > 0 ? fmt(m.amazon) : <span className="text-gray-700">—</span>}</td>
                          <td className="py-2.5 px-4 text-right">{m.connexity > 0 ? fmt(m.connexity) : <span className="text-gray-700">—</span>}</td>
                          <td className="py-2.5 px-4 text-right">{m.pinterest > 0 ? fmt(m.pinterest) : <span className="text-gray-700">—</span>}</td>
                          <td className="py-2.5 px-4 text-right font-semibold text-white">{fmt(m.total)}</td>
                          <td className="py-2.5 px-4 text-right text-green-400">{m.totalRevenue > 0 ? fmt(m.totalRevenue) : <span className="text-gray-700">—</span>}</td>
                          <td className={`py-2.5 px-4 text-right font-semibold ${roasColor(mRoas)}`}>
                            {mRoas > 0 ? `${mRoas.toFixed(2)}x` : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-gray-800/50 border-t border-gray-700 font-semibold text-white text-xs">
                      <td className="py-3 px-4">Total</td>
                      <td className="py-3 px-4 text-right">{fmt(monthlyData.reduce((s, m) => s + m.google, 0))}</td>
                      <td className="py-3 px-4 text-right">{fmt(monthlyData.reduce((s, m) => s + m.bing, 0))}</td>
                      <td className="py-3 px-4 text-right">{fmt(monthlyData.reduce((s, m) => s + m.meta, 0))}</td>
                      <td className="py-3 px-4 text-right">{fmt(monthlyData.reduce((s, m) => s + m.amazon, 0))}</td>
                      <td className="py-3 px-4 text-right">{fmt(monthlyData.reduce((s, m) => s + m.connexity, 0))}</td>
                      <td className="py-3 px-4 text-right">{fmt(monthlyData.reduce((s, m) => s + m.pinterest, 0))}</td>
                      <td className="py-3 px-4 text-right">{fmt(totalSpend)}</td>
                      <td className="py-3 px-4 text-right text-green-400">{fmt(totalRevenue)}</td>
                      <td className={`py-3 px-4 text-right ${roasColor(blendedRoas)}`}>{blendedRoas > 0 ? `${blendedRoas.toFixed(2)}x` : "—"}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          {!loading && monthlyData.length === 0 && (
            <div className="text-gray-500 text-sm text-center py-12">No spend data for this period.</div>
          )}
        </>
      )}
    </div>
  );
}
