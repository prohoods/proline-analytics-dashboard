"use client";

import { useEffect, useState, useMemo } from "react";
import DateRangeDropdown from "@/components/DateRangeDropdown";
import { RangeKey, getRange } from "@/lib/date-ranges";

interface GCLIDSummary {
  totalOrders: number;
  gclidOrders: number;
  attributionRate: number;
  totalRevenue: number;
  gclidRevenue: number;
}

interface DayBucket {
  date: string;
  totalOrders: number;
  gclidOrders: number;
  totalRevenue: number;
  gclidRevenue: number;
}

interface GoogleMonth {
  month: string;
  totalSpend: number;
  totalConvValue: number;
}

const fmt = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

export default function GCLIDPage() {
  const [rangeKey, setRangeKey] = useState<RangeKey>("30d");
  const [gclidData, setGclidData] = useState<{
    summary: GCLIDSummary;
    daily: DayBucket[];
    monthly: DayBucket[];
  } | null>(null);
  const [googleMonths, setGoogleMonths] = useState<GoogleMonth[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const range = getRange(rangeKey);
    setLoading(true);
    setError("");

    Promise.allSettled([
      fetch(`/api/shopify/gclid?start=${range.start}&end=${range.end}`)
        .then(r => r.json()),
      fetch(`/api/google-ads/campaigns?start=${range.start}&end=${range.end}`)
        .then(r => r.json()),
    ]).then(([gclidResult, googleResult]) => {
      if (gclidResult.status === "fulfilled") {
        const d = gclidResult.value;
        if (d.error) setError(d.error);
        else setGclidData(d);
      } else {
        setError("Failed to load Shopify GCLID data");
      }
      if (googleResult.status === "fulfilled" && Array.isArray(googleResult.value)) {
        setGoogleMonths(googleResult.value);
      }
      setLoading(false);
    });
  }, [rangeKey]);

  const range = getRange(rangeKey);

  // Sum Google Ads spend for the selected range
  const googleSpend = useMemo(() => {
    return googleMonths
      .filter(m => m.month >= range.startYM && m.month <= range.endYM)
      .reduce((s, m) => s + m.totalSpend, 0);
  }, [googleMonths, range.startYM, range.endYM]);

  const summary = gclidData?.summary;
  const cpa = summary && summary.gclidOrders > 0 && googleSpend > 0
    ? googleSpend / summary.gclidOrders
    : null;
  const roas = summary && summary.gclidRevenue > 0 && googleSpend > 0
    ? summary.gclidRevenue / googleSpend
    : null;

  // Merge Google spend into monthly rows for the table
  const googleSpendByMonth: Record<string, number> = {};
  for (const m of googleMonths) {
    googleSpendByMonth[m.month] = (googleSpendByMonth[m.month] ?? 0) + m.totalSpend;
  }

  return (
    <div className="p-8">
      <div className="mb-6 flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">GCLID Attribution</h1>
          <p className="text-gray-400 mt-1">Google click attribution — live from Shopify order note_attributes</p>
          <div className="mt-2 flex items-center gap-3">
            <div className="inline-flex items-center gap-2 bg-green-900/20 border border-green-700/30 rounded-lg px-3 py-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
              <span className="text-green-400 text-xs font-medium">Shopify Live</span>
            </div>
            <div className="inline-flex items-center gap-2 bg-blue-900/20 border border-blue-700/30 rounded-lg px-3 py-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
              <span className="text-blue-400 text-xs font-medium">Google Ads Live</span>
            </div>
          </div>
        </div>
        <DateRangeDropdown value={rangeKey} onChange={setRangeKey} />
      </div>

      {error && (
        <div className="text-red-400 bg-red-900/20 rounded-lg p-4 mb-6 text-sm">{error}</div>
      )}

      {loading && <div className="text-gray-400 mb-8">Loading...</div>}

      {!loading && summary && (
        <>
          {/* KPI cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Total Orders</div>
              <div className="text-2xl font-bold text-white">{summary.totalOrders}</div>
              <div className="text-xs text-gray-500 mt-1">{range.label}</div>
            </div>

            <div className="bg-gray-900 border border-blue-800/40 rounded-xl p-5">
              <div className="text-xs text-blue-400 uppercase tracking-wider mb-1">GCLID Orders</div>
              <div className="text-2xl font-bold text-white">{summary.gclidOrders}</div>
              <div className="text-xs text-gray-500 mt-1">
                {pct(summary.attributionRate)} attribution rate
              </div>
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">GCLID Revenue</div>
              <div className="text-2xl font-bold text-white">{fmt(summary.gclidRevenue)}</div>
              <div className="text-xs text-gray-500 mt-1">
                of {fmt(summary.totalRevenue)} total
              </div>
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Google Ad Spend</div>
              <div className="text-2xl font-bold text-white">{googleSpend > 0 ? fmt(googleSpend) : "—"}</div>
              <div className="text-xs text-gray-500 mt-1">from Google Ads API</div>
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Attribution Rate</div>
              <div className="text-2xl font-bold text-blue-400">{pct(summary.attributionRate)}</div>
              <div className="text-xs text-gray-500 mt-1">GCLID orders / total orders</div>
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Cost Per Acquisition</div>
              <div className="text-2xl font-bold text-white">{cpa ? fmt(cpa) : "—"}</div>
              <div className="text-xs text-gray-500 mt-1">Google spend ÷ GCLID orders</div>
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">GCLID ROAS</div>
              <div className={`text-2xl font-bold ${roas && roas >= 3 ? "text-green-400" : roas ? "text-yellow-400" : "text-gray-600"}`}>
                {roas ? `${roas.toFixed(2)}x` : "—"}
              </div>
              <div className="text-xs text-gray-500 mt-1">GCLID revenue ÷ Google spend</div>
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Non-GCLID Revenue</div>
              <div className="text-2xl font-bold text-white">{fmt(summary.totalRevenue - summary.gclidRevenue)}</div>
              <div className="text-xs text-gray-500 mt-1">organic / direct / other</div>
            </div>
          </div>

          {/* Attribution bar */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-6">
            <h2 className="text-sm font-semibold text-white mb-4">Revenue Attribution</h2>
            <div className="flex h-3 rounded-full overflow-hidden mb-3 bg-gray-800">
              <div
                className="bg-blue-500 rounded-l-full"
                style={{ width: `${summary.attributionRate * 100}%` }}
              />
            </div>
            <div className="flex gap-6 text-sm">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-blue-500" />
                <span className="text-gray-400">GCLID (Google Ads)</span>
                <span className="font-medium text-white">{fmt(summary.gclidRevenue)}</span>
                <span className="text-gray-500">{pct(summary.attributionRate)}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-gray-700" />
                <span className="text-gray-400">Organic / Direct</span>
                <span className="font-medium text-white">{fmt(summary.totalRevenue - summary.gclidRevenue)}</span>
                <span className="text-gray-500">{pct(1 - summary.attributionRate)}</span>
              </div>
            </div>
          </div>

          {/* Monthly table */}
          {gclidData.monthly.length > 0 && (
            <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden mb-6">
              <div className="px-6 py-4 border-b border-gray-800">
                <h2 className="text-sm font-semibold text-white">Monthly Breakdown</h2>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-gray-500 text-xs uppercase tracking-wider bg-gray-800/50 border-b border-gray-800">
                    <th className="py-3 px-4 text-left">Month</th>
                    <th className="py-3 px-4 text-right">Total Orders</th>
                    <th className="py-3 px-4 text-right text-blue-400">GCLID Orders</th>
                    <th className="py-3 px-4 text-right">Attribution</th>
                    <th className="py-3 px-4 text-right">Total Revenue</th>
                    <th className="py-3 px-4 text-right text-blue-400">GCLID Revenue</th>
                    <th className="py-3 px-4 text-right">Google Spend</th>
                    <th className="py-3 px-4 text-right">CPA</th>
                    <th className="py-3 px-4 text-right">ROAS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {gclidData.monthly.map(m => {
                    const spend = googleSpendByMonth[m.date] ?? 0;
                    const mCpa = m.gclidOrders > 0 && spend > 0 ? spend / m.gclidOrders : null;
                    const mRoas = m.gclidRevenue > 0 && spend > 0 ? m.gclidRevenue / spend : null;
                    const mRate = m.totalOrders > 0 ? m.gclidOrders / m.totalOrders : 0;
                    return (
                      <tr key={m.date} className="text-gray-300 hover:bg-gray-800/40">
                        <td className="py-2.5 px-4 font-medium text-white">{m.date}</td>
                        <td className="py-2.5 px-4 text-right">{m.totalOrders}</td>
                        <td className="py-2.5 px-4 text-right text-blue-400">{m.gclidOrders}</td>
                        <td className="py-2.5 px-4 text-right">{pct(mRate)}</td>
                        <td className="py-2.5 px-4 text-right">{fmt(m.totalRevenue)}</td>
                        <td className="py-2.5 px-4 text-right text-blue-400">{fmt(m.gclidRevenue)}</td>
                        <td className="py-2.5 px-4 text-right">{spend > 0 ? fmt(spend) : "—"}</td>
                        <td className="py-2.5 px-4 text-right">{mCpa ? fmt(mCpa) : "—"}</td>
                        <td className={`py-2.5 px-4 text-right font-semibold ${mRoas && mRoas >= 3 ? "text-green-400" : mRoas ? "text-yellow-400" : "text-gray-600"}`}>
                          {mRoas ? `${mRoas.toFixed(2)}x` : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Daily table */}
          <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-white">Daily Detail</h2>
              <span className="text-xs text-gray-500">{gclidData.daily.length} days</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-gray-500 text-xs uppercase tracking-wider bg-gray-800/50 border-b border-gray-800">
                    <th className="py-3 px-4 text-left">Date</th>
                    <th className="py-3 px-4 text-right">Total Orders</th>
                    <th className="py-3 px-4 text-right text-blue-400">GCLID Orders</th>
                    <th className="py-3 px-4 text-right">Attribution</th>
                    <th className="py-3 px-4 text-right">Total Revenue</th>
                    <th className="py-3 px-4 text-right text-blue-400">GCLID Revenue</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {gclidData.daily.map(d => {
                    const rate = d.totalOrders > 0 ? d.gclidOrders / d.totalOrders : 0;
                    return (
                      <tr key={d.date} className="text-gray-300 hover:bg-gray-800/40">
                        <td className="py-2 px-4 text-gray-400">{d.date}</td>
                        <td className="py-2 px-4 text-right">{d.totalOrders}</td>
                        <td className="py-2 px-4 text-right text-blue-400">{d.gclidOrders}</td>
                        <td className="py-2 px-4 text-right">{d.gclidOrders > 0 ? pct(rate) : <span className="text-gray-600">—</span>}</td>
                        <td className="py-2 px-4 text-right">{fmt(d.totalRevenue)}</td>
                        <td className="py-2 px-4 text-right text-blue-400">{d.gclidOrders > 0 ? fmt(d.gclidRevenue) : <span className="text-gray-600">—</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
