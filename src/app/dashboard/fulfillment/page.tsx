"use client";

import { useEffect, useState } from "react";
import MetricCard from "@/components/MetricCard";

interface UnfulfilledOrder {
  name: string;
  customer: string;
  orderDate: string;
  daysWaiting: number;
  total: number;
  items: string;
}
interface Summary {
  totalOrders: number;
  unfulfilled: number;
  partial: number;
  fulfilled: number;
  avgFulfillmentHours: number;
  fulfillmentRate: number;
}

function fmt(n: number) { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n); }

export default function FulfillmentPage() {
  const [data, setData] = useState<{ summary: Summary; unfulfilledOrders: UnfulfilledOrder[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/shopify/fulfillment")
      .then(r => r.json())
      .then(d => { if (d.error) throw new Error(d.error); setData(d); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, []);

  const avgDays = data ? (data.summary.avgFulfillmentHours / 24).toFixed(1) : "—";

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Order Fulfillment</h1>
        <p className="text-gray-400 mt-1">Last 30 days — fulfillment status and pending orders</p>
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
            <MetricCard label="Unfulfilled" value={data.summary.unfulfilled.toString()} subtext="Needs action" highlight={data.summary.unfulfilled > 0} trend={data.summary.unfulfilled > 5 ? "down" : undefined} />
            <MetricCard label="Partially Fulfilled" value={data.summary.partial.toString()} subtext="In progress" />
            <MetricCard label="Fulfilled" value={data.summary.fulfilled.toString()} subtext={`${data.summary.fulfillmentRate.toFixed(1)}% rate`} />
            <MetricCard label="Avg Fulfillment Time" value={`${avgDays}d`} subtext={`${data.summary.avgFulfillmentHours}h avg`} />
          </div>

          {/* Fulfillment status bar */}
          <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 mb-6">
            <h2 className="text-sm font-semibold text-white mb-4">Order Status Breakdown — Last 30 Days</h2>
            <div className="flex rounded-full h-4 overflow-hidden mb-3">
              {data.summary.fulfilled > 0 && (
                <div className="bg-green-500 h-full" style={{ width: `${(data.summary.fulfilled / data.summary.totalOrders) * 100}%` }} />
              )}
              {data.summary.partial > 0 && (
                <div className="bg-yellow-500 h-full" style={{ width: `${(data.summary.partial / data.summary.totalOrders) * 100}%` }} />
              )}
              {data.summary.unfulfilled > 0 && (
                <div className="bg-red-500 h-full" style={{ width: `${(data.summary.unfulfilled / data.summary.totalOrders) * 100}%` }} />
              )}
            </div>
            <div className="flex gap-6 text-xs text-gray-400">
              <span><span className="inline-block w-2 h-2 rounded-full bg-green-500 mr-1.5" />Fulfilled: {data.summary.fulfilled}</span>
              <span><span className="inline-block w-2 h-2 rounded-full bg-yellow-500 mr-1.5" />Partial: {data.summary.partial}</span>
              <span><span className="inline-block w-2 h-2 rounded-full bg-red-500 mr-1.5" />Unfulfilled: {data.summary.unfulfilled}</span>
            </div>
          </div>

          {/* Unfulfilled orders table */}
          {data.unfulfilledOrders.length > 0 ? (
            <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-white">Unfulfilled Orders</h2>
                <span className="text-xs text-red-400 font-medium">{data.unfulfilledOrders.length} pending</span>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-gray-500 text-xs uppercase tracking-wider bg-gray-800/50 border-b border-gray-800">
                    <th className="py-3 px-4 text-left">Order</th>
                    <th className="py-3 px-4 text-left">Customer</th>
                    <th className="py-3 px-4 text-left">Order Date</th>
                    <th className="py-3 px-4 text-right">Days Waiting</th>
                    <th className="py-3 px-4 text-right">Total</th>
                    <th className="py-3 px-4 text-left">Items</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {data.unfulfilledOrders.map(order => (
                    <tr key={order.name} className="text-gray-300 hover:bg-gray-800/40">
                      <td className="py-2.5 px-4 font-medium text-blue-400">{order.name}</td>
                      <td className="py-2.5 px-4">{order.customer}</td>
                      <td className="py-2.5 px-4 text-gray-400">{order.orderDate}</td>
                      <td className="py-2.5 px-4 text-right">
                        <span className={`font-medium ${order.daysWaiting > 5 ? "text-red-400" : order.daysWaiting > 2 ? "text-yellow-400" : "text-gray-300"}`}>
                          {order.daysWaiting}d
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-right">{fmt(order.total)}</td>
                      <td className="py-2.5 px-4 text-gray-400 text-xs truncate max-w-xs">{order.items}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="bg-gray-900 rounded-xl border border-gray-800 p-8 text-center">
              <div className="text-green-400 text-3xl mb-2">✓</div>
              <p className="text-white font-medium">All orders fulfilled</p>
              <p className="text-gray-400 text-sm mt-1">No pending orders in the last 30 days</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
