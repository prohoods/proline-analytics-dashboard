"use client";

import { useState } from "react";
import { CATEGORY_COLORS, CATEGORY_TEXT } from "@/lib/financial-data";
import { useFinancialData } from "@/lib/use-financial-data";
import type { RangeKey } from "@/lib/date-ranges";
import CategoryDrillDown from "@/components/CategoryDrillDown";
import DateRangeDropdown from "@/components/DateRangeDropdown";
import InfoTooltip from "@/components/InfoTooltip";

const UNCLASSIFIED_EXPLAINER = (
  <>
    <p className="mb-2"><strong>Unclassified Outflows (115)</strong> = money that left the operating bank account (…0115) but isn&apos;t yet tagged to a vendor or category.</p>
    <p className="mb-2">Q1 total: <strong>~$1.05M</strong> (Jan $448K + Feb $191K + Mar $411K). It&apos;s almost certainly outgoing wires, checks, or non-KBBO ACH debits — things like factory payments, supplier wires, or one-off transfers that don&apos;t show up in the KBBO portal.</p>
    <p className="mb-1 font-semibold text-gray-200">What&apos;s needed to resolve it:</p>
    <ul className="list-disc list-inside space-y-0.5 text-gray-400">
      <li>KeyBank PDF statements for account …0115 (Jan/Feb/Mar)</li>
      <li>Upload them via the <em>Statement Upload</em> page — the parser will extract each debit by vendor</li>
      <li>New categorization rules get added to transaction-categorizer.ts for any new vendors</li>
    </ul>
  </>
);

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

function fmtK(n: number) {
  const sign = n < 0 ? "-" : "+";
  return sign + "$" + (Math.abs(n) / 1000).toFixed(0) + "K";
}

// Categories to show in chart — Unclassified Outflows included but still flagged pending
const CHART_CATEGORIES = [
  "Factory / Inventory (COGS)",
  "Unclassified Outflows (115)",
  "Payroll",
  "Digital Advertising",
  "Rent",
  "Taxes & Compliance",
  "SaaS & Software",
  "Shipping & Freight",
  "Marketing Services",
  "Operations & Supplies",
  "Import & Customs",
  "Meals & Entertainment",
  "Owner Draw / Personal",
  "Petty Cash",
  "Travel",
  "Misc & Other",
];

export default function CFOOverview() {
  const [rangeKey, setRangeKey] = useState<RangeKey>("ytd");
  const { statements, sumByCategory, totalByCategory, q1, monthRevenue, monthNetExpenses, range } = useFinancialData(rangeKey);
  const totals = totalByCategory();
  const totalExpenses = q1.totalExpenses;
  const netCashFlow = q1.netCashFlow;
  const [drillCategory, setDrillCategory] = useState<string | null>(null);

  return (
    <div className="p-6 space-y-6">
      <CategoryDrillDown category={drillCategory} statements={statements} rangeLabel={range.label} onClose={() => setDrillCategory(null)} />
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center">
            <h1 className="text-2xl font-bold text-white">Financial Overview</h1>
            <InfoTooltip title="Financial Overview">
              <p className="mb-2">This is the <strong>top-level snapshot</strong> of where the company stands financially for the selected period — the page a CFO opens first.</p>
              <p className="mb-2"><strong>Revenue</strong> = cash deposits into the operating account. <strong>Expenses</strong> = every dollar that left either KeyBank account, excluding internal transfers between our own accounts (which aren&apos;t real spend). <strong>Net Cash Flow</strong> tells you whether the business made or burned cash in the selected period.</p>
              <p>Below the KPIs you&apos;ll see month-by-month trends and where the money is going by category. Click any category to drill into the underlying transactions.</p>
            </InfoTooltip>
          </div>
          <p className="text-gray-400 text-sm mt-1">{range.label} — Account …0115 (operating) + Account …2285 (payroll/expense), inter-account transfers excluded</p>
        </div>
        <DateRangeDropdown value={rangeKey} onChange={setRangeKey} />
      </div>

      {statements.length === 0 ? (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center text-gray-400">
          No statements in this period yet. Upload a bank statement on the <a href="/finance/upload" className="text-blue-400 hover:underline">upload page</a>, or pick a different range.
        </div>
      ) : (
      <>
      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Revenue (Cash In)" value={fmt(q1.totalRevenue)} sub="Deposits to acct …0115" color="text-green-400" />
        <KpiCard label="Total Expenses" value={fmt(totalExpenses)} sub="Both accounts, ex inter-acct transfers" color="text-red-400" />
        <KpiCard
          label="Net Cash Flow"
          value={fmt(netCashFlow)}
          sub={netCashFlow >= 0 ? "Positive — cash-flow positive" : "Negative — burning cash"}
          color={netCashFlow >= 0 ? "text-emerald-400" : "text-red-400"}
        />
        <KpiCard label="Ending Cash Balance" value={fmt(q1.acct115EndBalance)} sub={`Started at ${fmt(q1.acct115BeginBalance)} (acct …0115)`} color="text-white" />
      </div>

      {/* Month-by-month table + category bars */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Monthly P&L table */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-800">
            <h2 className="text-sm font-semibold text-white">Month-by-Month Cash Flow</h2>
            <p className="text-xs text-gray-500 mt-0.5">Revenue = acct …0115 deposits · Expenses = both accounts, ex internal transfers</p>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-500 text-xs uppercase tracking-wider bg-gray-800/40 border-b border-gray-800">
                <th className="py-2.5 px-4 text-left">Month</th>
                <th className="py-2.5 px-4 text-right">Revenue</th>
                <th className="py-2.5 px-4 text-right">Expenses</th>
                <th className="py-2.5 px-4 text-right">Net</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {statements.map(m => {
                const rev = monthRevenue(m);
                const exp = monthNetExpenses(m);
                const net = rev - exp;
                return (
                  <tr key={m.month} className="text-gray-300 hover:bg-gray-800/30">
                    <td className="py-3 px-4 font-medium text-white">{m.shortMonth} {m.year}</td>
                    <td className="py-3 px-4 text-right text-green-400">{fmt(rev)}</td>
                    <td className="py-3 px-4 text-right text-red-400">({fmt(exp)})</td>
                    <td className={`py-3 px-4 text-right font-semibold ${net >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                      {fmtK(net)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-gray-700 bg-gray-800/50 font-bold text-white text-sm">
                <td className="py-3 px-4">{range.label} Total</td>
                <td className="py-3 px-4 text-right text-green-400">{fmt(q1.totalRevenue)}</td>
                <td className="py-3 px-4 text-right text-red-400">({fmt(totalExpenses)})</td>
                <td className={`py-3 px-4 text-right ${netCashFlow >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                  {fmtK(netCashFlow)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Category breakdown */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-white mb-4">Spending by Category</h2>
          <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
            {CHART_CATEGORIES.map(cat => {
              const amount = totals[cat] ?? 0;
              if (!amount) return null;
              const pct = (amount / totalExpenses) * 100;
              const isPending = cat === "Unclassified Outflows (115)";
              return (
                <div
                  key={cat}
                  className="w-full rounded-lg p-1.5 -mx-1.5 hover:bg-gray-800/50 transition-colors group"
                >
                  <div className="flex justify-between text-xs mb-1 items-center">
                    <span className="flex items-center">
                      <button
                        onClick={() => setDrillCategory(cat)}
                        className={`${CATEGORY_TEXT[cat] ?? "text-gray-400"} group-hover:underline text-left`}
                      >
                        {cat}
                      </button>
                      {isPending && <InfoTooltip title="Unclassified Outflows (115)">{UNCLASSIFIED_EXPLAINER}</InfoTooltip>}
                    </span>
                    <button onClick={() => setDrillCategory(cat)} className="text-white font-medium">
                      {fmt(amount)} <span className="text-gray-500">({pct.toFixed(0)}%)</span>
                    </button>
                  </div>
                  <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${CATEGORY_COLORS[cat] ?? "bg-gray-600"} ${isPending ? "opacity-40" : ""}`}
                      style={{ width: `${Math.min(pct, 100)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-4 pt-3 border-t border-gray-800 flex justify-between text-xs">
            <span className="text-gray-500">Total {range.label} expenses</span>
            <span className="text-white font-semibold">{fmt(totalExpenses)}</span>
          </div>
        </div>
      </div>

      {/* Category breakdown by month table */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-800">
          <h2 className="text-sm font-semibold text-white">Category Breakdown by Month</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-500 text-xs uppercase tracking-wider bg-gray-800/40 border-b border-gray-800">
                <th className="py-2.5 px-4 text-left">Category</th>
                {statements.map(m => (
                  <th key={m.month + m.year} className="py-2.5 px-4 text-right">{m.month}</th>
                ))}
                <th className="py-2.5 px-4 text-right">{range.label} Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {CHART_CATEGORIES.map(cat => {
                const perMonth = statements.map(m => sumByCategory(m)[cat] ?? 0);
                const total = perMonth.reduce((s, n) => s + n, 0);
                if (!total) return null;
                const isPending = cat === "Unclassified Outflows (115)";
                return (
                  <tr
                    key={cat}
                    onClick={() => setDrillCategory(cat)}
                    className={`hover:bg-gray-800/50 cursor-pointer transition-colors ${isPending ? "opacity-70" : ""}`}
                  >
                    <td className={`py-2.5 px-4 font-medium text-xs ${CATEGORY_TEXT[cat] ?? "text-gray-400"}`}>
                      <span className="hover:underline">{cat}</span> <span className="text-gray-600">→</span>
                      {isPending && (
                        <span onClick={(e) => e.stopPropagation()} className="inline-block">
                          <InfoTooltip title="Unclassified Outflows (115)">{UNCLASSIFIED_EXPLAINER}</InfoTooltip>
                        </span>
                      )}
                    </td>
                    {perMonth.map((amt, i) => (
                      <td key={i} className="py-2.5 px-4 text-right text-gray-300 text-xs">{amt ? fmt(amt) : "—"}</td>
                    ))}
                    <td className="py-2.5 px-4 text-right text-white font-semibold text-xs">{fmt(total)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-gray-700 bg-gray-800/50 font-bold text-white text-xs">
                <td className="py-3 px-4">Total</td>
                {statements.map(m => (
                  <td key={m.month} className="py-3 px-4 text-right">{fmt(monthNetExpenses(m))}</td>
                ))}
                <td className="py-3 px-4 text-right text-emerald-400">{fmt(totalExpenses)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Ferguson note */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-white mb-3">Data Notes</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          {[
            { label: "Ferguson Enterprises", note: "Marketplace payments TO us — already counted in revenue deposits. Not an expense.", status: "confirmed" },
            { label: "KBBO ACH Payments", note: "Itemized Q1 — Google Ads $468K, Zline (SHL wholesale) $37K, Worldwide Logistic $43K, Renan Bonin (web dev) $10K. ~$1.05M in non-KBBO 115 outflows still pending (wires/checks).", status: "confirmed" },
            { label: "Worldwidelogis Dzurov", note: "Import & customs broker for Chinese factory shipments.", status: "confirmed" },
            { label: "Branch 0052 Utah Withdrawals", note: "Petty cash — regular cash withdrawals ~$7K/month.", status: "confirmed" },
            { label: "LGS1997BYU PayPal", note: "Owner draw — Nate's tuition payments via PayPal (~$1,500/month).", status: "confirmed" },
            { label: "Acct …1071 Transfers", note: "Transfer to unknown sub-account — clarifying with Mark.", status: "pending" },
          ].map(item => (
            <div key={item.label} className="flex items-start gap-3 bg-gray-800/50 rounded-lg p-3">
              <div className={`mt-0.5 w-2 h-2 rounded-full flex-shrink-0 ${item.status === "confirmed" ? "bg-green-400" : "bg-yellow-400"}`} />
              <div>
                <div className="text-white font-medium">{item.label}</div>
                <div className="text-gray-400 mt-0.5">{item.note}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
      </>
      )}
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
