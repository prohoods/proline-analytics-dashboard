"use client";

import { useState } from "react";
import { q1, sumGroup } from "@/lib/financial-data";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}
function fmtM(n: number) {
  return `$${(n / 1_000_000).toFixed(2)}M`;
}

// Industry multiples for physical-product / e-com distributors (rough bands)
const MULTIPLE_BANDS = [
  { label: "Asset Sale (low)",  multiple: 2.0, description: "Distressed / asset-only buyer" },
  { label: "Small Business",    multiple: 3.5, description: "Individual buyer, SBA-backed" },
  { label: "PE Lower-Middle",   multiple: 5.0, description: "Add-on for a PE platform" },
  { label: "Strategic Buyer",   multiple: 6.5, description: "Industry competitor seeking synergy" },
  { label: "Premium Strategic", multiple: 8.0, description: "Unique IP, brand, or market position" },
];

const DEAL_ROOM_ITEMS = [
  { item: "3-year audited financials",       status: "missing",  blocker: "Need 2024 + 2025 P&Ls completed" },
  { item: "Monthly P&L, last 24 months",     status: "partial",  blocker: "Q1 2026 available; backfill 2024-2025 needed" },
  { item: "Balance sheet with A/R, A/P, Inv",status: "missing",  blocker: "No accrual accounting yet — need real accounting system" },
  { item: "Customer concentration analysis", status: "partial",  blocker: "Need to pull from Shopify + Ferguson" },
  { item: "Supplier / factory contracts",    status: "unknown",  blocker: "Need to gather from legal files" },
  { item: "Employment agreements + org chart", status: "unknown",  blocker: "Need HR export" },
  { item: "IP / trademarks",                 status: "unknown",  blocker: "Confirm with trademark attorney" },
  { item: "Tax returns (3 yrs)",             status: "unknown",  blocker: "Request from CPA" },
  { item: "Lease agreements",                status: "unknown",  blocker: "KWS Companies lease on file?" },
  { item: "Banking / loan agreements",       status: "partial",  blocker: "SBA Loan visible; need original docs" },
  { item: "Insurance policies",              status: "unknown",  blocker: "Need policy documents" },
  { item: "Key customer / supplier list",    status: "partial",  blocker: "Can derive from data, need formatted deliverable" },
];

export default function StrategicPage() {
  // EBITDA proxy — cash operating income (very rough, cash basis)
  const revenue = q1.totalRevenue;
  const cogs = sumGroup("COGS");
  const grossProfit = revenue - cogs;
  const opex = sumGroup("OpEx — Marketing") + sumGroup("OpEx — Personnel") + sumGroup("OpEx — Facilities & Logistics") + sumGroup("OpEx — G&A");
  const operatingIncome = grossProfit - opex;
  const ebitdaProxy = operatingIncome; // no D&A yet, so op income ≈ EBITDA
  const annualized = ebitdaProxy * 4;

  const [multiple, setMultiple] = useState(5.0);
  const [adjustments, setAdjustments] = useState({ ownerComp: 0, oneTime: 0 });

  const adjustedEbitda = annualized + adjustments.ownerComp + adjustments.oneTime;
  const valuation = adjustedEbitda * multiple;

  const valuationBands = MULTIPLE_BANDS.map(b => ({
    ...b,
    value: Math.max(0, adjustedEbitda * b.multiple),
  }));

  // Readiness score
  const readinessScores = {
    financials:   30, // cash-basis data, no audit
    accounting:   20, // no accrual system
    documentation: 40,
    customer:     60, // Shopify + Ferguson data available
    operations:   65, // inventory and fulfillment tracked
    legal:        30, // unknown state
  };
  const readinessScore = Math.round(Object.values(readinessScores).reduce((s, v) => s + v, 0) / Object.keys(readinessScores).length);

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-emerald-900/40 border border-emerald-800/40 flex items-center justify-center text-xl">🎯</div>
        <div>
          <h1 className="text-2xl font-bold text-white">M&amp;A / Strategic</h1>
          <p className="text-gray-500 text-sm mt-0.5">Valuation tracking, deal-room readiness, and strategic transaction preparation</p>
        </div>
      </div>

      {/* Valuation KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Annualized EBITDA (Proxy)" value={fmt(adjustedEbitda)} sub="Q1 operating income × 4, adjusted" color="text-emerald-400" />
        <KpiCard label="Current Multiple" value={`${multiple.toFixed(1)}×`} sub="Adjust below to see valuation" color="text-white" />
        <KpiCard label="Implied Valuation" value={valuation >= 1_000_000 ? fmtM(valuation) : fmt(valuation)} sub="EBITDA × multiple" color="text-emerald-400" />
        <KpiCard label="Exit Readiness Score" value={`${readinessScore}/100`} sub={readinessScore >= 70 ? "Ready for process" : readinessScore >= 50 ? "6+ months of prep needed" : "12+ months of prep needed"} color={readinessScore >= 70 ? "text-emerald-400" : readinessScore >= 50 ? "text-yellow-400" : "text-red-400"} />
      </div>

      {/* Valuation calculator */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-white mb-4">Valuation Calculator</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-5">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs text-gray-400 font-medium">Multiple (× EBITDA)</label>
              <span className="text-sm text-white font-semibold tabular-nums">{multiple.toFixed(1)}×</span>
            </div>
            <input
              type="range"
              min={1} max={10} step={0.5}
              value={multiple}
              onChange={(e) => setMultiple(parseFloat(e.target.value))}
              className="w-full h-1.5 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
            />
            <div className="flex items-center justify-between mt-1">
              <span className="text-[10px] text-gray-600">1×</span>
              <span className="text-[10px] text-gray-500 italic">Distress ← → Premium</span>
              <span className="text-[10px] text-gray-600">10×</span>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs text-gray-400 font-medium">Owner comp addback</label>
              <span className="text-sm text-white font-semibold tabular-nums">+{fmt(adjustments.ownerComp)}</span>
            </div>
            <input
              type="range"
              min={0} max={300000} step={5000}
              value={adjustments.ownerComp}
              onChange={(e) => setAdjustments(p => ({ ...p, ownerComp: parseInt(e.target.value) }))}
              className="w-full h-1.5 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
            />
            <div className="flex items-center justify-between mt-1">
              <span className="text-[10px] text-gray-600">$0</span>
              <span className="text-[10px] text-gray-500 italic">Excess owner salary vs market</span>
              <span className="text-[10px] text-gray-600">$300K</span>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs text-gray-400 font-medium">One-time addbacks</label>
              <span className="text-sm text-white font-semibold tabular-nums">+{fmt(adjustments.oneTime)}</span>
            </div>
            <input
              type="range"
              min={0} max={500000} step={10000}
              value={adjustments.oneTime}
              onChange={(e) => setAdjustments(p => ({ ...p, oneTime: parseInt(e.target.value) }))}
              className="w-full h-1.5 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
            />
            <div className="flex items-center justify-between mt-1">
              <span className="text-[10px] text-gray-600">$0</span>
              <span className="text-[10px] text-gray-500 italic">Legal, moving, Avalara backfile</span>
              <span className="text-[10px] text-gray-600">$500K</span>
            </div>
          </div>
        </div>

        {/* Valuation bridge */}
        <div className="bg-gray-800/40 rounded-lg p-4 border border-gray-800">
          <div className="text-xs text-gray-500 uppercase tracking-wider mb-3">Valuation Bridge</div>
          <div className="space-y-2 text-sm">
            <BridgeRow label="Q1 Operating Income × 4 (annualized)" value={annualized} />
            <BridgeRow label="+ Owner comp addback" value={adjustments.ownerComp} />
            <BridgeRow label="+ One-time addbacks" value={adjustments.oneTime} />
            <div className="h-px bg-gray-700 my-1" />
            <BridgeRow label="Adjusted EBITDA" value={adjustedEbitda} bold />
            <BridgeRow label={`× ${multiple.toFixed(1)} multiple`} value={null} />
            <div className="h-px bg-gray-700 my-1" />
            <BridgeRow label="Implied Valuation" value={valuation} bold color="text-emerald-400" />
          </div>
        </div>
      </div>

      {/* Valuation band chart */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-white mb-4">Valuation by Buyer Type</h2>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={valuationBands} layout="vertical" margin={{ left: 50 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis type="number" stroke="#6b7280" fontSize={12} tickFormatter={(v) => `$${(Number(v) / 1_000_000).toFixed(1)}M`} />
              <YAxis type="category" dataKey="label" stroke="#6b7280" fontSize={12} width={130} />
              <Tooltip
                contentStyle={{ backgroundColor: "#111827", border: "1px solid #374151", borderRadius: 8 }}
                labelStyle={{ color: "#e5e7eb" }}
                formatter={(v) => fmt(Number(v))}
              />
              <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                {valuationBands.map((b, i) => (
                  <Cell key={i} fill={b.multiple === multiple ? "#10b981" : "#374151"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <p className="text-xs text-gray-500 mt-3 italic">
          Multiples are indicative ranges for physical-product distributors. Real buyer-specific multiples depend on growth, margin stability, customer diversification, and synergies.
        </p>
      </div>

      {/* Readiness breakdown */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-white mb-4">Exit Readiness by Category</h2>
        <div className="space-y-2.5">
          {Object.entries(readinessScores).map(([key, score]) => (
            <div key={key}>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-gray-400 capitalize font-medium">{key}</span>
                <span className={`font-semibold ${score >= 70 ? "text-emerald-400" : score >= 50 ? "text-yellow-400" : "text-red-400"}`}>{score}/100</span>
              </div>
              <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${score >= 70 ? "bg-emerald-500" : score >= 50 ? "bg-yellow-500" : "bg-red-500"}`} style={{ width: `${score}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Deal room checklist */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-800">
          <h2 className="text-sm font-semibold text-white">Deal Room Readiness</h2>
          <p className="text-xs text-gray-500 mt-0.5">Documents a buyer will ask for in due diligence</p>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-500 text-xs uppercase tracking-wider bg-gray-800/40 border-b border-gray-800">
              <th className="py-2.5 px-4 text-left">Document</th>
              <th className="py-2.5 px-4 text-center">Status</th>
              <th className="py-2.5 px-4 text-left">Blocker</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {DEAL_ROOM_ITEMS.map(d => (
              <tr key={d.item}>
                <td className="py-3 px-4 text-white">{d.item}</td>
                <td className="py-3 px-4 text-center"><StatusBadge status={d.status as "ready" | "partial" | "missing" | "unknown"} /></td>
                <td className="py-3 px-4 text-xs text-gray-400">{d.blocker}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="bg-yellow-900/10 border border-yellow-800/40 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-yellow-400 mb-2">Caveats on this valuation</h2>
        <ul className="text-sm text-gray-300 leading-relaxed space-y-1.5 list-disc list-inside">
          <li>EBITDA proxy uses <strong>cash-basis</strong> operating income. Real accrual EBITDA may be materially different.</li>
          <li>$1.6M of &quot;KBBO&quot; spend is still unclassified — could be operating cost (lowers EBITDA) or capital (neutral).</li>
          <li>Q1 × 4 annualization ignores seasonality. A full trailing-12-month view will be more accurate.</li>
          <li>Multiples assume stable, diversified revenue. Single-customer concentration (if Ferguson is too big) would compress multiples meaningfully.</li>
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

function BridgeRow({ label, value, bold, color }: { label: string; value: number | null; bold?: boolean; color?: string }) {
  const cls = bold ? "font-semibold text-white" : "text-gray-300";
  const valCls = color ?? (bold ? "text-white font-semibold" : "text-gray-200");
  return (
    <div className="flex items-center justify-between">
      <span className={`text-xs ${cls}`}>{label}</span>
      {value !== null ? <span className={`tabular-nums ${valCls}`}>{fmt(value)}</span> : <span className="text-gray-500 text-xs italic">multiply</span>}
    </div>
  );
}

function StatusBadge({ status }: { status: "ready" | "partial" | "missing" | "unknown" }) {
  const styles = {
    ready:   { bg: "bg-emerald-900/40", text: "text-emerald-400", border: "border-emerald-800/40", dot: "bg-emerald-400", label: "Ready" },
    partial: { bg: "bg-blue-900/40",    text: "text-blue-400",    border: "border-blue-800/40",    dot: "bg-blue-400",    label: "Partial" },
    missing: { bg: "bg-red-900/40",     text: "text-red-400",     border: "border-red-800/40",     dot: "bg-red-400",     label: "Missing" },
    unknown: { bg: "bg-yellow-900/40",  text: "text-yellow-400",  border: "border-yellow-800/40",  dot: "bg-yellow-400",  label: "Unknown" },
  }[status];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${styles.bg} ${styles.text} border ${styles.border}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${styles.dot}`} />
      {styles.label}
    </span>
  );
}
