import { statements } from "@/lib/financial-data";

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

// CBIZ payroll data extracted from bank statements
// Jan ~$84K, Feb ~$87.5K, Mar ~$117K (confirmed as CBIZ ACH transactions)
const payrollByMonth = statements.map(m => {
  const cbiz = m.expenses.filter(e => e.category === "Payroll");
  return {
    month: m.month,
    shortMonth: m.shortMonth,
    amount: cbiz.reduce((s, e) => s + e.amount, 0),
    pending: cbiz.some(e => e.pending),
  };
});

const totalQ1Payroll = payrollByMonth.reduce((s, m) => s + m.amount, 0);
const avgMonthlyPayroll = totalQ1Payroll / payrollByMonth.length;

export default function PayrollPage() {
  const marchIncrease = payrollByMonth[2].amount - payrollByMonth[1].amount;
  const marchIncreasePct = (marchIncrease / payrollByMonth[1].amount) * 100;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Payroll & Benefits</h1>
        <p className="text-gray-400 text-sm mt-1">CBIZ payroll ACH transactions — extracted from KeyBank statements</p>
        <div className="mt-2 inline-flex items-center gap-2 bg-yellow-900/20 border border-yellow-700/30 rounded-lg px-3 py-1.5">
          <span className="text-yellow-400 text-xs font-medium">
            Amounts are bank-confirmed CBIZ totals — department breakdown pending payroll export
          </span>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Q1 Total Payroll</div>
          <div className="text-2xl font-bold text-purple-400">{fmt(totalQ1Payroll)}</div>
          <div className="text-xs text-gray-500 mt-1">Jan + Feb + Mar 2026</div>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Monthly Average</div>
          <div className="text-2xl font-bold text-white">{fmt(avgMonthlyPayroll)}</div>
          <div className="text-xs text-gray-500 mt-1">Q1 average</div>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Annualized Run Rate</div>
          <div className="text-2xl font-bold text-white">{fmt(avgMonthlyPayroll * 12)}</div>
          <div className="text-xs text-gray-500 mt-1">Based on Q1 avg</div>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">March vs Feb</div>
          <div className={`text-2xl font-bold ${marchIncrease > 0 ? "text-red-400" : "text-green-400"}`}>
            {marchIncrease > 0 ? "+" : ""}{marchIncreasePct.toFixed(0)}%
          </div>
          <div className="text-xs text-gray-500 mt-1">
            {marchIncrease > 0 ? "↑ " : "↓ "}{fmt(Math.abs(marchIncrease))} change
          </div>
        </div>
      </div>

      {/* Monthly payroll breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Bar chart */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-white mb-5">Monthly Payroll (CBIZ ACH)</h2>
          <div className="space-y-4">
            {payrollByMonth.map(m => {
              const pct = totalQ1Payroll > 0 ? (m.amount / totalQ1Payroll) * 100 : 0;
              const maxMonth = Math.max(...payrollByMonth.map(x => x.amount));
              const barPct = (m.amount / maxMonth) * 100;
              return (
                <div key={m.month}>
                  <div className="flex justify-between text-sm mb-1.5">
                    <span className="text-gray-300 font-medium">{m.month} 2026</span>
                    <div className="text-right">
                      <span className="text-white font-semibold">{fmt(m.amount)}</span>
                      <span className="text-gray-500 text-xs ml-2">({pct.toFixed(0)}% of Q1)</span>
                    </div>
                  </div>
                  <div className="h-3 bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-purple-600 rounded-full transition-all"
                      style={{ width: `${barPct}%` }}
                    />
                  </div>
                  {m.pending && (
                    <p className="text-xs text-yellow-600 mt-1">⚠ Estimated from CBIZ ACH — exact breakdown pending</p>
                  )}
                </div>
              );
            })}
          </div>
          <div className="mt-5 pt-4 border-t border-gray-800 flex justify-between">
            <span className="text-sm text-gray-400">Q1 Total</span>
            <span className="text-sm font-bold text-purple-400">{fmt(totalQ1Payroll)}</span>
          </div>
        </div>

        {/* Notes & context */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
          <h2 className="text-sm font-semibold text-white">Notes & Context</h2>

          {/* March spike callout */}
          <div className="bg-red-900/20 border border-red-700/30 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <span className="text-red-400 text-lg mt-0.5">⚠</span>
              <div>
                <p className="text-sm font-medium text-red-300">March payroll up {marchIncreasePct.toFixed(0)}% vs February</p>
                <p className="text-xs text-gray-400 mt-1">
                  {fmt(payrollByMonth[2].amount)} vs {fmt(payrollByMonth[1].amount)} the prior month.
                  Could reflect bonuses, additional hires, or a third payroll run. Verify with CBIZ.
                </p>
              </div>
            </div>
          </div>

          {/* Data source */}
          <div className="bg-gray-800/50 rounded-lg p-4">
            <p className="text-xs font-semibold text-gray-300 mb-2">Data Source</p>
            <p className="text-xs text-gray-400">
              Payroll figures are pulled directly from CBIZ ACH debit entries on the KeyBank
              statement for account …0115. These are gross bank outflows — they include employer
              taxes and benefits if processed through CBIZ.
            </p>
          </div>

          {/* To get more detail */}
          <div className="bg-gray-800/50 rounded-lg p-4">
            <p className="text-xs font-semibold text-gray-300 mb-2">To Add Department Breakdown</p>
            <ul className="text-xs text-gray-400 space-y-1 list-disc list-inside">
              <li>Export monthly payroll summary from CBIZ portal</li>
              <li>Or add a CFO Google Sheet with per-dept headcount + salary</li>
              <li>Headcount, role, and salary data can be added manually and will display here automatically</li>
            </ul>
          </div>
        </div>
      </div>

      {/* % of total revenue */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-white mb-4">Payroll as % of Revenue</h2>
        <div className="grid grid-cols-3 gap-4">
          {payrollByMonth.map((m, i) => {
            const rev = statements[i].acct115Deposits;
            const pct = (m.amount / rev) * 100;
            return (
              <div key={m.month} className="text-center">
                <div className="text-2xl font-bold text-white mb-1">{pct.toFixed(1)}%</div>
                <div className="text-sm text-gray-400">{m.shortMonth} 2026</div>
                <div className="text-xs text-gray-500 mt-1">{fmt(m.amount)} / {fmt(rev)}</div>
                <div className={`mt-2 text-xs font-medium ${pct < 10 ? "text-green-400" : pct < 15 ? "text-yellow-400" : "text-red-400"}`}>
                  {pct < 10 ? "✓ Healthy" : pct < 15 ? "Moderate" : "Review"}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
