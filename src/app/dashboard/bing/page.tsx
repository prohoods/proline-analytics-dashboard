"use client";

import { useEffect, useState } from "react";

interface BingRow { month: string; cost: number; }
interface ApiData { rows: BingRow[]; totals: { cost: number }; }

const fmt = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

export default function BingOverviewPage() {
  const [data, setData] = useState<ApiData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/sheets/bing")
      .then(r => r.json())
      .then(d => { if (d.error) throw new Error(d.error); setData(d); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, []);

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Bing / Microsoft Ads</h1>
        <p className="text-gray-400 mt-1">Monthly ad spend — manually updated</p>
        <div className="mt-2 inline-flex items-center gap-2 bg-yellow-900/20 border border-yellow-700/30 rounded-lg px-3 py-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-yellow-400" />
          <span className="text-yellow-400 text-xs font-medium">Manual data — Google Sheets</span>
        </div>
      </div>

      {loading && <div className="text-gray-400">Loading...</div>}
      {error && <div className="text-red-400 bg-red-900/20 rounded-lg p-4 mb-6 text-sm">{error}</div>}

      {!loading && !error && data && (
        <>
          <div className="grid grid-cols-2 gap-4 mb-8 max-w-sm">
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 col-span-2">
              <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Total Spend</div>
              <div className="text-2xl font-bold text-white">{fmt(data.totals.cost)}</div>
              <div className="text-xs text-gray-500 mt-1">{data.rows.length} months</div>
            </div>
          </div>

          <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-800">
              <h2 className="text-sm font-semibold text-white">Monthly Spend</h2>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-500 text-xs uppercase tracking-wider bg-gray-800/50 border-b border-gray-800">
                  <th className="py-3 px-4 text-left">Month</th>
                  <th className="py-3 px-4 text-right">Cost</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {data.rows.length === 0 ? (
                  <tr><td colSpan={2} className="py-8 text-center text-gray-500">No data — add rows to the Bing Ads tab</td></tr>
                ) : data.rows.map((r, i) => (
                  <tr key={i} className="text-gray-300 hover:bg-gray-800/40">
                    <td className="py-2.5 px-4 text-gray-400 font-medium">{r.month}</td>
                    <td className="py-2.5 px-4 text-right font-semibold text-white">{fmt(r.cost)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-gray-800/50 border-t border-gray-700 font-semibold text-white text-xs">
                  <td className="py-3 px-4 text-gray-400">Total</td>
                  <td className="py-3 px-4 text-right">{fmt(data.totals.cost)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
