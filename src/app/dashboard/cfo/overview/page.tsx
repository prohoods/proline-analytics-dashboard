import { statements, sumByCategory, totalByCategory, q1, CATEGORY_COLORS, CATEGORY_TEXT } from "@/lib/financial-data";

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}
function fmtK(n: number) {
  return "$" + (n / 1000).toFixed(0) + "K";
}

export default function CFOOverview() {
  const totals = totalByCategory();
  const totalKnownExpenses = q1.totalWithdrawals;
  const netCashFlow = q1.totalDeposits - q1.totalWithdrawals;
  const pendingAmount = totals["Pending Review"] ?? 0;
  const confirmedExpenses = totalKnownExpenses - pendingAmount;

  // Sort categories for the bar chart (pending last)
  const categoryOrder = [
    "Factory / Inventory (COGS)",
    "Payroll",
    "Rent",
    "Taxes & Compliance",
    "Shipping & Freight",
    "Pending Review",
  ];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Financial Overview</h1>
        <p className="text-gray-400 text-sm mt-1">Q1 2026 — January, February & March bank statement data</p>
        {pendingAmount > 0 && (
          <div className="mt-2 inline-flex items-center gap-2 bg-yellow-900/20 border border-yellow-700/30 rounded-lg px-3 py-1.5">
            <span className="text-yellow-400 text-xs font-medium">
              {fmt(pendingAmount)} across 3 months is pending categorization — boss is reviewing
            </span>
          </div>
        )}
      </div>

      {/* Q1 KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Q1 Cash In" value={fmt(q1.totalDeposits)} sub="Jan + Feb + Mar deposits" color="text-green-400" />
        <KpiCard label="Q1 Cash Out" value={fmt(q1.totalWithdrawals)} sub="Jan + Feb + Mar withdrawals" color="text-red-400" />
        <KpiCard
          label="Q1 Net Cash Flow"
          value={fmt(netCashFlow)}
          sub={netCashFlow >= 0 ? "Positive cash flow" : "Negative — high COGS month"}
          color={netCashFlow >= 0 ? "text-emerald-400" : "text-red-400"}
        />
        <KpiCard label="Ending Balance" value={fmt(q1.endingBalance)} sub={`Started at ${fmt(q1.beginningBalance)}`} color="text-white" />
      </div>

      {/* Month-by-month summary + expense breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Monthly P&L table */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-800">
            <h2 className="text-sm font-semibold text-white">Month-by-Month Summary</h2>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-500 text-xs uppercase tracking-wider bg-gray-800/40 border-b border-gray-800">
                <th className="py-2.5 px-4 text-left">Month</th>
                <th className="py-2.5 px-4 text-right">Deposits</th>
                <th className="py-2.5 px-4 text-right">Withdrawals</th>
                <th className="py-2.5 px-4 text-right">Net</th>
                <th className="py-2.5 px-4 text-right">End Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {statements.map(m => {
                const net = m.totalDeposits - m.totalWithdrawals;
                return (
                  <tr key={m.month} className="text-gray-300 hover:bg-gray-800/30">
                    <td className="py-2.5 px-4 font-medium text-white">{m.shortMonth} {m.year}</td>
                    <td className="py-2.5 px-4 text-right text-green-400">{fmt(m.totalDeposits)}</td>
                    <td className="py-2.5 px-4 text-right text-red-400">({fmt(m.totalWithdrawals)})</td>
                    <td className={`py-2.5 px-4 text-right font-medium ${net >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                      {net >= 0 ? "+" : ""}{fmtK(net)}
                    </td>
                    <td className="py-2.5 px-4 text-right text-white">{fmt(m.endingBalance)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-gray-700 bg-gray-800/50 font-semibold text-white text-sm">
                <td className="py-3 px-4">Q1 Total</td>
                <td className="py-3 px-4 text-right text-green-400">{fmt(q1.totalDeposits)}</td>
                <td className="py-3 px-4 text-right text-red-400">({fmt(q1.totalWithdrawals)})</td>
                <td className={`py-3 px-4 text-right ${netCashFlow >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                  {netCashFlow >= 0 ? "+" : ""}{fmtK(netCashFlow)}
                </td>
                <td className="py-3 px-4 text-right">{fmt(q1.endingBalance)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Expense category bars */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-white mb-4">Q1 Spending by Category</h2>
          <div className="space-y-3">
            {categoryOrder.map(cat => {
              const amount = totals[cat] ?? 0;
              if (!amount) return null;
              const pct = (amount / totalKnownExpenses) * 100;
              return (
                <div key={cat}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className={CATEGORY_TEXT[cat] ?? "text-gray-400"}>{cat}</span>
                    <span className="text-white font-medium">{fmt(amount)} <span className="text-gray-500">({pct.toFixed(0)}%)</span></span>
                  </div>
                  <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${CATEGORY_COLORS[cat] ?? "bg-gray-600"} ${cat === "Pending Review" ? "opacity-40" : ""}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-4 pt-4 border-t border-gray-800 flex justify-between text-xs">
            <span className="text-gray-500">Total withdrawals (Q1)</span>
            <span className="text-white font-semibold">{fmt(totalKnownExpenses)}</span>
          </div>
        </div>
      </div>

      {/* Per-month category breakdown */}
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
              {categoryOrder.map(cat => {
                const jan = sumByCategory(statements[0])[cat] ?? 0;
                const feb = sumByCategory(statements[1])[cat] ?? 0;
                const mar = sumByCategory(statements[2])[cat] ?? 0;
                const total = jan + feb + mar;
                if (!total) return null;
                const isPending = cat === "Pending Review";
                return (
                  <tr key={cat} className={`hover:bg-gray-800/30 ${isPending ? "opacity-60" : ""}`}>
                    <td className={`py-2.5 px-4 font-medium ${CATEGORY_TEXT[cat] ?? "text-gray-400"}`}>
                      {cat}
                      {isPending && <span className="ml-2 text-xs text-yellow-500 font-normal">⚠ pending</span>}
                    </td>
                    <td className="py-2.5 px-4 text-right text-gray-300">{jan ? fmt(jan) : "—"}</td>
                    <td className="py-2.5 px-4 text-right text-gray-300">{feb ? fmt(feb) : "—"}</td>
                    <td className="py-2.5 px-4 text-right text-gray-300">{mar ? fmt(mar) : "—"}</td>
                    <td className="py-2.5 px-4 text-right text-white font-semibold">{fmt(total)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-gray-700 bg-gray-800/50 font-bold text-white">
                <td className="py-3 px-4">Total</td>
                {statements.map(m => (
                  <td key={m.month} className="py-3 px-4 text-right">{fmt(m.totalWithdrawals)}</td>
                ))}
                <td className="py-3 px-4 text-right text-emerald-400">{fmt(q1.totalWithdrawals)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Balance trend */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-white mb-4">Cash Balance Trend</h2>
        <div className="flex items-end gap-6">
          {[
            { label: "Dec 31 (Start)", value: q1.beginningBalance },
            ...statements.map(m => ({ label: `${m.shortMonth} 31`, value: m.endingBalance })),
          ].map((point, i) => {
            const maxVal = Math.max(q1.beginningBalance, ...statements.map(m => m.endingBalance));
            const heightPct = (point.value / maxVal) * 100;
            return (
              <div key={i} className="flex flex-col items-center gap-2 flex-1">
                <span className="text-xs text-white font-medium">{fmtK(point.value)}</span>
                <div className="w-full bg-gray-800 rounded-t-md" style={{ height: "80px" }}>
                  <div
                    className="w-full bg-emerald-600/70 rounded-t-md transition-all"
                    style={{ height: `${heightPct}%`, marginTop: `${100 - heightPct}%` }}
                  />
                </div>
                <span className="text-xs text-gray-500">{point.label}</span>
              </div>
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
