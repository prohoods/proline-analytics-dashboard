"use client";

import { useEffect, useState, useMemo } from "react";
import DateRangeDropdown from "@/components/DateRangeDropdown";
import { RangeKey, getRange } from "@/lib/date-ranges";

interface DayBucket {
  date: string;
  prh: number;
  prolinePro: number;
  phone: number;
  other: number;
  refunds: number;
  salesTax: number;
  gross: number;
  net: number;
}

interface MarketplaceDay {
  date: string; // YYYY-MM-DD
  net: number;
}

interface MarketplaceSummary {
  days: MarketplaceDay[];
}

const fmt = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

function dash(n: number) {
  return n !== 0 ? fmt(n) : <span className="text-gray-600">—</span>;
}

export default function SalesPage() {
  const [rangeKey, setRangeKey] = useState<RangeKey>("ytd");
  const [shopifyData, setShopifyData] = useState<{ daily: DayBucket[]; monthly: DayBucket[] } | null>(null);
  const [marketplace, setMarketplace] = useState<MarketplaceSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Marketplace data is fetched once (all days, filtered client-side)
  useEffect(() => {
    fetch("/api/sheets/marketplace")
      .then(r => r.json())
      .then(d => { if (!d.error) setMarketplace(d); })
      .catch(() => {/* non-fatal */});
  }, []);

  // Shopify data re-fetches on range change
  useEffect(() => {
    const { start, end } = getRange(rangeKey);
    setLoading(true);
    setError("");
    fetch(`/api/shopify/channel-sales?start=${start}&end=${end}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) throw new Error(d.error);
        setShopifyData(d);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [rangeKey]);

  const range = getRange(rangeKey);

  // Build a date-keyed map of marketplace net for merging
  const mktMap = useMemo(() => {
    const map: Record<string, number> = {};
    if (!marketplace) return map;
    for (const d of marketplace.days) {
      if (d.date >= range.start && d.date <= range.end) {
        map[d.date] = (map[d.date] ?? 0) + d.net;
      }
    }
    return map;
  }, [marketplace, range.start, range.end]);

  // Merge marketplace into daily rows
  const daily = useMemo(() => {
    if (!shopifyData) return [];
    return shopifyData.daily.map(d => ({
      ...d,
      marketplaces: mktMap[d.date] ?? 0,
      totalNet: d.net + (mktMap[d.date] ?? 0),
    }));
  }, [shopifyData, mktMap]);

  // Merge marketplace into monthly rows
  const monthly = useMemo(() => {
    if (!shopifyData) return [];
    // Build monthly marketplace totals
    const mktMonthly: Record<string, number> = {};
    for (const [date, val] of Object.entries(mktMap)) {
      const ym = date.substring(0, 7);
      mktMonthly[ym] = (mktMonthly[ym] ?? 0) + val;
    }
    return shopifyData.monthly.map(m => ({
      ...m,
      marketplaces: mktMonthly[m.date] ?? 0,
      totalNet: m.net + (mktMonthly[m.date] ?? 0),
    }));
  }, [shopifyData, mktMap]);

  // Summary totals
  const totals = useMemo(() => {
    if (!monthly.length) return null;
    return {
      prh: monthly.reduce((s, m) => s + m.prh, 0),
      prolinePro: monthly.reduce((s, m) => s + m.prolinePro, 0),
      phone: monthly.reduce((s, m) => s + m.phone, 0),
      other: monthly.reduce((s, m) => s + m.other, 0),
      marketplaces: monthly.reduce((s, m) => s + m.marketplaces, 0),
      refunds: monthly.reduce((s, m) => s + m.refunds, 0),
      salesTax: monthly.reduce((s, m) => s + m.salesTax, 0),
      gross: monthly.reduce((s, m) => s + m.gross, 0),
      net: monthly.reduce((s, m) => s + m.net, 0),
      totalNet: monthly.reduce((s, m) => s + m.totalNet, 0),
    };
  }, [monthly]);

  return (
    <div className="p-8">
      <div className="mb-6 flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Sales by Channel</h1>
          <p className="text-gray-400 mt-1">Direct from Shopify API — channel split by order tags</p>
          <div className="mt-2 flex items-center gap-3">
            <div className="inline-flex items-center gap-2 bg-green-900/20 border border-green-700/30 rounded-lg px-3 py-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
              <span className="text-green-400 text-xs font-medium">Shopify Live</span>
            </div>
            <div className="inline-flex items-center gap-2 bg-blue-900/20 border border-blue-700/30 rounded-lg px-3 py-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
              <span className="text-blue-400 text-xs font-medium">Marketplaces via Sheet</span>
            </div>
          </div>
        </div>
        <DateRangeDropdown value={rangeKey} onChange={setRangeKey} />
      </div>

      {error && (
        <div className="text-red-400 bg-red-900/20 rounded-lg p-4 mb-6 text-sm">{error}</div>
      )}

      {/* Summary cards */}
      {!loading && totals && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Total Net Sales</div>
            <div className="text-2xl font-bold text-green-400">{fmt(totals.totalNet)}</div>
            <div className="text-xs text-gray-500 mt-1">{fmt(totals.gross)} gross · {fmt(totals.refunds)} refunds</div>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">PRH (Website)</div>
            <div className="text-2xl font-bold text-white">{fmt(totals.prh)}</div>
            <div className="text-xs text-gray-500 mt-1">
              {totals.gross > 0 ? `${((totals.prh / totals.gross) * 100).toFixed(1)}% of gross` : "—"}
            </div>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Proline Pro</div>
            <div className="text-2xl font-bold text-white">{fmt(totals.prolinePro)}</div>
            <div className="text-xs text-gray-500 mt-1">B2B orders</div>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Phone + Other</div>
            <div className="text-2xl font-bold text-white">{fmt(totals.phone + totals.other)}</div>
            <div className="text-xs text-gray-500 mt-1">
              {fmt(totals.phone)} phone · {fmt(totals.other)} untagged
            </div>
          </div>
        </div>
      )}

      {loading && <div className="text-gray-400 mb-8">Loading...</div>}

      {/* Monthly breakdown */}
      {!loading && monthly.length > 0 && (
        <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden mb-6">
          <div className="px-6 py-4 border-b border-gray-800">
            <h2 className="text-sm font-semibold text-white">Monthly Sales by Channel</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-500 text-xs uppercase tracking-wider bg-gray-800/50 border-b border-gray-800">
                  <th className="py-3 px-4 text-left">Month</th>
                  <th className="py-3 px-4 text-right">PRH</th>
                  <th className="py-3 px-4 text-right">Pro</th>
                  <th className="py-3 px-4 text-right">Phone</th>
                  <th className="py-3 px-4 text-right text-gray-600">Other</th>
                  <th className="py-3 px-4 text-right">Marketplaces</th>
                  <th className="py-3 px-4 text-right text-red-400">Refunds</th>
                  <th className="py-3 px-4 text-right text-gray-400">Sales Tax</th>
                  <th className="py-3 px-4 text-right font-semibold">Net Sales</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {monthly.map(m => (
                  <tr key={m.date} className="text-gray-300 hover:bg-gray-800/40">
                    <td className="py-2.5 px-4 font-medium text-white">{m.date}</td>
                    <td className="py-2.5 px-4 text-right">{dash(m.prh)}</td>
                    <td className="py-2.5 px-4 text-right">{dash(m.prolinePro)}</td>
                    <td className="py-2.5 px-4 text-right">{dash(m.phone)}</td>
                    <td className="py-2.5 px-4 text-right text-gray-500">{dash(m.other)}</td>
                    <td className="py-2.5 px-4 text-right text-orange-400">{dash(m.marketplaces)}</td>
                    <td className="py-2.5 px-4 text-right text-red-400">{m.refunds > 0 ? fmt(m.refunds) : "—"}</td>
                    <td className="py-2.5 px-4 text-right text-gray-500">{dash(m.salesTax)}</td>
                    <td className="py-2.5 px-4 text-right font-semibold text-green-400">{fmt(m.totalNet)}</td>
                  </tr>
                ))}
              </tbody>
              {totals && (
                <tfoot>
                  <tr className="bg-gray-800/50 border-t border-gray-700 font-semibold text-white text-xs">
                    <td className="py-3 px-4">Total</td>
                    <td className="py-3 px-4 text-right">{fmt(totals.prh)}</td>
                    <td className="py-3 px-4 text-right">{fmt(totals.prolinePro)}</td>
                    <td className="py-3 px-4 text-right">{fmt(totals.phone)}</td>
                    <td className="py-3 px-4 text-right text-gray-500">{fmt(totals.other)}</td>
                    <td className="py-3 px-4 text-right text-orange-400">{fmt(totals.marketplaces)}</td>
                    <td className="py-3 px-4 text-right text-red-400">{totals.refunds > 0 ? fmt(totals.refunds) : "—"}</td>
                    <td className="py-3 px-4 text-right text-gray-500">{fmt(totals.salesTax)}</td>
                    <td className="py-3 px-4 text-right text-green-400">{fmt(totals.totalNet)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}

      {/* Daily breakdown */}
      {!loading && daily.length > 0 && (
        <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">Daily Detail</h2>
            <span className="text-xs text-gray-500">{daily.length} days</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-500 text-xs uppercase tracking-wider bg-gray-800/50 border-b border-gray-800">
                  <th className="py-3 px-4 text-left">Date</th>
                  <th className="py-3 px-4 text-right">PRH</th>
                  <th className="py-3 px-4 text-right">Pro</th>
                  <th className="py-3 px-4 text-right">Phone</th>
                  <th className="py-3 px-4 text-right text-gray-600">Other</th>
                  <th className="py-3 px-4 text-right">Mktplc</th>
                  <th className="py-3 px-4 text-right text-red-400">Refunds</th>
                  <th className="py-3 px-4 text-right font-semibold">Net</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {daily.map(d => (
                  <tr key={d.date} className="text-gray-300 hover:bg-gray-800/40">
                    <td className="py-2 px-4 text-gray-400">{d.date}</td>
                    <td className="py-2 px-4 text-right">{dash(d.prh)}</td>
                    <td className="py-2 px-4 text-right">{dash(d.prolinePro)}</td>
                    <td className="py-2 px-4 text-right">{dash(d.phone)}</td>
                    <td className="py-2 px-4 text-right text-gray-500">{dash(d.other)}</td>
                    <td className="py-2 px-4 text-right text-orange-400">{dash(d.marketplaces)}</td>
                    <td className="py-2 px-4 text-right text-red-400">{d.refunds > 0 ? fmt(d.refunds) : "—"}</td>
                    <td className="py-2 px-4 text-right font-semibold text-green-400">{fmt(d.totalNet)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!loading && !error && daily.length === 0 && (
        <div className="text-gray-500 text-sm text-center py-12">No orders found for this date range.</div>
      )}
    </div>
  );
}
