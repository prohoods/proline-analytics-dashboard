"use client";

import { useEffect, useState } from "react";
import MetricCard from "@/components/MetricCard";

interface RefundItem { title: string; sku: string; quantity: number; subtotal: number; }
interface Refund {
  orderId: string;
  orderName: string;
  refundDate: string;
  orderDate: string;
  customer: string;
  items: RefundItem[];
  refundAmount: number;
  note: string;
}
interface Summary { totalRefunded: number; totalOrders: number; totalItemsRefunded: number; refundCount: number; }

function fmt(n: number) { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n); }
function fmtExact(n: number) { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(n); }

const RANGES = [
  { label: "Last 30 days", days: 30 },
  { label: "Last 60 days", days: 60 },
  { label: "Last 90 days", days: 90 },
  { label: "YTD", days: 0 },
];

export default function RefundsPage() {
  const [range, setRange] = useState(30);
  const [refunds, setRefunds] = useState<Refund[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    setLoading(true);
    setError("");
    const end = new Date();
    const start = new Date();
    if (range === 0) {
      start.setMonth(0); start.setDate(1); // Jan 1
    } else {
      start.setDate(start.getDate() - range);
    }
    const fmt = (d: Date) => d.toISOString().substring(0, 10);
    fetch(`/api/shopify/refunds?start=${fmt(start)}&end=${fmt(end)}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) throw new Error(d.error);
        setRefunds(d.refunds);
        setSummary(d.summary);
        setLoading(false);
      })
      .catch(e => { setError(e.message); setLoading(false); });
  }, [range]);

  const filtered = search
    ? refunds.filter(r =>
        r.orderName.toLowerCase().includes(search.toLowerCase()) ||
        r.customer.toLowerCase().includes(search.toLowerCase()) ||
        r.items.some(i => i.title.toLowerCase().includes(search.toLowerCase()))
      )
    : refunds;

  return (
    <div className="p-8">
      <div className="mb-6 flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Shopify Refunds</h1>
          <p className="text-gray-400 mt-1">Order-level refund detail — direct from Shopify API</p>
          <div className="mt-2 inline-flex items-center gap-2 bg-green-900/20 border border-green-700/30 rounded-lg px-3 py-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
            <span className="text-green-400 text-xs font-medium">Live — Shopify API</span>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          {RANGES.map(r => (
            <button key={r.days} onClick={() => setRange(r.days)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${range === r.days ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-400 hover:text-white"}`}>
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {loading && <div className="text-gray-400">Loading...</div>}
      {error && <div className="text-red-400 bg-red-900/20 rounded-lg p-4 mb-6 text-sm">{error}</div>}

      {!loading && !error && summary && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <MetricCard label="Total Refunded" value={fmt(summary.totalRefunded)} subtext="Selected period" highlight />
            <MetricCard label="Refund Count" value={summary.refundCount.toString()} subtext="Individual refunds" />
            <MetricCard label="Orders Affected" value={summary.totalOrders.toString()} subtext="Unique orders" />
            <MetricCard label="Items Refunded" value={summary.totalItemsRefunded.toString()} subtext="Total units" />
          </div>

          {/* Search */}
          <div className="mb-4">
            <input
              type="text"
              placeholder="Search by order, customer, or product..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full max-w-sm bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
            />
          </div>

          {filtered.length === 0 ? (
            <div className="bg-gray-900 rounded-xl border border-gray-800 p-8 text-center">
              <p className="text-gray-400">No refunds found for this period.</p>
            </div>
          ) : (
            <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-white">Refund Detail</h2>
                <span className="text-xs text-gray-500">{filtered.length} refunds — click to expand</span>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-gray-500 text-xs uppercase tracking-wider bg-gray-800/50 border-b border-gray-800">
                    <th className="py-3 px-4 text-left">Order</th>
                    <th className="py-3 px-4 text-left">Customer</th>
                    <th className="py-3 px-4 text-left">Refund Date</th>
                    <th className="py-3 px-4 text-left">Order Date</th>
                    <th className="py-3 px-4 text-right">Amount</th>
                    <th className="py-3 px-4 text-left">Note</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {filtered.map((refund, i) => {
                    const key = `${refund.orderId}-${i}`;
                    return (
                      <>
                        <tr key={key} className="text-gray-300 cursor-pointer hover:bg-gray-800/40"
                          onClick={() => setExpanded(expanded === key ? null : key)}>
                          <td className="py-2.5 px-4 font-medium text-blue-400">{refund.orderName}</td>
                          <td className="py-2.5 px-4">{refund.customer}</td>
                          <td className="py-2.5 px-4 text-gray-400">{refund.refundDate}</td>
                          <td className="py-2.5 px-4 text-gray-500">{refund.orderDate}</td>
                          <td className="py-2.5 px-4 text-right text-red-400 font-medium">({fmtExact(refund.refundAmount)})</td>
                          <td className="py-2.5 px-4 text-gray-500 text-xs">{refund.note || "—"}</td>
                        </tr>
                        {expanded === key && refund.items.length > 0 && (
                          <tr key={`${key}-exp`}>
                            <td colSpan={6} className="bg-gray-800/30 px-6 py-3">
                              <div className="text-xs text-gray-500 uppercase tracking-wider mb-2">Refunded Items</div>
                              <div className="space-y-1">
                                {refund.items.map((item, j) => (
                                  <div key={j} className="flex items-center justify-between text-xs">
                                    <div className="text-white">{item.title}</div>
                                    <div className="flex items-center gap-6 text-gray-400">
                                      {item.sku && <span className="text-gray-600">SKU: {item.sku}</span>}
                                      <span>Qty: {item.quantity}</span>
                                      <span className="text-red-400">({fmtExact(item.subtotal)})</span>
                                    </div>
                                  </div>
                                ))}
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
          )}
        </>
      )}
    </div>
  );
}
