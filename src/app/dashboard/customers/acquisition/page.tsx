"use client";

import { useEffect, useState, useMemo } from "react";
import DateRangeDropdown from "@/components/DateRangeDropdown";
import { RangeKey, getRange } from "@/lib/date-ranges";

interface AcquisitionSummary {
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
}

interface GoogleMonth {
  month: string;
  totalSpend: number;
}

const fmt = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

export default function AcquisitionPage() {
  const [rangeKey, setRangeKey] = useState<RangeKey>("30d");
  const [acqData, setAcqData] = useState<{ summary: AcquisitionSummary; monthly: MonthBucket[] } | null>(null);
  const [googleMonths, setGoogleMonths] = useState<GoogleMonth[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const range = getRange(rangeKey);
    setLoading(true);
    setError("");

    Promise.allSettled([
      fetch(`/api/shopify/customer-acquisition?start=${range.start}&end=${range.end}`)
        .then(r => r.json()),
      fetch(`/api/google-ads/campaigns?start=${range.start}&end=${range.end}`)
        .then(r => r.json()),
    ]).then(([acqResult, googleResult]) => {
      if (acqResult.status === "fulfilled") {
        const d = acqResult.value;
        if (d.error) setError(d.error);
        else setAcqData(d);
      } else {
        setError("Failed to load customer data");
      }
      if (googleResult.status === "fulfilled" && Array.isArray(googleResult.value)) {
        setGoogleMonths(googleResult.value);
      }
      setLoading(false);
    });
  }, [rangeKey]);

  const range = getRange(rangeKey);

  const googleSpend = useMemo(() => {
    return googleMonths
      .filter(m => m.month >= range.startYM && m.month <= range.endYM)
      .reduce((s, m) => s + m.totalSpend, 0);
  }, [googleMonths, range.startYM, range.endYM]);

  const googleSpendByMonth: Record<string, number> = {};
  for (const m of googleMonths) {
    googleSpendByMonth[m.month] = (googleSpendByMonth[m.month] ?? 0) + m.totalSpend;
  }

  const s = acqData?.summary;

  // CPA = Google spend ÷ GCLID-attributed new customers
  const cpa = s && s.gclidNewCount > 0 && googleSpend > 0
    ? googleSpend / s.gclidNewCount
    : null;

  // Total revenue for share calculations
  const totalRevenue = s ? s.newRevenue + s.repeatRevenue + s.guestRevenue : 0;

  return (
    <div className="p-8">
      <div className="mb-6 flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Customer Acquisition</h1>
          <p className="text-gray-400 mt-1">New vs repeat customers — live from Shopify</p>
          <div className="mt-2 flex items-center gap-3">
            <div className="inline-flex items-center gap-2 bg-green-900/20 border border-green-700/30 rounded-lg px-3 py-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
              <span className="text-green-400 text-xs font-medium">Shopify Live</span>
            </div>
          </div>
        </div>
        <DateRangeDropdown value={rangeKey} onChange={setRangeKey} />
      </div>

      {error && <div className="text-red-400 bg-red-900/20 rounded-lg p-4 mb-6 text-sm">{error}</div>}
      {loading && <div className="text-gray-400 mb-8">Loading...</div>}

      {!loading && s && (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <div className="bg-gray-900 border border-emerald-800/40 rounded-xl p-5">
              <div className="text-xs text-emerald-400 uppercase tracking-wider mb-1">New Customers</div>
              <div className="text-2xl font-bold text-white">{s.newCustomers}</div>
              <div className="text-xs text-gray-500 mt-1">{fmt(s.newRevenue)} revenue</div>
            </div>

            <div className="bg-gray-900 border border-blue-800/40 rounded-xl p-5">
              <div className="text-xs text-blue-400 uppercase tracking-wider mb-1">Repeat Customers</div>
              <div className="text-2xl font-bold text-white">{s.repeatCustomers}</div>
              <div className="text-xs text-gray-500 mt-1">{fmt(s.repeatRevenue)} revenue</div>
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Repeat Rate</div>
              <div className="text-2xl font-bold text-white">{pct(s.repeatRate)}</div>
              <div className="text-xs text-gray-500 mt-1">of customers with accounts</div>
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Guest Orders</div>
              <div className="text-2xl font-bold text-white">{s.guestOrders}</div>
              <div className="text-xs text-gray-500 mt-1">{fmt(s.guestRevenue)} revenue</div>
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">New via Google (GCLID)</div>
              <div className="text-2xl font-bold text-white">{s.gclidNewCount}</div>
              <div className="text-xs text-gray-500 mt-1">
                {s.newCustomers > 0 ? `${((s.gclidNewCount / s.newCustomers) * 100).toFixed(1)}% of new customers` : "—"}
              </div>
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

          {/* Revenue mix bar */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-6">
            <h2 className="text-sm font-semibold text-white mb-4">Revenue Mix — New vs Repeat</h2>
            {totalRevenue > 0 && (
              <>
                <div className="flex h-3 rounded-full overflow-hidden mb-4 bg-gray-800">
                  <div
                    className="bg-emerald-500"
                    style={{ width: `${(s.newRevenue / totalRevenue) * 100}%` }}
                  />
                  <div
                    className="bg-blue-500"
                    style={{ width: `${(s.repeatRevenue / totalRevenue) * 100}%` }}
                  />
                  <div
                    className="bg-gray-600"
                    style={{ width: `${(s.guestRevenue / totalRevenue) * 100}%` }}
                  />
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
                      <span className="text-gray-500">{pct(item.value / totalRevenue)}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Monthly breakdown */}
          {acqData.monthly.length > 0 && (
            <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-800">
                <h2 className="text-sm font-semibold text-white">Monthly Breakdown</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-gray-500 text-xs uppercase tracking-wider bg-gray-800/50 border-b border-gray-800">
                      <th className="py-3 px-4 text-left">Month</th>
                      <th className="py-3 px-4 text-right text-emerald-400">New</th>
                      <th className="py-3 px-4 text-right text-emerald-400">New Revenue</th>
                      <th className="py-3 px-4 text-right text-blue-400">Repeat</th>
                      <th className="py-3 px-4 text-right text-blue-400">Repeat Revenue</th>
                      <th className="py-3 px-4 text-right">Guest</th>
                      <th className="py-3 px-4 text-right">GCLID New</th>
                      <th className="py-3 px-4 text-right">Google Spend</th>
                      <th className="py-3 px-4 text-right">CPA</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800">
                    {acqData.monthly.map(m => {
                      const spend = googleSpendByMonth[m.month] ?? 0;
                      const mCpa = m.gclidNew > 0 && spend > 0 ? spend / m.gclidNew : null;
                      const mTotal = m.newCustomers + m.repeatCustomers;
                      const mRepeatRate = mTotal > 0 ? m.repeatCustomers / mTotal : 0;
                      return (
                        <tr key={m.month} className="text-gray-300 hover:bg-gray-800/40">
                          <td className="py-2.5 px-4 font-medium text-white">{m.month}</td>
                          <td className="py-2.5 px-4 text-right text-emerald-400 font-semibold">{m.newCustomers}</td>
                          <td className="py-2.5 px-4 text-right text-emerald-400">{fmt(m.newRevenue)}</td>
                          <td className="py-2.5 px-4 text-right text-blue-400 font-semibold">{m.repeatCustomers}</td>
                          <td className="py-2.5 px-4 text-right text-blue-400">{fmt(m.repeatRevenue)}</td>
                          <td className="py-2.5 px-4 text-right text-gray-500">{m.guestOrders}</td>
                          <td className="py-2.5 px-4 text-right">{m.gclidNew > 0 ? m.gclidNew : <span className="text-gray-600">—</span>}</td>
                          <td className="py-2.5 px-4 text-right">{spend > 0 ? fmt(spend) : <span className="text-gray-600">—</span>}</td>
                          <td className="py-2.5 px-4 text-right font-semibold">
                            {mCpa ? fmt(mCpa) : <span className="text-gray-600">—</span>}
                          </td>
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
    </div>
  );
}
