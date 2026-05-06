"use client";

import { useState } from "react";
import Link from "next/link";
import {
  statements,
  monthRevenue,
  sumGroup,
  sumCategory,
  q1,
  CATEGORY_TEXT,
} from "@/lib/financial-data";
import CategoryDrillDown from "@/components/CategoryDrillDown";
import InfoTooltip from "@/components/InfoTooltip";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

export default function OperationalPage() {
  const [drillCategory, setDrillCategory] = useState<string | null>(null);

  const totalRevenue = q1.totalRevenue;
  const cogs = sumGroup("COGS");
  const grossProfit = totalRevenue - cogs;
  const grossMargin = (grossProfit / totalRevenue) * 100;

  // Cost ratios — every dollar of revenue, how many cents go to each bucket?
  const ratios = [
    { label: "Factory / Inventory (COGS)", category: "Factory / Inventory (COGS)", amount: sumCategory("Factory / Inventory (COGS)") },
    { label: "Import & Customs", category: "Import & Customs", amount: sumCategory("Import & Customs") },
    { label: "Shipping & Freight", category: "Shipping & Freight", amount: sumCategory("Shipping & Freight") },
    { label: "Digital Advertising", category: "Digital Advertising", amount: sumCategory("Digital Advertising") },
    { label: "Marketing Services", category: "Marketing Services", amount: sumCategory("Marketing Services") },
    { label: "Payroll", category: "Payroll", amount: sumCategory("Payroll") },
    { label: "Rent", category: "Rent", amount: sumCategory("Rent") },
    { label: "SaaS & Software", category: "SaaS & Software", amount: sumCategory("SaaS & Software") },
  ]
    .map(r => ({ ...r, pct: (r.amount / totalRevenue) * 100 }))
    .sort((a, b) => b.amount - a.amount);

  const totalAdSpend = sumCategory("Digital Advertising") + sumCategory("Marketing Services");
  const cacProxyPct = (totalAdSpend / totalRevenue) * 100; // marketing spend per revenue dollar

  // Monthly series for trend chart
  const series = statements.map(m => {
    const rev = monthRevenue(m);
    const marketing = sumCategory("Digital Advertising", m) + sumCategory("Marketing Services", m);
    const freight = sumCategory("Shipping & Freight", m);
    const payroll = sumCategory("Payroll", m);
    return {
      label: `${m.shortMonth} ${m.year}`,
      marketingPct: rev === 0 ? 0 : (marketing / rev) * 100,
      freightPct: rev === 0 ? 0 : (freight / rev) * 100,
      payrollPct: rev === 0 ? 0 : (payroll / rev) * 100,
    };
  });

  return (
    <div className="p-6 space-y-6">
      <CategoryDrillDown category={drillCategory} onClose={() => setDrillCategory(null)} />

      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-emerald-900/40 border border-emerald-800/40 flex items-center justify-center text-xl">⚙️</div>
        <div>
          <div className="flex items-center">
            <h1 className="text-2xl font-bold text-white">Operational Performance</h1>
            <InfoTooltip title="Operational Performance">
              <p className="mb-2">This page measures how efficiently the business turns revenue into profit — the core CFO question of &quot;for every $1 we sell, where does it go?&quot;</p>
              <p className="mb-2"><strong>Gross margin</strong> = revenue minus cost of goods (factory + import + freight). What&apos;s left to cover everything else. <strong>Marketing/Revenue</strong>, <strong>Freight/Revenue</strong>, <strong>Payroll/Revenue</strong> are cost ratios — each shown as a percentage of sales so you can see if any line is creeping up over time.</p>
              <p>Why it matters: revenue can grow while margin shrinks. These ratios catch that early.</p>
            </InfoTooltip>
          </div>
          <p className="text-gray-500 text-sm mt-0.5">Q1 2026 cost ratios and operational KPIs</p>
        </div>
      </div>

      {/* CFO-lens KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Gross Margin" value={`${grossMargin.toFixed(1)}%`} sub={`${fmt(grossProfit)} on ${fmt(totalRevenue)} revenue`} color={grossMargin >= 40 ? "text-emerald-400" : "text-yellow-400"} />
        <KpiCard label="Marketing / Revenue" value={`${cacProxyPct.toFixed(1)}%`} sub={`${fmt(totalAdSpend)} ads + marketing services`} color={cacProxyPct <= 10 ? "text-emerald-400" : cacProxyPct <= 20 ? "text-yellow-400" : "text-red-400"} />
        <KpiCard label="Freight / Revenue" value={`${((sumCategory("Shipping & Freight") / totalRevenue) * 100).toFixed(1)}%`} sub={`${fmt(sumCategory("Shipping & Freight"))} outbound shipping`} color="text-cyan-400" />
        <KpiCard label="Payroll / Revenue" value={`${((sumCategory("Payroll") / totalRevenue) * 100).toFixed(1)}%`} sub={`${fmt(sumCategory("Payroll"))} via CBIZ`} color="text-purple-400" />
      </div>

      {/* Cost ratio bars */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-800">
          <h2 className="text-sm font-semibold text-white">Cost Ratios — Where Each Dollar of Revenue Goes</h2>
          <p className="text-xs text-gray-500 mt-0.5">Click any bar to see the underlying transactions</p>
        </div>
        <div className="p-5 space-y-3">
          {ratios.map(r => (
            <button
              key={r.category}
              onClick={() => setDrillCategory(r.category)}
              className="w-full text-left hover:bg-gray-800/40 rounded-lg p-2 -mx-2 transition-colors group"
            >
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className={`${CATEGORY_TEXT[r.category] ?? "text-gray-400"} group-hover:underline font-medium`}>
                  {r.label}
                </span>
                <span className="text-white font-semibold">
                  {fmt(r.amount)} <span className="text-gray-500 font-normal">· {r.pct.toFixed(1)}% of revenue</span>
                </span>
              </div>
              <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-600 to-emerald-400"
                  style={{ width: `${Math.min(r.pct * 3, 100)}%` }}
                />
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Trend chart */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-white mb-4">Cost Ratio Trends by Month</h2>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={series}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis dataKey="label" stroke="#6b7280" fontSize={12} />
              <YAxis stroke="#6b7280" fontSize={12} tickFormatter={(v) => `${Number(v).toFixed(0)}%`} />
              <Tooltip
                contentStyle={{ backgroundColor: "#111827", border: "1px solid #374151", borderRadius: 8 }}
                labelStyle={{ color: "#e5e7eb" }}
                formatter={(v) => `${Number(v).toFixed(1)}%`}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="marketingPct" stroke="#ef4444" strokeWidth={2} dot={{ fill: "#ef4444", r: 3 }} name="Marketing %" />
              <Line type="monotone" dataKey="freightPct" stroke="#06b6d4" strokeWidth={2} dot={{ fill: "#06b6d4", r: 3 }} name="Freight %" />
              <Line type="monotone" dataKey="payrollPct" stroke="#a855f7" strokeWidth={2} dot={{ fill: "#a855f7", r: 3 }} name="Payroll %" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Linkouts to detailed analytics */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-white mb-3">For SKU-level and channel-level detail</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <LinkCard
            href="/dashboard/products"
            title="Product Profitability"
            description="Per-SKU gross margin, refund rate, and COGS breakdown"
            icon="📦"
          />
          <LinkCard
            href="/dashboard/products/ads"
            title="Ad Performance by Product"
            description="ROAS, CTR, CPC, and net profit per Google Shopping product"
            icon="🎯"
          />
          <LinkCard
            href="/dashboard/customers/acquisition"
            title="Customer Acquisition"
            description="CAC by channel, LTV, and retention cohorts"
            icon="👥"
          />
        </div>
      </div>

      {/* What's next */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-white mb-3">Coming to this page</h2>
        <ul className="text-sm text-gray-400 space-y-1.5 list-disc list-inside">
          <li>Channel P&amp;L split — Shopify direct vs Ferguson marketplace vs Amazon</li>
          <li>Inventory turns and days-of-inventory (needs SKU-level inventory value)</li>
          <li>Working capital ratios (A/R days, A/P days, cash conversion cycle)</li>
          <li>Blended CAC and LTV with payback period</li>
          <li>Return rate with dollar impact</li>
        </ul>
      </div>
    </div>
  );
}

function KpiCard({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
      <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">{label}</div>
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      <div className="text-xs text-gray-500 mt-1">{sub}</div>
    </div>
  );
}

function LinkCard({ href, title, description, icon }: { href: string; title: string; description: string; icon: string }) {
  return (
    <Link href={href} className="block bg-gray-800/40 hover:bg-gray-800/70 border border-gray-800 rounded-lg p-4 transition-colors group">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-lg">{icon}</span>
        <span className="text-white font-medium text-sm group-hover:text-emerald-400 transition-colors">{title}</span>
      </div>
      <div className="text-xs text-gray-400 leading-relaxed">{description}</div>
      <div className="text-xs text-emerald-400 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">Open →</div>
    </Link>
  );
}
