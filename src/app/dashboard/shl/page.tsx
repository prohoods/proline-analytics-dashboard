"use client";

import { useEffect, useState, useCallback } from "react";
import DateRangeDropdown from "@/components/DateRangeDropdown";
import { RangeKey, getRange } from "@/lib/date-ranges";

type Brand = "proline" | "shl" | "combined";

interface DayData { date: string; orders: number; grossRevenue: number; refunds: number; netRevenue: number; }
interface Summary { totalOrders: number; grossRevenue: number; totalRefunds: number; netRevenue: number; }
interface StoreData { daily: DayData[]; summary: Summary; }

const fmt = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
const fmtN = (n: number) => new Intl.NumberFormat("en-US").format(Math.round(n));
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
function fmtDate(d: string) {
  const dt = new Date(d + "T12:00:00Z");
  return `${MONTHS[dt.getMonth()]} ${dt.getDate()}`;
}
function fmtMonth(d: string) {
  const dt = new Date(d + "-01T12:00:00Z");
  return `${MONTHS[dt.getMonth()]} ${dt.getFullYear()}`;
}

function groupByMonth(daily: DayData[]): (DayData & { month: string })[] {
  const map: Record<string, DayData & { month: string }> = {};
  for (const d of daily) {
    const m = d.date.substring(0, 7);
    if (!map[m]) map[m] = { date: m, month: m, orders: 0, grossRevenue: 0, refunds: 0, netRevenue: 0 };
    map[m].orders += d.orders;
    map[m].grossRevenue += d.grossRevenue;
    map[m].refunds += d.refunds;
    map[m].netRevenue += d.netRevenue;
  }
  return Object.values(map).sort((a, b) => b.month.localeCompare(a.month));
}

function combineDays(a: DayData[], b: DayData[]): DayData[] {
  const map: Record<string, DayData> = {};
  for (const d of [...a, ...b]) {
    if (!map[d.date]) map[d.date] = { date: d.date, orders: 0, grossRevenue: 0, refunds: 0, netRevenue: 0 };
    map[d.date].orders += d.orders;
    map[d.date].grossRevenue += d.grossRevenue;
    map[d.date].refunds += d.refunds;
    map[d.date].netRevenue += d.netRevenue;
  }
  return Object.values(map).sort((a, b) => b.date.localeCompare(a.date));
}

export default function SHLPage() {
  const [rangeKey, setRangeKey] = useState<RangeKey>("30d");
  const [brand, setBrand] = useState<Brand>("combined");
  const [view, setView] = useState<"daily" | "monthly">("monthly");
  const [proline, setProline] = useState<StoreData | null>(null);
  const [shl, setShl] = useState<StoreData | null>(null);
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState<{ proline?: string; shl?: string }>({});

  const fetchData = useCallback(() => {
    const { start, end } = getRange(rangeKey);
    setLoading(true);
    setErrors({});

    Promise.allSettled([
      fetch(`/api/shopify/orders?start=${start}&end=${end}`).then(r => r.json()).then(d => { if (d.error) throw new Error(d.error); setProline(d); }),
      fetch(`/api/shopify-shl/orders?start=${start}&end=${end}`).then(r => r.json()).then(d => { if (d.error) throw new Error(d.error); setShl(d); }),
    ]).then(([p, s]) => {
      const errs: { proline?: string; shl?: string } = {};
      if (p.status === "rejected") errs.proline = p.reason?.message ?? "Failed";
      if (s.status === "rejected") errs.shl = s.reason?.message ?? "Failed";
      setErrors(errs);
      setLoading(false);
    });
  }, [rangeKey]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Derive active data based on brand tab
  const activeDays = brand === "proline" ? (proline?.daily ?? [])
    : brand === "shl" ? (shl?.daily ?? [])
    : combineDays(proline?.daily ?? [], shl?.daily ?? []);

  const activeSummary: Summary = brand === "proline"
    ? (proline?.summary ?? { totalOrders: 0, grossRevenue: 0, totalRefunds: 0, netRevenue: 0 })
    : brand === "shl"
      ? (shl?.summary ?? { totalOrders: 0, grossRevenue: 0, totalRefunds: 0, netRevenue: 0 })
      : {
          totalOrders: (proline?.summary.totalOrders ?? 0) + (shl?.summary.totalOrders ?? 0),
          grossRevenue: (proline?.summary.grossRevenue ?? 0) + (shl?.summary.grossRevenue ?? 0),
          totalRefunds: (proline?.summary.totalRefunds ?? 0) + (shl?.summary.totalRefunds ?? 0),
          netRevenue: (proline?.summary.netRevenue ?? 0) + (shl?.summary.netRevenue ?? 0),
        };

  const months = groupByMonth(activeDays);
  const Skeleton = () => <div className="h-5 bg-gray-800 rounded animate-pulse w-24" />;

  const brandTabs: { key: Brand; label: string; color: string; activeClass: string }[] = [
    { key: "proline", label: "Proline", color: "text-blue-400", activeClass: "bg-blue-600/20 text-blue-400 border-blue-700/40" },
    { key: "shl", label: "Smart Home Luxury", color: "text-purple-400", activeClass: "bg-purple-600/20 text-purple-400 border-purple-700/40" },
    { key: "combined", label: "Combined", color: "text-emerald-400", activeClass: "bg-emerald-600/20 text-emerald-400 border-emerald-700/40" },
  ];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Sales — All Brands</h1>
          <p className="text-gray-400 text-sm mt-1">Proline Range Hoods + Smart Home Luxury</p>
        </div>
        <DateRangeDropdown value={rangeKey} onChange={setRangeKey} />
      </div>

      {/* Brand tabs */}
      <div className="flex gap-2">
        {brandTabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setBrand(tab.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
              brand === tab.key ? tab.activeClass : "border-transparent text-gray-500 hover:text-gray-300 hover:bg-gray-800"
            }`}
          >
            {tab.label}
            {tab.key !== "combined" && errors[tab.key] && (
              <span className="ml-1.5 text-xs text-red-400">error</span>
            )}
          </button>
        ))}
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Gross Revenue", value: activeSummary.grossRevenue, color: "text-white" },
          { label: "Refunds", value: activeSummary.totalRefunds, color: "text-red-400", neg: true },
          { label: "Net Revenue", value: activeSummary.netRevenue, color: brand === "proline" ? "text-blue-400" : brand === "shl" ? "text-purple-400" : "text-emerald-400" },
          { label: "Orders", value: activeSummary.totalOrders, color: "text-white", isCount: true },
        ].map(card => (
          <div key={card.label} className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">{card.label}</div>
            {loading ? <Skeleton /> : (
              <div className={`text-2xl font-bold ${card.color}`}>
                {card.isCount ? fmtN(card.value) : fmt(card.value)}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Side-by-side KPIs when on Combined */}
      {brand === "combined" && !loading && proline && shl && (
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <div className="text-xs text-blue-500 uppercase tracking-wide font-semibold mb-3">Proline Range Hoods</div>
            <div className="grid grid-cols-3 gap-3">
              <div><div className="text-xs text-gray-500 mb-1">Gross</div><div className="text-sm font-bold text-white">{fmt(proline.summary.grossRevenue)}</div></div>
              <div><div className="text-xs text-gray-500 mb-1">Net</div><div className="text-sm font-bold text-blue-400">{fmt(proline.summary.netRevenue)}</div></div>
              <div><div className="text-xs text-gray-500 mb-1">Orders</div><div className="text-sm font-bold text-white">{fmtN(proline.summary.totalOrders)}</div></div>
            </div>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <div className="text-xs text-purple-500 uppercase tracking-wide font-semibold mb-3">Smart Home Luxury</div>
            <div className="grid grid-cols-3 gap-3">
              <div><div className="text-xs text-gray-500 mb-1">Gross</div><div className="text-sm font-bold text-white">{fmt(shl.summary.grossRevenue)}</div></div>
              <div><div className="text-xs text-gray-500 mb-1">Net</div><div className="text-sm font-bold text-purple-400">{fmt(shl.summary.netRevenue)}</div></div>
              <div><div className="text-xs text-gray-500 mb-1">Orders</div><div className="text-sm font-bold text-white">{fmtN(shl.summary.totalOrders)}</div></div>
            </div>
          </div>
        </div>
      )}

      {/* View toggle */}
      <div className="flex gap-1">
        {(["monthly", "daily"] as const).map(v => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              view === v ? "bg-gray-700 text-white" : "text-gray-500 hover:text-gray-300 hover:bg-gray-800"
            }`}
          >
            {v.charAt(0).toUpperCase() + v.slice(1)}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-500 text-xs uppercase tracking-wider bg-gray-800/40 border-b border-gray-800">
              <th className="py-2.5 px-4 text-left">{view === "monthly" ? "Month" : "Date"}</th>
              <th className="py-2.5 px-4 text-right">Orders</th>
              <th className="py-2.5 px-4 text-right">Gross Revenue</th>
              <th className="py-2.5 px-4 text-right">Refunds</th>
              <th className="py-2.5 px-4 text-right">Net Revenue</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {loading ? (
              [...Array(6)].map((_, i) => (
                <tr key={i}>
                  {[...Array(5)].map((_, j) => (
                    <td key={j} className="py-3 px-4">
                      <div className="h-4 bg-gray-800 rounded animate-pulse" />
                    </td>
                  ))}
                </tr>
              ))
            ) : view === "monthly" ? (
              months.map(m => (
                <tr key={m.month} className="hover:bg-gray-800/30">
                  <td className="py-3 px-4 font-medium text-white">{fmtMonth(m.month)}</td>
                  <td className="py-3 px-4 text-right text-gray-300">{fmtN(m.orders)}</td>
                  <td className="py-3 px-4 text-right text-gray-300">{fmt(m.grossRevenue)}</td>
                  <td className="py-3 px-4 text-right text-red-400">{m.refunds > 0 ? `(${fmt(m.refunds)})` : "—"}</td>
                  <td className={`py-3 px-4 text-right font-semibold ${brand === "proline" ? "text-blue-400" : brand === "shl" ? "text-purple-400" : "text-emerald-400"}`}>{fmt(m.netRevenue)}</td>
                </tr>
              ))
            ) : (
              activeDays.slice(0, 90).map(d => (
                <tr key={d.date} className="hover:bg-gray-800/30">
                  <td className="py-2.5 px-4 text-gray-300">{fmtDate(d.date)}</td>
                  <td className="py-2.5 px-4 text-right text-gray-300">{fmtN(d.orders)}</td>
                  <td className="py-2.5 px-4 text-right text-gray-300">{fmt(d.grossRevenue)}</td>
                  <td className="py-2.5 px-4 text-right text-red-400">{d.refunds > 0 ? `(${fmt(d.refunds)})` : "—"}</td>
                  <td className={`py-2.5 px-4 text-right font-semibold ${brand === "proline" ? "text-blue-400" : brand === "shl" ? "text-purple-400" : "text-emerald-400"}`}>{fmt(d.netRevenue)}</td>
                </tr>
              ))
            )}
          </tbody>
          {!loading && (
            <tfoot>
              <tr className="border-t-2 border-gray-700 bg-gray-800/50 font-bold text-white text-sm">
                <td className="py-3 px-4">Total</td>
                <td className="py-3 px-4 text-right">{fmtN(activeSummary.totalOrders)}</td>
                <td className="py-3 px-4 text-right">{fmt(activeSummary.grossRevenue)}</td>
                <td className="py-3 px-4 text-right text-red-400">{activeSummary.totalRefunds > 0 ? `(${fmt(activeSummary.totalRefunds)})` : "—"}</td>
                <td className={`py-3 px-4 text-right ${brand === "proline" ? "text-blue-400" : brand === "shl" ? "text-purple-400" : "text-emerald-400"}`}>{fmt(activeSummary.netRevenue)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
