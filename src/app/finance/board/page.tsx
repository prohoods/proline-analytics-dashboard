"use client";

import { useState } from "react";
import { useFinancialData } from "@/lib/use-financial-data";
import type { RangeKey } from "@/lib/date-ranges";
import DateRangeDropdown from "@/components/DateRangeDropdown";
import InfoTooltip from "@/components/InfoTooltip";
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
  const [rangeKey, setRangeKey] = useState<RangeKey>("ytd");
  const { statements, monthRevenue, monthNetExpenses, sumGroup, q1, range } = useFinancialData(rangeKey);
  const hasData = statements.length > 0;
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
  const latest = hasData ? statements[statements.length - 1] : null;
  const cashOnHand = latest ? latest.acct115EndBalance + latest.acct2285EndBalance : 0;
  const avgBurn = hasData ? q1.totalExpenses / statements.length : 0;
  const runway = avgBurn > 0 ? cashOnHand / avgBurn : Infinity;

  const commentary = hasData ? generateCommentary({
    revenue: totalRevenue,
    grossMargin,
    opIncome,
    opMargin,
    cashOnHand,
    runway,
    monthlySeries: series,
    rangeLabel: range.label,
  }) : [];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-900/40 border border-emerald-800/40 flex items-center justify-center text-xl">📋</div>
          <div className="flex-1">
            <div className="flex items-center">
              <h1 className="text-2xl font-bold text-white">Board &amp; Executive</h1>
              <InfoTooltip title="What is this page?" size="md">
                A one-page summary you&apos;d show to investors, a board of directors, or a partner
                to answer <em>&quot;how is the business doing?&quot;</em> at a glance. Each tile is a
                headline number; hover the <span className="text-emerald-400">?</span> on any of
                them for a plain-language explanation. The charts show how those numbers moved
                across the period, and the auto-commentary below reads the data and flags what&apos;s
                good or concerning.
              </InfoTooltip>
            </div>
            <p className="text-gray-500 text-sm mt-0.5">{range.label} performance summary for board review</p>
          </div>
        </div>
        <DateRangeDropdown value={rangeKey} onChange={setRangeKey} />
      </div>

      {!hasData && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center text-gray-400">
          No statements in this period yet. Upload a bank statement on the <a href="/finance/upload" className="text-blue-400 hover:underline">upload page</a>, or pick a different range.
        </div>
      )}

      {/* 6 exec KPI tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <ExecKpi
          label="Revenue"
          value={fmt(totalRevenue)}
          trend={trend(series.map(s => s.revenue))}
          color="text-emerald-400"
          tooltip={<>Total money that came IN the door — Shopify sales, Ferguson marketplace payouts, refunds received. It&apos;s deposits to account …0115. Does not subtract COGS or any expense yet.</>}
        />
        <ExecKpi
          label="Gross Margin"
          value={`${grossMargin.toFixed(1)}%`}
          trend={trend(series.map(s => s.grossMargin))}
          color={grossMargin >= 40 ? "text-emerald-400" : "text-yellow-400"}
          tooltip={<><strong>Revenue minus cost-of-goods, as a %.</strong> If you sold $100 of product and it cost you $60 to buy from the factory + import it, your gross margin is 40%. Higher = you have more money left over to pay for ads, payroll, rent. For ecommerce, 40%+ is healthy.</>}
        />
        <ExecKpi
          label="Operating Income"
          value={fmt(opIncome)}
          trend={trend(series.map(s => s.opIncome))}
          color={opIncome >= 0 ? "text-emerald-400" : "text-red-400"}
          tooltip={<>The profit from running the business before taxes, owner draws, and one-time items. Revenue minus COGS minus all operating expenses (ads, payroll, rent, software, etc.). If this is negative, the core business is losing money.</>}
        />
        <ExecKpi
          label="Operating Margin"
          value={`${opMargin.toFixed(1)}%`}
          trend={trend(series.map(s => (s.revenue === 0 ? 0 : (s.opIncome / s.revenue) * 100)))}
          color={opMargin >= 0 ? "text-emerald-400" : "text-red-400"}
          tooltip={<>Operating income as a % of revenue. For every $100 of sales, this is how many dollars stay as profit after paying for product, ads, people, and overhead. Ecommerce benchmarks: 5%+ is decent, 10%+ is good, 15%+ is great.</>}
        />
        <ExecKpi
          label="Cash on Hand"
          value={fmt(cashOnHand)}
          trend={trend(series.map(s => s.endCash))}
          color="text-white"
          tooltip={<>Actual money sitting in your bank accounts right now (end of the quarter). Different from profit — profit is an accounting number, cash is what you can actually spend.</>}
        />
        <ExecKpi
          label="Runway"
          value={runway > 100 ? "∞" : `${runway.toFixed(1)} mo`}
          trend={runway > 12 ? "healthy" : runway > 6 ? "watch" : "critical"}
          color={runway > 12 ? "text-emerald-400" : runway > 6 ? "text-yellow-400" : "text-red-400"}
          tooltip={<><strong>How many months the business can keep running if revenue stopped tomorrow.</strong> Calculated as: Cash on Hand ÷ average monthly burn (how much you spend in a typical month). &quot;∞&quot; means you&apos;re profitable, so burn doesn&apos;t apply. Rule of thumb: below 6 months is scary, 12+ is comfortable.</>}
        />
      </div>

      {/* Revenue vs Expenses chart */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-white mb-4">Revenue vs Expenses — {range.label}</h2>
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
          {commentary.length === 0 && (
            <div className="text-gray-500 italic text-xs">Upload a statement to generate commentary.</div>
          )}
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

function ExecKpi({ label, value, trend, color, tooltip }: { label: string; value: string; trend: string; color: string; tooltip?: React.ReactNode }) {
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
        <div className="text-xs text-gray-500 uppercase tracking-wide flex items-center">
          {label}
          {tooltip && <InfoTooltip title={label}>{tooltip}</InfoTooltip>}
        </div>
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
  monthlySeries: Array<{ revenue: number; opIncome: number; endCash: number; label: string }>;
  rangeLabel: string;
}): CommentaryLine[] {
  const lines: CommentaryLine[] = [];
  const period = m.rangeLabel;
  const firstLabel = m.monthlySeries[0]?.label ?? "start";
  const lastLabel = m.monthlySeries[m.monthlySeries.length - 1]?.label ?? "end";

  // Revenue direction
  const revTrend = trend(m.monthlySeries.map(s => s.revenue));
  if (revTrend === "up") {
    lines.push({ text: `Revenue trended up across ${period} from ${fmt(m.monthlySeries[0].revenue)} in ${firstLabel} to ${fmt(m.monthlySeries[m.monthlySeries.length - 1].revenue)} in ${lastLabel} — healthy top-line momentum.`, tone: "positive" });
  } else if (revTrend === "down") {
    lines.push({ text: `Revenue declined through ${period} from ${fmt(m.monthlySeries[0].revenue)} in ${firstLabel} to ${fmt(m.monthlySeries[m.monthlySeries.length - 1].revenue)} in ${lastLabel} — warrants investigation.`, tone: "negative" });
  } else if (m.monthlySeries.length > 0) {
    lines.push({ text: `Revenue held roughly flat across ${period} at ~${fmt(m.revenue / m.monthlySeries.length)}/month.`, tone: "neutral" });
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
    lines.push({ text: `Company was operating-cash-flow positive in ${period} at ${fmt(m.opIncome)} (${m.opMargin.toFixed(1)}% margin).`, tone: "positive" });
  } else {
    lines.push({ text: `Company ran an operating deficit of ${fmt(Math.abs(m.opIncome))} in ${period} — expenses exceeded cash revenue.`, tone: "negative" });
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
  lines.push({ text: `KBBO ACH now itemized (Google Ads-heavy). Non-KBBO 115 outflows (likely wires/checks) still pending — net income may shift once additional bank-statement PDFs are parsed.`, tone: "neutral" });

  return lines;
}
