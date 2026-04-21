"use client";

import { useState } from "react";
import { statements, monthRevenue, monthNetExpenses, q1 } from "@/lib/financial-data";
import CategoryDrillDown from "@/components/CategoryDrillDown";

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}
function fmt2(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(n);
}

// Known accounts referenced by statements / transfers — extend as statements get uploaded
const KNOWN_ACCOUNTS = [
  { last4: "0115", name: "Operating (Revenue)",     bank: "KeyBank", purpose: "All Shopify / Ferguson deposits flow in; wires, rent, factory pmts, KBBO ACH out", status: "active" as const },
  { last4: "2285", name: "Payroll / Expense",       bank: "KeyBank", purpose: "Funded from …0115; card + small vendor charges",                                   status: "active" as const },
  { last4: "1071", name: "Savings (sub-account)",   bank: "KeyBank", purpose: "Receives 'Internet Trf To DDA' transfers — balance unknown",                       status: "unknown" as const },
  { last4: "5601", name: "Sub-account 448615601888", bank: "KeyBank", purpose: "Receives internal transfers — balance unknown",                                    status: "unknown" as const },
  { last4: "7913", name: "Sub-account 448603037913", bank: "KeyBank", purpose: "Referenced by internal transfers — balance unknown",                               status: "unknown" as const },
  { last4: "Chase", name: "Chase Business Credit",  bank: "Chase",   purpose: "Paid via 'Chase Credit Crdepay' ACH — $6–8K monthly; statements needed",            status: "unknown" as const },
];

export default function CashTreasuryPage() {
  const [drillCategory, setDrillCategory] = useState<string | null>(null);

  const latest = statements[statements.length - 1];
  const oldest = statements[0];
  const totalRevenue = q1.totalRevenue;
  const totalExpenses = q1.totalExpenses;
  const netCashFlow = q1.netCashFlow;
  const avgMonthlyBurn = totalExpenses / statements.length;
  const runwayMonths = latest.acct115EndBalance / avgMonthlyBurn;

  // Combined cash trajectory across both KeyBank accounts
  const trajectory = statements.map(m => ({
    label: `${m.shortMonth} ${m.year}`,
    begin: m.acct115BeginBalance + m.acct2285BeginBalance,
    end: m.acct115EndBalance + m.acct2285EndBalance,
    revenue: monthRevenue(m),
    expenses: monthNetExpenses(m),
    net: monthRevenue(m) - monthNetExpenses(m),
  }));

  return (
    <div className="p-6 space-y-6">
      <CategoryDrillDown category={drillCategory} onClose={() => setDrillCategory(null)} />

      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-emerald-900/40 border border-emerald-800/40 flex items-center justify-center text-xl">
          💰
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">Cash &amp; Treasury</h1>
          <p className="text-gray-500 text-sm mt-0.5">Bank balances, cash flow trajectory, and runway — Q1 2026</p>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Current Cash (Known)"
          value={fmt(latest.acct115EndBalance + latest.acct2285EndBalance)}
          sub={`…0115 ${fmt(latest.acct115EndBalance)} + …2285 ${fmt(latest.acct2285EndBalance)}`}
          color="text-emerald-400"
        />
        <KpiCard
          label="Q1 Net Cash Flow"
          value={fmt(netCashFlow)}
          sub={netCashFlow >= 0 ? "Positive — generating cash" : "Burning cash this quarter"}
          color={netCashFlow >= 0 ? "text-emerald-400" : "text-red-400"}
        />
        <KpiCard
          label="Avg Monthly Burn"
          value={fmt(avgMonthlyBurn)}
          sub="Revenue − expenses, 3-month average"
          color="text-orange-400"
        />
        <KpiCard
          label="Runway (at current burn)"
          value={runwayMonths > 100 ? "∞" : `${runwayMonths.toFixed(1)} mo`}
          sub={runwayMonths > 100 ? "Revenue exceeds expenses — self-sustaining" : `${fmt(latest.acct115EndBalance)} / avg burn`}
          color="text-white"
        />
      </div>

      {/* Cash trajectory table + chart */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Trajectory table */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden lg:col-span-3">
          <div className="px-5 py-4 border-b border-gray-800">
            <h2 className="text-sm font-semibold text-white">Monthly Cash Trajectory</h2>
            <p className="text-xs text-gray-500 mt-0.5">Combined …0115 + …2285 ending balance, plus monthly in/out</p>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-500 text-xs uppercase tracking-wider bg-gray-800/40 border-b border-gray-800">
                <th className="py-2.5 px-4 text-left">Month</th>
                <th className="py-2.5 px-4 text-right">Begin</th>
                <th className="py-2.5 px-4 text-right">In</th>
                <th className="py-2.5 px-4 text-right">Out</th>
                <th className="py-2.5 px-4 text-right">End</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {trajectory.map(t => (
                <tr key={t.label} className="hover:bg-gray-800/30">
                  <td className="py-3 px-4 font-medium text-white">{t.label}</td>
                  <td className="py-3 px-4 text-right text-gray-400">{fmt(t.begin)}</td>
                  <td className="py-3 px-4 text-right text-green-400">{fmt(t.revenue)}</td>
                  <td className="py-3 px-4 text-right text-red-400">({fmt(t.expenses)})</td>
                  <td className={`py-3 px-4 text-right font-semibold ${t.end > t.begin ? "text-emerald-400" : "text-red-400"}`}>
                    {fmt(t.end)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-gray-700 bg-gray-800/50 font-bold text-white text-sm">
                <td className="py-3 px-4">Q1 Total</td>
                <td className="py-3 px-4 text-right text-gray-400">{fmt(oldest.acct115BeginBalance + oldest.acct2285BeginBalance)}</td>
                <td className="py-3 px-4 text-right text-green-400">{fmt(totalRevenue)}</td>
                <td className="py-3 px-4 text-right text-red-400">({fmt(totalExpenses)})</td>
                <td className={`py-3 px-4 text-right ${netCashFlow >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                  {fmt(latest.acct115EndBalance + latest.acct2285EndBalance)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Cash flow waterfall */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 lg:col-span-2">
          <h2 className="text-sm font-semibold text-white mb-3">Q1 Cash Waterfall</h2>
          <div className="space-y-3 text-sm">
            <WaterfallRow label="Beginning Balance" value={oldest.acct115BeginBalance + oldest.acct2285BeginBalance} tone="neutral" />
            <WaterfallRow label="+ Q1 Revenue" value={totalRevenue} tone="positive" />
            <WaterfallRow label="− Q1 Expenses" value={-totalExpenses} tone="negative" />
            <div className="h-px bg-gray-800 my-2" />
            <WaterfallRow label="= Ending Balance" value={latest.acct115EndBalance + latest.acct2285EndBalance} tone="bold" />
          </div>
          <div className="mt-4 pt-3 border-t border-gray-800 text-xs text-gray-500">
            Balance change:&nbsp;
            <span className={netCashFlow >= 0 ? "text-emerald-400" : "text-red-400"}>
              {netCashFlow >= 0 ? "+" : ""}{fmt(netCashFlow)} ({((netCashFlow / (oldest.acct115BeginBalance + oldest.acct2285BeginBalance)) * 100).toFixed(0)}%)
            </span>
          </div>
        </div>
      </div>

      {/* Accounts register */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-800 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-white">Account Register</h2>
            <p className="text-xs text-gray-500 mt-0.5">All bank accounts referenced in statements — unknown accounts need statements uploaded</p>
          </div>
          <span className="text-xs text-gray-500">{KNOWN_ACCOUNTS.length} accounts tracked</span>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-500 text-xs uppercase tracking-wider bg-gray-800/40 border-b border-gray-800">
              <th className="py-2.5 px-4 text-left">Account</th>
              <th className="py-2.5 px-4 text-left">Bank</th>
              <th className="py-2.5 px-4 text-left">Purpose</th>
              <th className="py-2.5 px-4 text-right">Current Balance</th>
              <th className="py-2.5 px-4 text-center">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {KNOWN_ACCOUNTS.map(acc => {
              const balance = acc.last4 === "0115" ? latest.acct115EndBalance
                : acc.last4 === "2285" ? latest.acct2285EndBalance
                : null;
              return (
                <tr key={acc.last4} className="hover:bg-gray-800/30">
                  <td className="py-3 px-4 font-mono text-white">…{acc.last4}</td>
                  <td className="py-3 px-4 text-gray-300">{acc.bank}</td>
                  <td className="py-3 px-4 text-gray-400 text-xs max-w-md">{acc.purpose}</td>
                  <td className="py-3 px-4 text-right font-semibold">
                    {balance !== null
                      ? <span className={balance >= 0 ? "text-white" : "text-red-400"}>{fmt2(balance)}</span>
                      : <span className="text-gray-600 italic">Unknown</span>}
                  </td>
                  <td className="py-3 px-4 text-center">
                    {acc.status === "active" ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-900/40 text-emerald-400 border border-emerald-800/40">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                        Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-yellow-900/40 text-yellow-400 border border-yellow-800/40">
                        <span className="w-1.5 h-1.5 rounded-full bg-yellow-400" />
                        Statements needed
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Outflow highlights — clickable categories */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-800">
          <h2 className="text-sm font-semibold text-white">Top Q1 Outflows (click to see transactions)</h2>
        </div>
        <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-3">
          {["Factory / Inventory (COGS)", "Digital Advertising", "Payroll", "Unclassified Outflows (115)", "Rent", "Shipping & Freight"].map(cat => {
            const total = statements.reduce((sum, m) => sum + m.expenses.filter(e => e.category === cat).reduce((s, e) => s + e.amount, 0), 0);
            const pct = (total / totalExpenses) * 100;
            return (
              <button
                key={cat}
                onClick={() => setDrillCategory(cat)}
                className="flex items-center justify-between bg-gray-800/40 hover:bg-gray-800/70 border border-gray-800 rounded-lg p-3 transition-colors text-left group"
              >
                <div>
                  <div className="text-sm text-white group-hover:underline">{cat}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{pct.toFixed(1)}% of Q1 spend</div>
                </div>
                <div className="text-right">
                  <div className="text-white font-semibold">{fmt(total)}</div>
                  <div className="text-xs text-emerald-400 mt-0.5">View →</div>
                </div>
              </button>
            );
          })}
        </div>
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

function WaterfallRow({ label, value, tone }: { label: string; value: number; tone: "positive" | "negative" | "neutral" | "bold" }) {
  const color = tone === "positive" ? "text-emerald-400"
    : tone === "negative" ? "text-red-400"
    : tone === "bold" ? "text-white font-bold"
    : "text-gray-300";
  return (
    <div className="flex items-center justify-between">
      <span className={`${tone === "bold" ? "text-white font-semibold" : "text-gray-400"}`}>{label}</span>
      <span className={color}>{fmt(Math.abs(value))}</span>
    </div>
  );
}
