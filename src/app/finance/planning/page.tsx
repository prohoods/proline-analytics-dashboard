"use client";

import { useState } from "react";
import { useFinancialData } from "@/lib/use-financial-data";
import InfoTooltip from "@/components/InfoTooltip";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}
function fmtK(n: number) {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  return `$${Math.round(n / 1000)}K`;
}

// Baseline = Q1 monthly averages, convertible to weekly
const WEEKS_PER_MONTH = 4.33;

const DEFAULTS = {
  revGrowth: 0,
  cogsPctDelta: 0,
  marketingDelta: 0,
  hiresPerMonth: 0,
  avgFTECost: 8500,
};

export default function PlanningPage() {
  const { statements, q1, sumCategory } = useFinancialData();
  // Assumption knobs
  const [revGrowth, setRevGrowth] = useState(DEFAULTS.revGrowth);       // % monthly growth
  const [cogsPctDelta, setCogsPctDelta] = useState(DEFAULTS.cogsPctDelta); // bps change in COGS as % of revenue
  const [marketingDelta, setMarketingDelta] = useState(DEFAULTS.marketingDelta); // % change in marketing spend
  const [hiresPerMonth, setHiresPerMonth] = useState(DEFAULTS.hiresPerMonth);   // additional FTEs
  const [avgFTECost, setAvgFTECost] = useState(DEFAULTS.avgFTECost);      // monthly loaded cost

  const isModified =
    revGrowth !== DEFAULTS.revGrowth ||
    cogsPctDelta !== DEFAULTS.cogsPctDelta ||
    marketingDelta !== DEFAULTS.marketingDelta ||
    hiresPerMonth !== DEFAULTS.hiresPerMonth ||
    avgFTECost !== DEFAULTS.avgFTECost;

  const reset = () => {
    setRevGrowth(DEFAULTS.revGrowth);
    setCogsPctDelta(DEFAULTS.cogsPctDelta);
    setMarketingDelta(DEFAULTS.marketingDelta);
    setHiresPerMonth(DEFAULTS.hiresPerMonth);
    setAvgFTECost(DEFAULTS.avgFTECost);
  };

  const avgMonthlyRev = q1.totalRevenue / statements.length;
  const avgMonthlyCogs = sumCategory("Factory / Inventory (COGS)") / statements.length + sumCategory("Import & Customs") / statements.length;
  const baselineCogsPct = (avgMonthlyCogs / avgMonthlyRev) * 100;
  const avgMonthlyMarketing = (sumCategory("Digital Advertising") + sumCategory("Marketing Services")) / statements.length;
  const avgMonthlyFixed =
    sumCategory("Payroll") / statements.length +
    sumCategory("Rent") / statements.length +
    sumCategory("SaaS & Software") / statements.length +
    sumCategory("Shipping & Freight") / statements.length +
    sumCategory("Operations & Supplies") / statements.length +
    sumCategory("Taxes & Compliance") / statements.length;

  const latest = statements[statements.length - 1];
  const startingCash = latest.acct115EndBalance + latest.acct2285EndBalance;

  // Project 13 weeks forward
  const weeks: Array<{ week: string; weekNum: number; cash: number; revenue: number; expenses: number; net: number }> = [];
  let cash = startingCash;

  for (let w = 1; w <= 13; w++) {
    const month = (w - 1) / WEEKS_PER_MONTH;
    const growthMultiplier = Math.pow(1 + revGrowth / 100, month);
    const weeklyRev = (avgMonthlyRev / WEEKS_PER_MONTH) * growthMultiplier;
    const weeklyCogs = weeklyRev * ((baselineCogsPct + cogsPctDelta) / 100);
    const weeklyMarketing = (avgMonthlyMarketing / WEEKS_PER_MONTH) * (1 + marketingDelta / 100) * growthMultiplier;
    const weeklyFixed = avgMonthlyFixed / WEEKS_PER_MONTH;
    const weeklyHiringCost = (hiresPerMonth * avgFTECost * month) / WEEKS_PER_MONTH;
    const weeklyExpenses = weeklyCogs + weeklyMarketing + weeklyFixed + weeklyHiringCost;
    const weeklyNet = weeklyRev - weeklyExpenses;
    cash += weeklyNet;
    weeks.push({
      week: `W${w}`,
      weekNum: w,
      cash,
      revenue: weeklyRev,
      expenses: weeklyExpenses,
      net: weeklyNet,
    });
  }

  const endingCash = weeks[weeks.length - 1].cash;
  const minCash = Math.min(...weeks.map(w => w.cash));
  const minCashWeek = weeks.find(w => w.cash === minCash)!;
  const totalNet = endingCash - startingCash;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-emerald-900/40 border border-emerald-800/40 flex items-center justify-center text-xl">📈</div>
        <div>
          <div className="flex items-center">
            <h1 className="text-2xl font-bold text-white">Planning &amp; Forecasting</h1>
            <InfoTooltip title="Planning &amp; Forecasting">
              <p className="mb-2">This is a <strong>13-week cash forecast</strong> — a CFO&apos;s tool to project cash position week by week and stress-test decisions before making them.</p>
              <p className="mb-2">The model starts from the current bank balance and walks forward, applying Q1 averages for revenue, COGS, marketing, and fixed costs. The sliders let you change the assumptions — &quot;what if revenue grows 10%?&quot; or &quot;what if we hire 2 people?&quot; — and the chart re-projects.</p>
              <p>Why it matters: this is how you find the lowest cash point in the next quarter <em>before</em> you get there, and decide if you can afford a hire, a marketing push, or an inventory order.</p>
            </InfoTooltip>
          </div>
          <p className="text-gray-500 text-sm mt-0.5">13-week rolling cash forecast — adjust assumptions below to see impact</p>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Starting Cash" value={fmt(startingCash)} sub="Combined KeyBank balances" color="text-white" />
        <KpiCard label="Projected End Cash (13 wk)" value={fmt(endingCash)} sub={`${totalNet >= 0 ? "+" : ""}${fmt(totalNet)} change`} color={endingCash >= startingCash ? "text-emerald-400" : "text-red-400"} />
        <KpiCard label="Lowest Cash Point" value={fmt(minCash)} sub={`${minCashWeek.week} of forecast`} color={minCash < 50000 ? "text-red-400" : minCash < 100000 ? "text-yellow-400" : "text-emerald-400"} />
        <KpiCard label="Baseline Weekly Burn" value={fmt(avgMonthlyFixed / WEEKS_PER_MONTH)} sub="Fixed costs only (ex COGS, marketing)" color="text-orange-400" />
      </div>

      {/* Assumptions */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-white">Assumptions</h2>
          <button
            type="button"
            onClick={reset}
            disabled={!isModified}
            className="text-xs px-3 py-1.5 rounded-lg border border-gray-700 text-gray-300 hover:border-emerald-500 hover:text-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-gray-700 disabled:hover:text-gray-300 transition-colors inline-flex items-center gap-1.5"
            title="Reset all sliders to defaults"
          >
            <span aria-hidden>↺</span> Reset to defaults
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <AssumptionSlider
            label="Revenue growth (monthly)"
            value={revGrowth}
            onChange={setRevGrowth}
            min={-20} max={30} step={1} suffix="%"
            hint="How fast is top-line growing month-over-month?"
          />
          <AssumptionSlider
            label="COGS as % of revenue — change"
            value={cogsPctDelta}
            onChange={setCogsPctDelta}
            min={-15} max={15} step={0.5} suffix=" pts"
            hint={`Baseline from Q1 actuals: ${baselineCogsPct.toFixed(1)}%`}
          />
          <AssumptionSlider
            label="Marketing spend change"
            value={marketingDelta}
            onChange={setMarketingDelta}
            min={-50} max={100} step={5} suffix="%"
            hint={`Baseline: ${fmt(avgMonthlyMarketing)}/month`}
          />
          <AssumptionSlider
            label="New hires per month"
            value={hiresPerMonth}
            onChange={setHiresPerMonth}
            min={0} max={5} step={1} suffix=" FTEs"
            hint={`@ ${fmt(avgFTECost)}/mo fully-loaded`}
          />
        </div>
      </div>

      {/* Cash projection chart */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-white mb-4">Projected Cash Balance — Next 13 Weeks</h2>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={weeks}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis dataKey="week" stroke="#6b7280" fontSize={12} />
              <YAxis stroke="#6b7280" fontSize={12} tickFormatter={fmtK} />
              <Tooltip
                contentStyle={{ backgroundColor: "#111827", border: "1px solid #374151", borderRadius: 8 }}
                labelStyle={{ color: "#e5e7eb" }}
                formatter={(v) => fmt(Number(v))}
              />
              <ReferenceLine y={0} stroke="#ef4444" strokeDasharray="3 3" label={{ value: "Zero", fill: "#ef4444", fontSize: 11 }} />
              <ReferenceLine y={startingCash} stroke="#6b7280" strokeDasharray="3 3" label={{ value: "Start", fill: "#6b7280", fontSize: 11 }} />
              <Line type="monotone" dataKey="cash" stroke="#10b981" strokeWidth={2.5} dot={{ fill: "#10b981", r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Weekly detail table */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-800">
          <h2 className="text-sm font-semibold text-white">Weekly Detail</h2>
        </div>
        <div className="max-h-80 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-gray-900 border-b border-gray-800">
              <tr className="text-gray-500 text-xs uppercase tracking-wider">
                <th className="py-2.5 px-4 text-left">Week</th>
                <th className="py-2.5 px-4 text-right">Revenue</th>
                <th className="py-2.5 px-4 text-right">Expenses</th>
                <th className="py-2.5 px-4 text-right">Net</th>
                <th className="py-2.5 px-4 text-right">Projected Cash</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {weeks.map(w => (
                <tr key={w.week} className="hover:bg-gray-800/30">
                  <td className="py-2.5 px-4 text-white font-medium text-xs">{w.week}</td>
                  <td className="py-2.5 px-4 text-right text-green-400 text-xs">{fmt(w.revenue)}</td>
                  <td className="py-2.5 px-4 text-right text-red-400 text-xs">({fmt(w.expenses)})</td>
                  <td className={`py-2.5 px-4 text-right text-xs font-semibold ${w.net >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {w.net >= 0 ? "+" : ""}{fmt(w.net)}
                  </td>
                  <td className={`py-2.5 px-4 text-right text-xs font-semibold ${w.cash >= 0 ? "text-white" : "text-red-400"}`}>
                    {fmt(w.cash)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-white mb-3">Methodology</h2>
        <ul className="text-xs text-gray-400 space-y-1.5 list-disc list-inside leading-relaxed">
          <li>Baseline weekly revenue = Q1 average ÷ {WEEKS_PER_MONTH} weeks/month</li>
          <li>Growth compounds monthly — a 5% slider = 5% MoM = ~60% annualized</li>
          <li>COGS, marketing, and fixed costs scale with their own growth logic (COGS scales with revenue; fixed costs don&apos;t)</li>
          <li>New-hire cost ramps linearly — week 1 adds 0 FTE, week 13 adds 3 months × slider</li>
          <li>Doesn&apos;t yet model seasonality or one-time items (e.g. Jan&apos;s $108K Avalara backfiling won&apos;t recur)</li>
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

function AssumptionSlider({ label, value, onChange, min, max, step, suffix, hint }: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  suffix: string;
  hint: string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-xs text-gray-400 font-medium">{label}</label>
        <span className="text-sm text-white font-semibold tabular-nums">
          {value > 0 ? "+" : ""}{value}{suffix}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-1.5 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
      />
      <div className="flex items-center justify-between mt-1">
        <span className="text-[10px] text-gray-600">{min}{suffix}</span>
        <span className="text-[10px] text-gray-500 italic">{hint}</span>
        <span className="text-[10px] text-gray-600">{max}{suffix}</span>
      </div>
    </div>
  );
}
