import MetricCard from "@/components/MetricCard";

// These will connect to a CFO Google Sheet in next phase
// Structure shown here so you can see exactly what we're building toward
const mockExpenses = {
  payroll: 95000,
  subscriptions: 8400,
  hsa: 3200,
  insurance: 4100,
  warehouse: 12000,
  shipping: 18500,
  contractors: 6200,
  misc: 2800,
};

const totalExpenses = Object.values(mockExpenses).reduce((a, b) => a + b, 0);
const grossRevenue = 1265696;
const adSpend = 221837;
const totalCosts = totalExpenses + adSpend;
const netProfit = grossRevenue - totalCosts;

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

const expenseRows = [
  { label: "Payroll (est. 20 employees)", amount: mockExpenses.payroll, category: "People", color: "bg-blue-500" },
  { label: "HSA Contributions", amount: mockExpenses.hsa, category: "People", color: "bg-blue-400" },
  { label: "Health Insurance", amount: mockExpenses.insurance, category: "People", color: "bg-blue-300" },
  { label: "Warehouse & Fulfillment", amount: mockExpenses.warehouse, category: "Operations", color: "bg-orange-500" },
  { label: "Shipping Costs", amount: mockExpenses.shipping, category: "Operations", color: "bg-orange-400" },
  { label: "Software Subscriptions", amount: mockExpenses.subscriptions, category: "Tools", color: "bg-purple-500" },
  { label: "Contractors / Freelancers", amount: mockExpenses.contractors, category: "People", color: "bg-blue-200" },
  { label: "Miscellaneous", amount: mockExpenses.misc, category: "Other", color: "bg-gray-500" },
];

export default function CFOOverview() {
  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Financial Overview</h1>
        <p className="text-gray-400 mt-1">March 2026 — all company expenses + revenue</p>
        <div className="mt-2 inline-flex items-center gap-2 bg-yellow-900/20 border border-yellow-700/30 rounded-lg px-3 py-1.5">
          <span className="text-yellow-400 text-xs font-medium">Expense data is estimated — connect CFO sheet to go live</span>
        </div>
      </div>

      {/* Top KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <MetricCard label="Gross Revenue" value={fmt(grossRevenue)} subtext="March 2026" highlight />
        <MetricCard label="Total Ad Spend" value={fmt(adSpend)} subtext="All platforms" trend="down" trendValue="17.5% of revenue" />
        <MetricCard label="Operating Expenses" value={fmt(totalExpenses)} subtext="Excl. ad spend" />
        <MetricCard
          label="Est. Net Profit"
          value={fmt(netProfit)}
          subtext="Revenue − all costs"
          trend={netProfit > 0 ? "up" : "down"}
          trendValue={`${((netProfit / grossRevenue) * 100).toFixed(1)}% margin`}
        />
      </div>

      {/* Expense breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Bar chart */}
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
          <h2 className="text-base font-semibold text-white mb-4">Expense Breakdown</h2>
          <div className="space-y-3">
            {expenseRows.map((row) => {
              const pct = (row.amount / totalExpenses) * 100;
              return (
                <div key={row.label} className="flex items-center gap-3">
                  <div className="w-40 text-xs text-gray-400 flex-shrink-0 truncate">{row.label}</div>
                  <div className="flex-1 bg-gray-800 rounded-full h-1.5">
                    <div className={`${row.color} rounded-full h-1.5`} style={{ width: `${pct}%` }} />
                  </div>
                  <div className="w-20 text-right text-xs text-white font-medium">{fmt(row.amount)}</div>
                </div>
              );
            })}
          </div>
          <div className="mt-4 pt-4 border-t border-gray-800 flex justify-between">
            <span className="text-xs text-gray-400">Total Operating Expenses</span>
            <span className="text-xs font-bold text-white">{fmt(totalExpenses)}</span>
          </div>
        </div>

        {/* P&L summary */}
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
          <h2 className="text-base font-semibold text-white mb-4">P&L Summary</h2>
          <div className="space-y-2">
            {[
              { label: "Gross Revenue", value: grossRevenue, type: "revenue" },
              { label: "Ad Spend", value: -adSpend, type: "expense" },
              { label: "Payroll & Benefits", value: -(mockExpenses.payroll + mockExpenses.hsa + mockExpenses.insurance), type: "expense" },
              { label: "Warehouse & Shipping", value: -(mockExpenses.warehouse + mockExpenses.shipping), type: "expense" },
              { label: "Subscriptions", value: -mockExpenses.subscriptions, type: "expense" },
              { label: "Contractors", value: -mockExpenses.contractors, type: "expense" },
              { label: "Misc", value: -mockExpenses.misc, type: "expense" },
            ].map((row) => (
              <div key={row.label} className="flex justify-between items-center py-1.5 border-b border-gray-800/50">
                <span className="text-sm text-gray-400">{row.label}</span>
                <span className={`text-sm font-medium ${row.value >= 0 ? "text-green-400" : "text-red-400"}`}>
                  {row.value >= 0 ? fmt(row.value) : `(${fmt(Math.abs(row.value))})`}
                </span>
              </div>
            ))}
            <div className="flex justify-between items-center pt-3">
              <span className="text-sm font-bold text-white">Net Profit</span>
              <span className={`text-sm font-bold ${netProfit >= 0 ? "text-green-400" : "text-red-400"}`}>
                {fmt(netProfit)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* What we still need */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
        <h2 className="text-base font-semibold text-white mb-3">CFO Data Needed — Action Items</h2>
        <p className="text-xs text-gray-500 mb-4">These are the data sources we need to connect to make this section fully live.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {[
            { item: "Monthly payroll totals by department", source: "Gusto / ADP / manual", priority: "High" },
            { item: "HSA contribution amounts", source: "Benefits provider", priority: "High" },
            { item: "Health insurance premiums", source: "Insurance provider", priority: "High" },
            { item: "Software subscriptions list", source: "Bank statement / manual", priority: "High" },
            { item: "Warehouse & fulfillment costs", source: "QuickBooks / manual", priority: "Medium" },
            { item: "Shipping cost totals", source: "Shopify / ShipStation", priority: "Medium" },
            { item: "Contractor payments", source: "Bank statement / manual", priority: "Medium" },
            { item: "Bank statement access", source: "Bank / QuickBooks", priority: "High" },
          ].map((row) => (
            <div key={row.item} className="flex items-start gap-3 bg-gray-800/50 rounded-lg p-3">
              <div className={`mt-0.5 w-2 h-2 rounded-full flex-shrink-0 ${row.priority === "High" ? "bg-red-400" : "bg-yellow-400"}`} />
              <div>
                <div className="text-sm text-white">{row.item}</div>
                <div className="text-xs text-gray-500 mt-0.5">Source: {row.source}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
