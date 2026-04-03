"use client";

import { useState } from "react";
import MetricCard from "@/components/MetricCard";

// This will be replaced with live Google Sheets data once CFO sheet is built
// Structure is ready — just needs the sheet ID added to env vars

interface Expense {
  id: number;
  category: string;
  name: string;
  amount: number;
  frequency: "monthly" | "annual" | "one-time";
  vendor: string;
  notes: string;
}

const mockExpenses: Expense[] = [
  { id: 1, category: "Software", name: "Shopify Plus", amount: 2300, frequency: "monthly", vendor: "Shopify", notes: "" },
  { id: 2, category: "Software", name: "Google Workspace", amount: 180, frequency: "monthly", vendor: "Google", notes: "~20 users" },
  { id: 3, category: "Software", name: "Klaviyo", amount: 800, frequency: "monthly", vendor: "Klaviyo", notes: "Email marketing" },
  { id: 4, category: "Software", name: "Gorgias", amount: 350, frequency: "monthly", vendor: "Gorgias", notes: "Customer support" },
  { id: 5, category: "Software", name: "Yotpo", amount: 500, frequency: "monthly", vendor: "Yotpo", notes: "Reviews" },
  { id: 6, category: "Software", name: "Other SaaS tools", amount: 1200, frequency: "monthly", vendor: "Various", notes: "" },
  { id: 7, category: "Operations", name: "Warehouse Lease", amount: 8000, frequency: "monthly", vendor: "Landlord", notes: "" },
  { id: 8, category: "Operations", name: "Utilities", amount: 1200, frequency: "monthly", vendor: "Various", notes: "" },
  { id: 9, category: "Operations", name: "Phone System", amount: 400, frequency: "monthly", vendor: "Various", notes: "" },
  { id: 10, category: "Operations", name: "Shipping Supplies", amount: 2800, frequency: "monthly", vendor: "Various", notes: "" },
  { id: 11, category: "Insurance", name: "Business Insurance", amount: 2100, frequency: "monthly", vendor: "Provider", notes: "" },
  { id: 12, category: "Insurance", name: "Health Insurance", amount: 2000, frequency: "monthly", vendor: "Provider", notes: "~20 employees" },
];

const categories = ["All", "Software", "Operations", "Insurance"];

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

export default function ExpensesPage() {
  const [filter, setFilter] = useState("All");

  const filtered = filter === "All" ? mockExpenses : mockExpenses.filter(e => e.category === filter);
  const totalMonthly = mockExpenses.filter(e => e.frequency === "monthly").reduce((s, e) => s + e.amount, 0);
  const softwareTotal = mockExpenses.filter(e => e.category === "Software").reduce((s, e) => s + e.amount, 0);
  const opsTotal = mockExpenses.filter(e => e.category === "Operations").reduce((s, e) => s + e.amount, 0);

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Expenses</h1>
        <p className="text-gray-400 mt-1">Subscriptions, operations, insurance — monthly recurring costs</p>
        <div className="mt-2 inline-flex items-center gap-2 bg-yellow-900/20 border border-yellow-700/30 rounded-lg px-3 py-1.5">
          <span className="text-yellow-400 text-xs font-medium">Estimated data — connect CFO sheet to go live</span>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <MetricCard label="Total Monthly Expenses" value={fmt(totalMonthly)} subtext="Excl. payroll & ad spend" highlight />
        <MetricCard label="Annual Run Rate" value={fmt(totalMonthly * 12)} subtext="Projected" />
        <MetricCard label="Software & Tools" value={fmt(softwareTotal)} subtext={`${((softwareTotal / totalMonthly) * 100).toFixed(0)}% of expenses`} />
        <MetricCard label="Operations" value={fmt(opsTotal)} subtext={`${((opsTotal / totalMonthly) * 100).toFixed(0)}% of expenses`} />
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 mb-4">
        {categories.map(cat => (
          <button
            key={cat}
            onClick={() => setFilter(cat)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              filter === cat
                ? "bg-emerald-600/20 text-emerald-400"
                : "text-gray-400 hover:text-gray-100 hover:bg-gray-800"
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-500 text-xs uppercase tracking-wider bg-gray-800/50 border-b border-gray-800">
              <th className="py-3 px-4 text-left">Name</th>
              <th className="py-3 px-4 text-left">Category</th>
              <th className="py-3 px-4 text-left">Vendor</th>
              <th className="py-3 px-4 text-right">Monthly</th>
              <th className="py-3 px-4 text-right">Annual</th>
              <th className="py-3 px-4 text-left">Notes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {filtered.map(row => (
              <tr key={row.id} className="text-gray-300 hover:bg-gray-800/40">
                <td className="py-2.5 px-4 font-medium">{row.name}</td>
                <td className="py-2.5 px-4">
                  <span className="text-xs px-2 py-0.5 rounded-full bg-gray-800 text-gray-400">{row.category}</span>
                </td>
                <td className="py-2.5 px-4 text-gray-400">{row.vendor}</td>
                <td className="py-2.5 px-4 text-right text-white font-medium">{fmt(row.amount)}</td>
                <td className="py-2.5 px-4 text-right text-gray-400">{fmt(row.amount * 12)}</td>
                <td className="py-2.5 px-4 text-gray-500 text-xs">{row.notes}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-gray-700 bg-gray-800/50 font-semibold text-white">
              <td className="py-3 px-4" colSpan={3}>Total</td>
              <td className="py-3 px-4 text-right">{fmt(filtered.reduce((s, e) => s + e.amount, 0))}</td>
              <td className="py-3 px-4 text-right text-gray-400">{fmt(filtered.reduce((s, e) => s + e.amount, 0) * 12)}</td>
              <td className="py-3 px-4" />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
