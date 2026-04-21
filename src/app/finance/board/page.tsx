"use client";

import {
  statements,
  monthRevenue,
  monthNetExpenses,
  sumGroup,
  q1,
} from "@/lib/financial-data";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
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
function fmtK(n: number) {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  return `$${Math.round(n / 1000)}K`;
}

export default function BoardPage() {
  // Monthly series
  const series = statements.map(m => {
    const revenue = monthRevenue(m);
    const expenses = monthNetExpenses(m);
    const cogs = sumGroup("COGS", m);
    const grossProfit = revenue - cogs;
    const grossMargin = revenue === 0 ? 0 : (grossProfit / revenue) * 100;
    const opIncome = revenue - expenses;
    return {
      label: `${m.shortMonth} ${m.year}`,
      revenue,
      expenses,
      grossProfit,
      grossMargin,
      opIncome,
      endCash: m.acct115EndBalance + m.acct2285EndBalance,
    };
  });

  const totalRevenue = q1.totalRevenue;
  const totalCogs = sumGroup("COGS");
  const totalGrossProfit = totalRevenue - totalCogs;
  const grossMargin = totalRevenue === 0 ? 0 : (totalGrossProfit / totalRevenue) * 100;
  const opIncome = q1.netCashFlow;
  const opMargin = totalRevenue === 0 ? 0 : (opIncome / totalRevenue) * 100;
  const latest = statements[statements.length - 1];
  const cashOnHand = latest.acct115EndBalance + latest.acct2285EndBalance;
  const avgBurn = q1.totalExpenses / statements.length;
  const runway = cashOnHand / avgBurn;

  const commentary = generateCommentary({
    revenue: totalRevenue,
    grossMargin,
    opIncome,
    opMargin,
    cashOnHand,
    runway,
    monthlySeries: series,
  });

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-emerald-900/40 border border-emerald-800/40 flex items-center justify-center text-xl">📋</div>
        <div>
          <h1 className="text-2xl font-bold text-white">Board &amp; Executive</h1>
          <p className="text-gray-500 text-sm mt-0.5">Q1 2026 performance summary for board review</p>
        </div>
      </div>

      {/* 6 exec KPI tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <ExecKpi label="Revenue" value={fmt(totalRevenue)} trend={trend(series.map(s => s.revenue))} color="text-emerald-400" />
        <ExecKpi label="Gross Margin" value={`${grossMargin.toFixed(1)}%`} trend={trend(series.map(s => s.grossMargin))} color={grossMargin >= 40 ? "text-emerald-400" : "text-yellow-400"} />
        <ExecKpi label="Operating Income" value={fmt(opIncome)} trend={trend(series.map(s => s.opIncome))} color={opIncome >= 0 ? "text-emerald-400" : "text-red-400"} />
        <ExecKpi label="Operating Margin" value={`${opMargin.toFixed(1)}%`} trend={trend(series.map(s => (s.revenue === 0 ? 0 : (s.opIncome / s.revenue) * 100)))} color={opMargin >= 0 ? "text-emerald-400" : "text-red-400"} />
        <ExecKpi label="Cash on Hand" value={fmt(cashOnHand)} trend={trend(series.map(s => s.endCash))} color="text-white" />
        <ExecKpi label="Runway" value={runway > 100 ? "∞" : `${runway.toFixed(1)} mo`} trend={runway > 12 ? "healthy" : runway > 6 ? "watch" : "critical"} color={runway > 12 ? "text-emerald-400" : runway > 6 ? "text-yellow-400" : "text-red-400"} />
      </div>

      {/* Revenue vs Expenses chart */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-white mb-4">Revenue vs Expenses — Q1 2026</h2>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={series}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis dataKey="label" stroke="#6b7280" fontSize={12} />
              <YAxis stroke="#6b7280" fontSize={12} tickFormatter={fmtK} />
              <Tooltip
                contentStyle={{ backgroundColor: "#111827", border: "1px solid #374151", borderRadius: 8 }}
                labelStyle={{ color: "#e5e7eb" }}
                formatter={(v) => fmt(Number(v))}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="revenue" fill="#10b981" name="Revenue" radius={[4, 4, 0, 0]} />
              <Bar dataKey="expenses" fill="#ef4444" name="Expenses" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Margin trend + Cash trajectory */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-white mb-4">Gross Margin Trend</h2>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={series}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                <XAxis dataKey="label" stroke="#6b7280" fontSize={12} />
                <YAxis stroke="#6b7280" fontSize={12} tickFormatter={(v: number) => `${v.toFixed(0)}%`} />
                <Tooltip
                  contentStyle={{ backgroundColor: "#111827", border: "1px solid #374151", borderRadius: 8 }}
                  labelStyle={{ color: "#e5e7eb" }}
                  formatter={(v) => `${Number(v).toFixed(1)}%`}
                />
                <Line type="monotone" dataKey="grossMargin" stroke="#10b981" strokeWidth={2} dot={{ fill: "#10b981", r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-white mb-4">Cash Position (Combined Accounts)</h2>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={series}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                <XAxis dataKey="label" stroke="#6b7280" fontSize={12} />
                <YAxis stroke="#6b7280" fontSize={12} tickFormatter={fmtK} />
                <Tooltip
                  contentStyle={{ backgroundColor: "#111827", border: "1px solid #374151", borderRadius: 8 }}
                  labelStyle={{ color: "#e5e7eb" }}
                  formatter={(v) => fmt(Number(v))}
                />
                <Line type="monotone" dataKey="endCash" stroke="#60a5fa" strokeWidth={2} dot={{ fill: "#60a5fa", r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Commentary */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-sm font-semibold text-white">Quarter Commentary</span>
          <span className="text-[10px] uppercase tracking-wider font-semibold text-gray-500">Rule-based draft</span>
        </div>
        <div className="space-y-2 text-sm">
          {commentary.map((line, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className={`mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0 ${line.tone === "positive" ? "bg-emerald-400" : line.tone === "negative" ? "bg-red-400" : "bg-gray-500"}`} />
              <span className="text-gray-300 leading-relaxed">{line.text}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Export placeholder */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="text-sm font-semibold text-white">Board Packet Export</div>
          <div className="text-xs text-gray-500 mt-0.5">PDF export with all charts + commentary — coming with next build</div>
        </div>
        <button disabled className="px-4 py-2 rounded-lg bg-gray-800 text-gray-500 text-sm cursor-not-allowed">
          Export PDF (coming)
        </button>
      </div>
    </div>
  );
}

function ExecKpi({ label, value, trend, color }: { label: string; value: string; trend: string; color: string }) {
  const trendIcon =
    trend === "up" ? "↑" :
    trend === "down" ? "↓" :
    trend === "healthy" ? "✓" :
    trend === "watch" ? "•" :
    trend === "critical" ? "!" : "→";
  const trendColor =
    trend === "up" || trend === "healthy" ? "text-emerald-400" :
    trend === "down" || trend === "critical" ? "text-red-400" :
    trend === "watch" ? "text-yellow-400" : "text-gray-500";
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
      <div className="flex items-center justify-between mb-1">
        <div className="text-xs text-gray-500 uppercase tracking-wide">{label}</div>
        <span className={`text-xs font-semibold ${trendColor}`}>{trendIcon}</span>
      </div>
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
    </div>
  );
}

function trend(values: number[]): "up" | "down" | "flat" {
  if (values.length < 2) return "flat";
  const first = values[0];
  const last = values[values.length - 1];
  if (last > first * 1.05) return "up";
  if (last < first * 0.95) return "down";
  return "flat";
}

interface CommentaryLine { text: string; tone: "positive" | "negative" | "neutral" }

function generateCommentary(m: {
  revenue: number;
  grossMargin: number;
  opIncome: number;
  opMargin: number;
  cashOnHand: number;
  runway: number;
  monthlySeries: Array<{ revenue: number; opIncome: number; endCash: number }>;
}): CommentaryLine[] {
  const lines: CommentaryLine[] = [];

  // Revenue direction
  const revTrend = trend(m.monthlySeries.map(s => s.revenue));
  if (revTrend === "up") {
    lines.push({ text: `Revenue trended up across Q1 from ${fmt(m.monthlySeries[0].revenue)} in Jan to ${fmt(m.monthlySeries[m.monthlySeries.length - 1].revenue)} in Mar — healthy top-line momentum.`, tone: "positive" });
  } else if (revTrend === "down") {
    lines.push({ text: `Revenue declined through Q1 from ${fmt(m.monthlySeries[0].revenue)} in Jan to ${fmt(m.monthlySeries[m.monthlySeries.length - 1].revenue)} in Mar — warrants investigation.`, tone: "negative" });
  } else {
    lines.push({ text: `Revenue held roughly flat across Q1 at ~${fmt(m.revenue / m.monthlySeries.length)}/month.`, tone: "neutral" });
  }

  // Margin
  if (m.grossMargin >= 40) {
    lines.push({ text: `Gross margin of ${m.grossMargin.toFixed(1)}% is healthy for a physical-product distributor.`, tone: "positive" });
  } else if (m.grossMargin >= 25) {
    lines.push({ text: `Gross margin of ${m.grossMargin.toFixed(1)}% is on the lower end for this industry — monitor factory pricing and freight costs.`, tone: "neutral" });
  } else {
    lines.push({ text: `Gross margin of ${m.grossMargin.toFixed(1)}% is below comfortable thresholds — prioritize cost-of-goods negotiation.`, tone: "negative" });
  }

  // Operating income
  if (m.opIncome >= 0) {
    lines.push({ text: `Company was operating-cash-flow positive in Q1 at ${fmt(m.opIncome)} (${m.opMargin.toFixed(1)}% margin).`, tone: "positive" });
  } else {
    lines.push({ text: `Company ran an operating deficit of ${fmt(Math.abs(m.opIncome))} in Q1 — expenses exceeded cash revenue.`, tone: "negative" });
  }

  // Cash
  if (m.runway > 100) {
    lines.push({ text: `Cash is self-sustaining at current burn — runway is effectively unlimited.`, tone: "positive" });
  } else if (m.runway > 12) {
    lines.push({ text: `Runway of ${m.runway.toFixed(0)} months at current burn provides ample cushion.`, tone: "positive" });
  } else if (m.runway > 6) {
    lines.push({ text: `Runway of ${m.runway.toFixed(1)} months is tight — plan financing or cost cuts within the next quarter.`, tone: "neutral" });
  } else {
    lines.push({ text: `Runway of ${m.runway.toFixed(1)} months is critical — immediate action required.`, tone: "negative" });
  }

  // Unclassified outflows disclaimer
  lines.push({ text: `KBBO ACH now itemized ($559K Q1 — 84% Google Ads). $1.05M in non-KBBO 115 outflows (likely wires/checks) still pending — net income may shift further once bank-statement PDFs are parsed.`, tone: "neutral" });

  return lines;
}
