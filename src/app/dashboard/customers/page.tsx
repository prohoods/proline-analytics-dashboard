"use client";

import { useEffect, useState, useMemo } from "react";
import DateRangeDropdown from "@/components/DateRangeDropdown";
import { RangeKey, getRange } from "@/lib/date-ranges";
import { KPISkeleton, TableSkeleton } from "@/components/Skeleton";
import { exportToCSV } from "@/lib/export-csv";

// ── Types ─────────────────────────────────────────────────────────────────────
interface Customer {
  id: number;
  name: string;
  email: string;
  orderCount: number;
  totalSpend: number;
  firstOrder: string;
  lastOrder: string;
  daysSinceLastOrder: number;
  state: string | null;
  stateCode: string | null;
  channel: string;
  isProlinePro: boolean;
  recentOrders: { date: string; amount: number; orderName: string }[];
}
interface Summary {
  totalOrders: number;
  uniqueCustomers: number;
  repeatCustomers: number;
  repeatRate: number;
  avgOrderValue: number;
  guestOrders: number;
  guestRevenue: number;
  totalRevenue: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

function riskBadge(days: number) {
  if (days <= 30)  return { label: "Active",    cls: "bg-emerald-900/40 text-emerald-400" };
  if (days <= 60)  return { label: "Watching",  cls: "bg-yellow-900/40 text-yellow-400" };
  if (days <= 90)  return { label: "At Risk",   cls: "bg-orange-900/40 text-orange-400" };
  return               { label: "Lapsed",    cls: "bg-red-900/40 text-red-400" };
}

function segmentBadge(c: Customer) {
  if (c.isProlinePro) return { label: "Proline Pro", cls: "bg-purple-900/40 text-purple-400 border border-purple-700/30" };
  if (c.totalSpend >= 2000) return { label: "VIP", cls: "bg-amber-900/40 text-amber-400 border border-amber-700/30" };
  if (c.orderCount > 1)     return { label: "Repeat", cls: "bg-blue-900/40 text-blue-400 border border-blue-700/30" };
  return null;
}

type SegmentFilter = "all" | "proline-pro" | "vip" | "repeat" | "at-risk" | "new";

// ── Component ─────────────────────────────────────────────────────────────────
export default function CustomerDirectoryPage() {
  const [rangeKey, setRangeKey] = useState<RangeKey>("30d");
  const [data, setData] = useState<{ summary: Summary; customers: Customer[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [segment, setSegment] = useState<SegmentFilter>("all");
  const [stateFilter, setStateFilter] = useState("all");
  const [expanded, setExpanded] = useState<number | null>(null);
  const [sortBy, setSortBy] = useState<"spend" | "orders" | "days">("spend");

  useEffect(() => {
    const range = getRange(rangeKey);
    setLoading(true);
    setError("");
    setExpanded(null);
    fetch(`/api/shopify/customers?start=${range.start}&end=${range.end}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) throw new Error(d.error);
        setData(d);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [rangeKey]);

  const s = data?.summary;
  const range = getRange(rangeKey);

  // Unique states for filter dropdown
  const states = useMemo(() => {
    const seen = new Set<string>();
    const result: { code: string; name: string }[] = [];
    for (const c of data?.customers ?? []) {
      if (c.stateCode && !seen.has(c.stateCode)) {
        seen.add(c.stateCode);
        result.push({ code: c.stateCode, name: c.state ?? c.stateCode });
      }
    }
    return result.sort((a, b) => a.name.localeCompare(b.name));
  }, [data]);

  const filtered = useMemo(() => {
    let list = data?.customers ?? [];

    if (segment === "proline-pro") list = list.filter(c => c.isProlinePro);
    else if (segment === "vip")    list = list.filter(c => c.totalSpend >= 2000 && !c.isProlinePro);
    else if (segment === "repeat") list = list.filter(c => c.orderCount > 1);
    else if (segment === "at-risk")list = list.filter(c => c.daysSinceLastOrder > 60);
    else if (segment === "new")    list = list.filter(c => c.orderCount === 1);

    if (stateFilter !== "all") list = list.filter(c => c.stateCode === stateFilter);

    if (search) {
      const q = search.toLowerCase();
      list = list.filter(c =>
        c.name.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q) ||
        (c.state ?? "").toLowerCase().includes(q)
      );
    }

    return [...list].sort((a, b) => {
      if (sortBy === "orders") return b.orderCount - a.orderCount;
      if (sortBy === "days")   return b.daysSinceLastOrder - a.daysSinceLastOrder;
      return b.totalSpend - a.totalSpend;
    });
  }, [data, segment, stateFilter, search, sortBy]);

  // Segment counts for filter tabs
  const counts = useMemo(() => {
    const all = data?.customers ?? [];
    return {
      all: all.length,
      "proline-pro": all.filter(c => c.isProlinePro).length,
      vip: all.filter(c => c.totalSpend >= 2000 && !c.isProlinePro).length,
      repeat: all.filter(c => c.orderCount > 1).length,
      "at-risk": all.filter(c => c.daysSinceLastOrder > 60).length,
      new: all.filter(c => c.orderCount === 1).length,
    };
  }, [data]);

  const SEGMENTS: { key: SegmentFilter; label: string; color?: string }[] = [
    { key: "all",         label: "All" },
    { key: "proline-pro", label: "Proline Pro",  color: "purple" },
    { key: "vip",         label: "VIP ($2k+)",   color: "amber" },
    { key: "repeat",      label: "Repeat",       color: "blue" },
    { key: "at-risk",     label: "At Risk",      color: "orange" },
    { key: "new",         label: "New",          color: "emerald" },
  ];

  const segmentActiveClass: Record<string, string> = {
    purple:  "bg-purple-600/20 text-purple-400 border border-purple-600/30",
    amber:   "bg-amber-600/20 text-amber-400 border border-amber-600/30",
    blue:    "bg-blue-600/20 text-blue-400 border border-blue-600/30",
    orange:  "bg-orange-600/20 text-orange-400 border border-orange-600/30",
    emerald: "bg-emerald-600/20 text-emerald-400 border border-emerald-600/30",
  };

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Customer Directory</h1>
          <p className="text-gray-400 mt-1">Individual customer lookup — segments, spend, risk status</p>
          <div className="mt-2 inline-flex items-center gap-2 bg-green-900/20 border border-green-700/30 rounded-lg px-3 py-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            <span className="text-green-400 text-xs font-medium">Shopify Live</span>
          </div>
        </div>
        <DateRangeDropdown value={rangeKey} onChange={setRangeKey} />
      </div>

      {error && <div className="text-red-400 bg-red-900/20 rounded-lg p-4 text-sm">{error}</div>}
      {loading && (
        <div className="space-y-6">
          <KPISkeleton count={4} />
          <TableSkeleton rows={12} cols={9} />
        </div>
      )}

      {!loading && s && (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-gray-900 border border-blue-800/40 rounded-xl p-5">
              <div className="text-xs text-blue-400 uppercase tracking-wider mb-1">Unique Customers</div>
              <div className="text-2xl font-bold text-white">{s.uniqueCustomers.toLocaleString()}</div>
              <div className="text-xs text-gray-500 mt-1">{range.label}</div>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Repeat Rate</div>
              <div className="text-2xl font-bold text-white">{s.repeatRate}%</div>
              <div className="text-xs text-gray-500 mt-1">{s.repeatCustomers} repeat buyers</div>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Avg Order Value</div>
              <div className="text-2xl font-bold text-white">{fmt(s.avgOrderValue)}</div>
              <div className="text-xs text-gray-500 mt-1">{s.totalOrders} orders</div>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Guest Checkouts</div>
              <div className="text-2xl font-bold text-white">{s.guestOrders}</div>
              <div className="text-xs text-gray-500 mt-1">{fmt(s.guestRevenue)} revenue</div>
            </div>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap gap-3 items-center">
            {/* Search */}
            <div className="relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                placeholder="Search name, email, or state…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="bg-gray-800 border border-gray-700 rounded-lg pl-9 pr-4 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 w-64"
              />
            </div>

            {/* Segment tabs */}
            <div className="flex gap-1 bg-gray-900 border border-gray-800 rounded-lg p-1">
              {SEGMENTS.map(seg => {
                const isActive = segment === seg.key;
                const activeClass = seg.color ? segmentActiveClass[seg.color] : "bg-blue-600 text-white";
                return (
                  <button
                    key={seg.key}
                    onClick={() => setSegment(seg.key)}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                      isActive ? (seg.color ? segmentActiveClass[seg.color] : "bg-blue-600 text-white") : "text-gray-400 hover:text-white"
                    } ${!isActive && seg.color === "orange" && counts["at-risk"] > 0 ? "text-orange-400" : ""}`}
                  >
                    {seg.label}
                    <span className={`ml-1.5 text-xs opacity-70`}>{counts[seg.key]}</span>
                  </button>
                );
              })}
            </div>

            {/* State filter */}
            {states.length > 0 && (
              <select
                value={stateFilter}
                onChange={e => setStateFilter(e.target.value)}
                className="bg-gray-800 border border-gray-700 text-gray-300 text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500"
              >
                <option value="all">All States</option>
                {states.map(st => (
                  <option key={st.code} value={st.code}>{st.name}</option>
                ))}
              </select>
            )}

            {/* Sort */}
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value as typeof sortBy)}
              className="bg-gray-800 border border-gray-700 text-gray-300 text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500"
            >
              <option value="spend">Sort: Top Spend</option>
              <option value="orders">Sort: Most Orders</option>
              <option value="days">Sort: Most Inactive</option>
            </select>
          </div>

          {/* Table */}
          <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-white">
                {segment === "all" ? "All Customers" :
                 segment === "proline-pro" ? "Proline Pro Members" :
                 segment === "vip" ? "VIP Customers ($2k+)" :
                 segment === "repeat" ? "Repeat Buyers" :
                 segment === "at-risk" ? "At-Risk Customers (60+ days inactive)" :
                 "First-Time Buyers"} — {range.label}
              </h2>
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-500">{filtered.length} customers</span>
                <button
                  onClick={() => exportToCSV(
                    filtered.map(c => ({
                      Name: c.name, Email: c.email, State: c.state ?? "",
                      Channel: c.channel, "Proline Pro": c.isProlinePro ? "Yes" : "No",
                      Orders: c.orderCount, "Total Spend": c.totalSpend,
                      AOV: c.orderCount > 0 ? (c.totalSpend / c.orderCount).toFixed(2) : "0",
                      "First Order": c.firstOrder, "Last Order": c.lastOrder,
                      "Days Since Last": c.daysSinceLastOrder,
                    })),
                    `proline-customers-${range.start}-${range.end}`
                  )}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg text-xs text-gray-300 hover:text-white transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Export CSV
                </button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10">
                  <tr className="text-gray-500 text-xs uppercase tracking-wider bg-gray-800 border-b border-gray-800">
                    <th className="py-3 px-4 text-left">Customer</th>
                    <th className="py-3 px-4 text-left">Email</th>
                    <th className="py-3 px-4 text-left">State</th>
                    <th className="py-3 px-4 text-left">Channel</th>
                    <th className="py-3 px-4 text-right">Orders</th>
                    <th className="py-3 px-4 text-right text-green-400">Total Spend</th>
                    <th className="py-3 px-4 text-right">AOV</th>
                    <th className="py-3 px-4 text-left">Last Order</th>
                    <th className="py-3 px-4 text-left">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {filtered.map(c => {
                    const seg = segmentBadge(c);
                    const risk = riskBadge(c.daysSinceLastOrder);
                    const isOpen = expanded === c.id;
                    return (
                      <>
                        <tr
                          key={c.id}
                          onClick={() => setExpanded(isOpen ? null : c.id)}
                          className={`text-gray-300 hover:bg-gray-800/40 cursor-pointer transition-colors ${isOpen ? "bg-gray-800/30" : ""}`}
                        >
                          <td className="py-2.5 px-4 font-medium text-white whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              {c.name || <span className="text-gray-500 italic">Guest</span>}
                              {seg && (
                                <span className={`text-xs px-1.5 py-0.5 rounded-full ${seg.cls}`}>{seg.label}</span>
                              )}
                              {!seg && c.orderCount > 1 && (
                                <span className="text-xs px-1.5 py-0.5 rounded-full bg-blue-900/40 text-blue-400">{c.orderCount}x</span>
                              )}
                            </div>
                          </td>
                          <td className="py-2.5 px-4 text-gray-400 text-xs">{c.email}</td>
                          <td className="py-2.5 px-4 text-gray-400 text-xs">{c.state ?? <span className="text-gray-600">—</span>}</td>
                          <td className="py-2.5 px-4 text-xs">
                            <span className="text-gray-400">{c.channel}</span>
                          </td>
                          <td className="py-2.5 px-4 text-right">{c.orderCount}</td>
                          <td className="py-2.5 px-4 text-right text-green-400 font-semibold">{fmt(c.totalSpend)}</td>
                          <td className="py-2.5 px-4 text-right text-gray-400">{fmt(c.orderCount > 0 ? c.totalSpend / c.orderCount : 0)}</td>
                          <td className="py-2.5 px-4 text-gray-500 text-xs whitespace-nowrap">
                            {c.lastOrder}
                            {c.daysSinceLastOrder > 0 && (
                              <span className="ml-1 text-gray-600">({c.daysSinceLastOrder}d ago)</span>
                            )}
                          </td>
                          <td className="py-2.5 px-4">
                            <span className={`text-xs px-2 py-0.5 rounded-full ${risk.cls}`}>{risk.label}</span>
                          </td>
                        </tr>
                        {/* Expanded order history */}
                        {isOpen && (
                          <tr key={`${c.id}-expanded`} className="bg-gray-800/20">
                            <td colSpan={9} className="px-6 py-4">
                              <div className="text-xs text-gray-400 mb-2 font-medium uppercase tracking-wider">Order History</div>
                              <div className="flex flex-wrap gap-2">
                                {c.recentOrders
                                  .sort((a, b) => b.date.localeCompare(a.date))
                                  .map((o, i) => (
                                    <div key={i} className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-xs">
                                      <div className="text-gray-300 font-medium">{o.orderName}</div>
                                      <div className="text-green-400">{fmt(o.amount)}</div>
                                      <div className="text-gray-500">{o.date}</div>
                                    </div>
                                  ))
                                }
                                {c.orderCount > 10 && (
                                  <div className="text-gray-600 text-xs self-center">+{c.orderCount - 10} more orders</div>
                                )}
                              </div>
                              <div className="mt-3 text-xs text-gray-600">
                                First order: {c.firstOrder} · Lifetime spend: {fmt(c.totalSpend)} · {c.state ?? "State unknown"} · via {c.channel}
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {filtered.length === 0 && !loading && (
              <div className="py-12 text-center text-gray-500 text-sm">No customers match these filters.</div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
