"use client";

import { useEffect, useState } from "react";
import MetricCard from "@/components/MetricCard";

interface Customer {
  id: number;
  name: string;
  email: string;
  orderCount: number;
  totalSpend: number;
  firstOrder: string;
  lastOrder: string;
}
interface Summary {
  totalOrders: number;
  uniqueCustomers: number;
  repeatCustomers: number;
  repeatRate: number;
  avgOrderValue: number;
  guestOrders: number;
  totalRevenue: number;
}

function fmt(n: number) { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n); }

export default function CustomersPage() {
  const [data, setData] = useState<{ summary: Summary; topCustomers: Customer[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "repeat">("all");

  useEffect(() => {
    fetch("/api/shopify/customers")
      .then(r => r.json())
      .then(d => { if (d.error) throw new Error(d.error); setData(d); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, []);

  const filtered = (data?.topCustomers ?? [])
    .filter(c => filter === "all" || c.orderCount > 1)
    .filter(c => !search || c.name.toLowerCase().includes(search.toLowerCase()) || c.email.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Customer Insights</h1>
        <p className="text-gray-400 mt-1">Last 90 days — repeat customers, AOV, top spenders</p>
        <div className="mt-2 inline-flex items-center gap-2 bg-green-900/20 border border-green-700/30 rounded-lg px-3 py-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
          <span className="text-green-400 text-xs font-medium">Live — Shopify API</span>
        </div>
      </div>

      {loading && <div className="text-gray-400">Loading...</div>}
      {error && <div className="text-red-400 bg-red-900/20 rounded-lg p-4 mb-6 text-sm">{error}</div>}

      {!loading && !error && data && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <MetricCard label="Unique Customers" value={data.summary.uniqueCustomers.toString()} subtext="Last 90 days" highlight />
            <MetricCard label="Repeat Rate" value={`${data.summary.repeatRate}%`} subtext={`${data.summary.repeatCustomers} repeat buyers`} trend="up" />
            <MetricCard label="Avg Order Value" value={fmt(data.summary.avgOrderValue)} subtext={`${data.summary.totalOrders} orders`} />
            <MetricCard label="Guest Orders" value={data.summary.guestOrders.toString()} subtext="No account" />
          </div>

          {/* Filters */}
          <div className="flex flex-wrap gap-3 mb-4">
            <input
              type="text"
              placeholder="Search by name or email..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
            />
            <div className="flex gap-2">
              {[{ key: "all", label: "All Customers" }, { key: "repeat", label: "Repeat Only" }].map(f => (
                <button key={f.key} onClick={() => setFilter(f.key as "all" | "repeat")}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${filter === f.key ? "bg-blue-600/20 text-blue-400 border border-blue-600/30" : "text-gray-400 hover:text-gray-100 hover:bg-gray-800"}`}>
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-white">Top Customers — Last 90 Days</h2>
              <span className="text-xs text-gray-500">{filtered.length} customers</span>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-500 text-xs uppercase tracking-wider bg-gray-800/50 border-b border-gray-800">
                  <th className="py-3 px-4 text-left">Customer</th>
                  <th className="py-3 px-4 text-left">Email</th>
                  <th className="py-3 px-4 text-right">Orders</th>
                  <th className="py-3 px-4 text-right">Total Spend</th>
                  <th className="py-3 px-4 text-right">Avg Order</th>
                  <th className="py-3 px-4 text-left">First Order</th>
                  <th className="py-3 px-4 text-left">Last Order</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {filtered.map(c => (
                  <tr key={c.id} className="text-gray-300 hover:bg-gray-800/40">
                    <td className="py-2.5 px-4 font-medium text-white">
                      {c.name}
                      {c.orderCount > 1 && (
                        <span className="ml-2 text-xs px-1.5 py-0.5 rounded-full bg-blue-900/40 text-blue-400">
                          {c.orderCount}x
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-4 text-gray-400 text-xs">{c.email}</td>
                    <td className="py-2.5 px-4 text-right">{c.orderCount}</td>
                    <td className="py-2.5 px-4 text-right text-green-400 font-medium">{fmt(c.totalSpend)}</td>
                    <td className="py-2.5 px-4 text-right text-gray-400">{fmt(c.totalSpend / c.orderCount)}</td>
                    <td className="py-2.5 px-4 text-gray-500">{c.firstOrder}</td>
                    <td className="py-2.5 px-4 text-gray-500">{c.lastOrder}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
