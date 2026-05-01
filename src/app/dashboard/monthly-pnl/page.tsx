"use client";

import { useEffect, useState, useMemo } from "react";
import { TableSkeleton, KPISkeleton } from "@/components/Skeleton";
import { exportToCSV } from "@/lib/export-csv";

interface MonthlyPnlRow {
  month: string;
  ymKey: string;
  googleAdShopping: number;
  connexity: number;
  bing: number;
  amazon: number;
  meta: number;
  pinterest: number;
  totalAdSpend: number;
  sitePhone: number;
  cogsTariffs: number;
  companyRefunds: number;
  convValue: number;
  netRevenue: number;
  roi: number;
  blendedRoas: number;
  marginPct: number;
  note: string;
}

interface PnlSummary {
  googleAdShopping: number;
  connexity: number;
  bing: number;
  amazon: number;
  meta: number;
  pinterest: number;
  totalAdSpend: number;
  sitePhone: number;
  cogsTariffs: number;
  companyRefunds: number;
  convValue: number;
  netRevenue: number;
  roi: number;
  blendedRoas: number;
  marginPct: number;
  monthCount: number;
}

const fmt = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
const fmt2 = (n: number) => n.toFixed(2);
const fmtPct = (n: number) => n.toFixed(2) + "%";

const MONTH_NAMES_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
function fmtMonthLabel(ymKey: string): string {
  const [y, m] = ymKey.split("-").map(Number);
  if (!y || !m) return ymKey;
  return `${MONTH_NAMES_LONG[m - 1]} ${y}`;
}

// All distinct years that appear in the data, newest first
function distinctYears(rows: MonthlyPnlRow[]): number[] {
  const set = new Set<number>();
  for (const r of rows) {
    const y = parseInt(r.ymKey.substring(0, 4));
    if (!isNaN(y)) set.add(y);
  }
  return [...set].sort((a, b) => b - a);
}

function roiColor(roi: number): string {
  if (roi >= 3) return "text-green-400";
  if (roi >= 2) return "text-yellow-400";
  if (roi >= 1) return "text-orange-400";
  return "text-red-400";
}

function marginColor(pct: number): string {
  if (pct >= 55) return "text-green-400";
  if (pct >= 45) return "text-yellow-400";
  return "text-red-400";
}

export default function MonthlyPnlPage() {
  const [rows, setRows] = useState<MonthlyPnlRow[]>([]);
  const [summary, setSummary] = useState<PnlSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [yearFilter, setYearFilter] = useState<"all" | number>("all");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    setLoading(true);
    setError("");
    fetch(`/api/sheets/monthly-pnl?_=${refreshKey}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) throw new Error(d.error);
        setRows(d.months ?? []);
        setSummary(d.summary ?? null);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [refreshKey]);

  const years = useMemo(() => distinctYears(rows), [rows]);

  const filtered = useMemo(() => {
    const view = yearFilter === "all"
      ? rows
      : rows.filter(r => r.ymKey.startsWith(`${yearFilter}-`));
    // Newest month first in the table
    return [...view].sort((a, b) => b.ymKey.localeCompare(a.ymKey));
  }, [rows, yearFilter]);

  const filteredSummary = useMemo<PnlSummary | null>(() => {
    if (!filtered.length) return null;
    const sumK = (k: keyof MonthlyPnlRow) =>
      filtered.reduce((s, r) => s + (typeof r[k] === "number" ? (r[k] as number) : 0), 0);
    const totalAdSpend = sumK("totalAdSpend");
    const sitePhone = sumK("sitePhone");
    const convValue = sumK("convValue");
    const netRevenue = sumK("netRevenue");
    return {
      googleAdShopping: sumK("googleAdShopping"),
      connexity: sumK("connexity"),
      bing: sumK("bing"),
      amazon: sumK("amazon"),
      meta: sumK("meta"),
      pinterest: sumK("pinterest"),
      totalAdSpend,
      sitePhone,
      cogsTariffs: sumK("cogsTariffs"),
      companyRefunds: sumK("companyRefunds"),
      convValue,
      netRevenue,
      roi: totalAdSpend > 0 ? netRevenue / totalAdSpend : 0,
      blendedRoas: totalAdSpend > 0 ? convValue / totalAdSpend : 0,
      marginPct: sitePhone > 0 ? (netRevenue / sitePhone) * 100 : 0,
      monthCount: filtered.length,
    };
  }, [filtered]);

  function handleExport() {
    if (!filtered.length) return;
    exportToCSV(filtered.map(r => ({
      month: fmtMonthLabel(r.ymKey),
      google_ad_shopping: r.googleAdShopping.toFixed(2),
      connexity: r.connexity.toFixed(2),
      bing: r.bing.toFixed(2),
      amazon: r.amazon.toFixed(2),
      meta: r.meta.toFixed(2),
      pinterest: r.pinterest.toFixed(2),
      total_ad_spend: r.totalAdSpend.toFixed(2),
      site_phone: r.sitePhone.toFixed(2),
      cogs_tariffs: r.cogsTariffs.toFixed(2),
      company_refunds: r.companyRefunds.toFixed(2),
      conv_value: r.convValue.toFixed(2),
      net_revenue: r.netRevenue.toFixed(2),
      roi: r.roi.toFixed(2),
      blended_roas: r.blendedRoas.toFixed(2),
      margin_pct: r.marginPct.toFixed(2) + "%",
      note: r.note,
    })), `monthly-pnl-${yearFilter === "all" ? "all" : yearFilter}.csv`);
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Monthly P&amp;L</h1>
          <p className="text-gray-400 text-sm mt-1">
            Ad spend, revenue, and margin by month. Pulls from the &quot;Monthly P&amp;L&quot; tab in the daily sales report — manually entered.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setRefreshKey(k => k + 1)}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg text-sm text-gray-300 hover:text-white transition-colors disabled:opacity-50"
            title="Force refresh from Google Sheets"
          >
            <svg className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
          <button
            onClick={handleExport}
            disabled={!filtered.length}
            className="px-3 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 hover:text-white text-sm rounded-lg transition-colors disabled:opacity-50"
          >
            Export CSV
          </button>
          <select
            value={yearFilter === "all" ? "all" : String(yearFilter)}
            onChange={e => setYearFilter(e.target.value === "all" ? "all" : parseInt(e.target.value))}
            className="bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500"
          >
            <option value="all">All years</option>
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      {error && <div className="text-red-400 bg-red-900/20 rounded-xl p-4 text-sm">{error}</div>}

      <MethodologyNote />

      {loading && (
        <div className="space-y-6">
          <KPISkeleton count={4} />
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <TableSkeleton rows={12} cols={16} />
          </div>
        </div>
      )}

      {!loading && !error && filteredSummary && (
        <>
          {/* Summary KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Site + Phone</div>
              <div className="text-2xl font-bold text-white">{fmt(filteredSummary.sitePhone)}</div>
              <div className="text-xs text-gray-500 mt-1">{filteredSummary.monthCount} months</div>
            </div>
            <div className="bg-gray-900 border border-red-800/30 rounded-xl p-5">
              <div className="text-xs text-red-400 uppercase tracking-wide mb-1">Total Ad Spend</div>
              <div className="text-2xl font-bold text-red-400">{fmt(filteredSummary.totalAdSpend)}</div>
              <div className="text-xs text-gray-500 mt-1">All channels combined</div>
            </div>
            <div className="bg-gray-900 border border-green-800/40 rounded-xl p-5">
              <div className="text-xs text-green-400 uppercase tracking-wide mb-1">Net Revenue</div>
              <div className="text-2xl font-bold text-green-400">{fmt(filteredSummary.netRevenue)}</div>
              <div className="text-xs text-gray-500 mt-1">After COGS, refunds, ad spend</div>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Net Margin</div>
              <div className={`text-2xl font-bold ${marginColor(filteredSummary.marginPct)}`}>{fmtPct(filteredSummary.marginPct)}</div>
              <div className="text-xs text-gray-500 mt-1">Net Revenue ÷ Site+Phone</div>
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">ROI</div>
              <div className={`text-2xl font-bold ${roiColor(filteredSummary.roi)}`}>{fmt2(filteredSummary.roi)}×</div>
              <div className="text-xs text-gray-500 mt-1">Net Revenue ÷ Ad Spend</div>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Blended ROAS</div>
              <div className="text-2xl font-bold text-white">{fmt2(filteredSummary.blendedRoas)}×</div>
              <div className="text-xs text-gray-500 mt-1">Conv Value ÷ Ad Spend</div>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">COGS + Tariffs</div>
              <div className="text-2xl font-bold text-red-400">{fmt(filteredSummary.cogsTariffs)}</div>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Company Refunds</div>
              <div className="text-2xl font-bold text-red-400">{fmt(filteredSummary.companyRefunds)}</div>
            </div>
          </div>

          {/* Channel mix card */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-3">Ad Spend by Channel</div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              {[
                { label: "Google", v: filteredSummary.googleAdShopping, color: "text-blue-400" },
                { label: "Connexity", v: filteredSummary.connexity, color: "text-purple-400" },
                { label: "Bing", v: filteredSummary.bing, color: "text-cyan-400" },
                { label: "Amazon", v: filteredSummary.amazon, color: "text-orange-400" },
                { label: "Meta", v: filteredSummary.meta, color: "text-blue-300" },
                { label: "Pinterest", v: filteredSummary.pinterest, color: "text-red-400" },
              ].map(c => {
                const pct = filteredSummary.totalAdSpend > 0 ? (c.v / filteredSummary.totalAdSpend) * 100 : 0;
                return (
                  <div key={c.label} className="bg-gray-800/40 rounded-lg p-3">
                    <div className="text-xs text-gray-500 mb-1">{c.label}</div>
                    <div className={`text-base font-bold ${c.color}`}>{fmt(c.v)}</div>
                    <div className="text-xs text-gray-600 mt-0.5">{pct.toFixed(1)}% of spend</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Table */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-800/80 text-gray-500 uppercase text-xs tracking-wider">
                  <tr>
                    <th className="text-left py-3 px-3 sticky left-0 bg-gray-800/80 z-10">Month</th>
                    <th className="text-right py-3 px-3 text-blue-400">Google</th>
                    <th className="text-right py-3 px-3 text-purple-400">Connexity</th>
                    <th className="text-right py-3 px-3 text-cyan-400">Bing</th>
                    <th className="text-right py-3 px-3 text-orange-400">Amazon</th>
                    <th className="text-right py-3 px-3 text-blue-300">Meta</th>
                    <th className="text-right py-3 px-3 text-red-400">Pinterest</th>
                    <th className="text-right py-3 px-3 border-l border-gray-700 text-red-400">Total Ad Spend</th>
                    <th className="text-right py-3 px-3 border-l border-gray-700">Site+Phone</th>
                    <th className="text-right py-3 px-3 text-red-400">COGS+Tariffs</th>
                    <th className="text-right py-3 px-3 text-red-400">Refunds</th>
                    <th className="text-right py-3 px-3">Conv Value</th>
                    <th className="text-right py-3 px-3 text-green-400 font-semibold">Net Revenue</th>
                    <th className="text-right py-3 px-3">ROI</th>
                    <th className="text-right py-3 px-3">Blended ROAS</th>
                    <th className="text-right py-3 px-3">Margin</th>
                    <th className="text-left py-3 px-3 text-gray-600">Note</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {filtered.length === 0 && (
                    <tr><td colSpan={17} className="px-4 py-8 text-center text-gray-500">No months found.</td></tr>
                  )}
                  {filtered.map(r => (
                    <tr key={r.ymKey} className="hover:bg-gray-800/40 text-gray-300">
                      <td className="py-2 px-3 whitespace-nowrap font-medium text-white sticky left-0 bg-gray-900">{fmtMonthLabel(r.ymKey)}</td>
                      <td className="py-2 px-3 text-right tabular-nums">{r.googleAdShopping > 0 ? fmt(r.googleAdShopping) : <span className="text-gray-600">—</span>}</td>
                      <td className="py-2 px-3 text-right tabular-nums">{r.connexity > 0 ? fmt(r.connexity) : <span className="text-gray-600">—</span>}</td>
                      <td className="py-2 px-3 text-right tabular-nums">{r.bing > 0 ? fmt(r.bing) : <span className="text-gray-600">—</span>}</td>
                      <td className="py-2 px-3 text-right tabular-nums">{r.amazon > 0 ? fmt(r.amazon) : <span className="text-gray-600">—</span>}</td>
                      <td className="py-2 px-3 text-right tabular-nums">{r.meta > 0 ? fmt(r.meta) : <span className="text-gray-600">—</span>}</td>
                      <td className="py-2 px-3 text-right tabular-nums">{r.pinterest > 0 ? fmt(r.pinterest) : <span className="text-gray-600">—</span>}</td>
                      <td className="py-2 px-3 text-right tabular-nums border-l border-gray-800 text-red-400 font-medium">{fmt(r.totalAdSpend)}</td>
                      <td className="py-2 px-3 text-right tabular-nums border-l border-gray-800 text-white font-medium">{fmt(r.sitePhone)}</td>
                      <td className="py-2 px-3 text-right tabular-nums text-red-400">{r.cogsTariffs > 0 ? fmt(r.cogsTariffs) : <span className="text-gray-600">—</span>}</td>
                      <td className="py-2 px-3 text-right tabular-nums text-red-400">{r.companyRefunds > 0 ? fmt(r.companyRefunds) : <span className="text-gray-600">—</span>}</td>
                      <td className="py-2 px-3 text-right tabular-nums">{r.convValue > 0 ? fmt(r.convValue) : <span className="text-gray-600">—</span>}</td>
                      <td className="py-2 px-3 text-right tabular-nums text-green-400 font-semibold">{fmt(r.netRevenue)}</td>
                      <td className={`py-2 px-3 text-right tabular-nums font-medium ${roiColor(r.roi)}`}>{r.totalAdSpend > 0 ? `${fmt2(r.roi)}×` : <span className="text-gray-600">—</span>}</td>
                      <td className="py-2 px-3 text-right tabular-nums">{r.totalAdSpend > 0 ? `${fmt2(r.blendedRoas)}×` : <span className="text-gray-600">—</span>}</td>
                      <td className={`py-2 px-3 text-right tabular-nums font-medium ${marginColor(r.marginPct)}`}>{r.sitePhone > 0 ? fmtPct(r.marginPct) : <span className="text-gray-600">—</span>}</td>
                      <td className="py-2 px-3 text-xs text-gray-500 truncate max-w-xs">{r.note || ""}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-800/50 border-t border-gray-700 font-semibold text-white text-xs">
                    <td className="py-3 px-3 sticky left-0 bg-gray-800/50 text-gray-400">Total ({filteredSummary.monthCount})</td>
                    <td className="py-3 px-3 text-right">{fmt(filteredSummary.googleAdShopping)}</td>
                    <td className="py-3 px-3 text-right">{fmt(filteredSummary.connexity)}</td>
                    <td className="py-3 px-3 text-right">{fmt(filteredSummary.bing)}</td>
                    <td className="py-3 px-3 text-right">{fmt(filteredSummary.amazon)}</td>
                    <td className="py-3 px-3 text-right">{fmt(filteredSummary.meta)}</td>
                    <td className="py-3 px-3 text-right">{fmt(filteredSummary.pinterest)}</td>
                    <td className="py-3 px-3 text-right border-l border-gray-700 text-red-400">{fmt(filteredSummary.totalAdSpend)}</td>
                    <td className="py-3 px-3 text-right border-l border-gray-700 text-white">{fmt(filteredSummary.sitePhone)}</td>
                    <td className="py-3 px-3 text-right text-red-400">{fmt(filteredSummary.cogsTariffs)}</td>
                    <td className="py-3 px-3 text-right text-red-400">{fmt(filteredSummary.companyRefunds)}</td>
                    <td className="py-3 px-3 text-right">{fmt(filteredSummary.convValue)}</td>
                    <td className="py-3 px-3 text-right text-green-400">{fmt(filteredSummary.netRevenue)}</td>
                    <td className={`py-3 px-3 text-right ${roiColor(filteredSummary.roi)}`}>{fmt2(filteredSummary.roi)}×</td>
                    <td className="py-3 px-3 text-right">{fmt2(filteredSummary.blendedRoas)}×</td>
                    <td className={`py-3 px-3 text-right ${marginColor(filteredSummary.marginPct)}`}>{fmtPct(filteredSummary.marginPct)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </>
      )}

      {!loading && !error && filtered.length === 0 && (
        <div className="text-gray-500 text-sm text-center py-12">
          No data found. Make sure the &quot;Monthly P&amp;L&quot; tab exists in the Sales Report sheet with months in column A.
        </div>
      )}
    </div>
  );
}

function MethodologyNote() {
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 w-full px-5 py-3 text-left text-sm text-gray-400 hover:text-gray-200 transition-colors"
      >
        <svg className="w-4 h-4 text-blue-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
        <span className="font-medium text-gray-300">How this data is calculated</span>
        <svg className={`w-3 h-3 ml-auto transition-transform ${open ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
      </button>
      {open && (
        <div className="px-5 pb-5 grid grid-cols-1 md:grid-cols-2 gap-6 border-t border-gray-800 pt-4 text-sm text-gray-400">
          <div>
            <div className="text-white font-semibold mb-2">Source</div>
            <ul className="space-y-1.5">
              <li>Manually entered each month in the &quot;Monthly P&amp;L&quot; tab of the 2026 Daily Sales Report (Google Sheet).</li>
              <li>Ad-channel cells (Google, Connexity, Bing, Amazon, Meta, Pinterest), revenue (Site+Phone), COGS+Tariffs, Refunds, Conv Value, and Net Revenue are typed in by the team.</li>
              <li>Re-fetched every 15 minutes from the sheet (or instantly via the Refresh button).</li>
            </ul>
          </div>
          <div>
            <div className="text-white font-semibold mb-2">Computed columns</div>
            <ul className="space-y-1.5">
              <li><span className="text-gray-200">Total Ad Spend</span> — Sum of the six channel cells. Re-derived here so it can&apos;t drift if a sheet formula breaks.</li>
              <li><span className="text-gray-200">ROI</span> — Net Revenue ÷ Total Ad Spend.</li>
              <li><span className="text-gray-200">Blended ROAS</span> — Conv Value ÷ Total Ad Spend.</li>
              <li><span className="text-gray-200">Margin</span> — Net Revenue ÷ Site+Phone (net margin %).</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
