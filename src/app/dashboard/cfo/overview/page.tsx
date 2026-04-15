import { statements, sumByCategory, totalByCategory, q1, CATEGORY_COLORS, CATEGORY_TEXT, monthRevenue, monthNetExpenses } from "@/lib/financial-data";

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}
function fmtK(n: number) {
  const sign = n < 0 ? "-" : "+";
  return sign + "$" + (Math.abs(n) / 1000).toFixed(0) + "K";
}

// Categories to show in chart (skip the very-large KBBO pending bucket to avoid distortion)
const CHART_CATEGORIES = [
  "Factory / Inventory (COGS)",
  "Vendor Payments (KBBO)",
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
  const totals = totalByCategory();
  const totalExpenses = q1.totalExpenses;
  const netCashFlow = q1.netCashFlow;
  const kbboTotal = totals["Vendor Payments (KBBO)"] ?? 0;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Financial Overview</h1>
        <p className="text-gray-400 text-sm mt-1">Q1 2026 — Account …0115 (operating) + Account …2285 (payroll/expense), inter-account transfers excluded</p>
        {kbboTotal > 0 && (
          <div className="mt-2 inline-flex items-center gap-2 bg-yellow-900/20 border border-yellow-700/30 rounded-lg px-3 py-1.5">
            <span className="text-yellow-400 text-xs font-medium">
              {fmt(kbboTotal)} in KBBO ACH payments pending breakdown (Google Ads, contractors, Zline)
            </span>
          </div>
        )}
      </div>

      {/* Q1 KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Q1 Revenue (Cash In)" value={fmt(q1.totalRevenue)} sub="Deposits to acct …0115" color="text-green-400" />
        <KpiCard label="Q1 Total Expenses" value={fmt(totalExpenses)} sub="Both accounts, ex inter-acct transfers" color="text-red-400" />
        <KpiCard
          label="Q1 Net Cash Flow"
          value={fmt(netCashFlow)}
          sub={netCashFlow >= 0 ? "Positive — company is cash-flow positive" : "Negative this quarter"}
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
                <td className="py-3 px-4">Q1 Total</td>
                <td className="py-3 px-4 text-right text-green-400">{fmt(q1.totalRevenue)}</td>
                <td className="py-3 px-4 text-right text-red-400">({fmt(totalExpenses)})</td>
                <td className={`py-3 px-4 text-right ${netCashFlow >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                  {fmtK(netCashFlow)}
                </td>
              </tr>
            </tfoot>
          </table>
          {/* Account 2285 note */}
          <div className="px-5 py-3 bg-gray-800/30 border-t border-gray-800">
            <p className="text-xs text-gray-500">
              Expenses include acct …2285 actuals: Jan <span className="text-gray-300">$78K</span>, Feb <span className="text-gray-300">$63K</span>, Mar <span className="text-gray-300">$66K</span> — payroll/expense card account
            </p>
          </div>
        </div>

        {/* Category breakdown */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-white mb-4">Q1 Spending by Category</h2>
          <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
            {CHART_CATEGORIES.map(cat => {
              const amount = totals[cat] ?? 0;
              if (!amount) return null;
              const pct = (amount / totalExpenses) * 100;
              const isPending = cat === "Vendor Payments (KBBO)";
              return (
                <div key={cat}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className={CATEGORY_TEXT[cat] ?? "text-gray-400"}>
                      {cat}{isPending ? " ⚠" : ""}
                    </span>
                    <span className="text-white font-medium">{fmt(amount)} <span className="text-gray-500">({pct.toFixed(0)}%)</span></span>
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
            <span className="text-gray-500">Total Q1 expenses</span>
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
                <th className="py-2.5 px-4 text-right">January</th>
                <th className="py-2.5 px-4 text-right">February</th>
                <th className="py-2.5 px-4 text-right">March</th>
                <th className="py-2.5 px-4 text-right">Q1 Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {CHART_CATEGORIES.map(cat => {
                const jan = sumByCategory(statements[0])[cat] ?? 0;
                const feb = sumByCategory(statements[1])[cat] ?? 0;
                const mar = sumByCategory(statements[2])[cat] ?? 0;
                const total = jan + feb + mar;
                if (!total) return null;
                const isPending = cat === "Vendor Payments (KBBO)";
                return (
                  <tr key={cat} className={`hover:bg-gray-800/30 ${isPending ? "opacity-70" : ""}`}>
                    <td className={`py-2.5 px-4 font-medium text-xs ${CATEGORY_TEXT[cat] ?? "text-gray-400"}`}>
                      {cat}
                      {isPending && <span className="ml-1.5 text-yellow-500 font-normal">⚠ breakdown TBD</span>}
                    </td>
                    <td className="py-2.5 px-4 text-right text-gray-300 text-xs">{jan ? fmt(jan) : "—"}</td>
                    <td className="py-2.5 px-4 text-right text-gray-300 text-xs">{feb ? fmt(feb) : "—"}</td>
                    <td className="py-2.5 px-4 text-right text-gray-300 text-xs">{mar ? fmt(mar) : "—"}</td>
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
            { label: "KBBO ACH Payments", note: "Large vendor payments (Google Ads, contractors, Zline product). Labeled 'Vendor Payments' pending itemized breakdown.", status: "pending" },
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
