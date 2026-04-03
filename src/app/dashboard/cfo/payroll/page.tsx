import MetricCard from "@/components/MetricCard";

// Placeholder structure — will pull from CFO Google Sheet once built
// Department breakdown for ~20 employees

const departments = [
  { name: "Sales", headcount: 6, avgSalary: 55000, benefits: 8000 },
  { name: "Marketing", headcount: 3, avgSalary: 65000, benefits: 4500 },
  { name: "Customer Service", headcount: 4, avgSalary: 45000, benefits: 6000 },
  { name: "Warehouse / Operations", headcount: 4, avgSalary: 42000, benefits: 6000 },
  { name: "Management", headcount: 2, avgSalary: 95000, benefits: 3000 },
  { name: "Finance / Admin", headcount: 1, avgSalary: 70000, benefits: 1500 },
];

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

export default function PayrollPage() {
  const totalHeadcount = departments.reduce((s, d) => s + d.headcount, 0);
  const totalAnnualSalaries = departments.reduce((s, d) => s + d.headcount * d.avgSalary, 0);
  const totalAnnualBenefits = departments.reduce((s, d) => s + d.benefits, 0);
  const totalAnnual = totalAnnualSalaries + totalAnnualBenefits;
  const totalMonthly = totalAnnual / 12;

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Payroll & Benefits</h1>
        <p className="text-gray-400 mt-1">~{totalHeadcount} employees across all departments</p>
        <div className="mt-2 inline-flex items-center gap-2 bg-yellow-900/20 border border-yellow-700/30 rounded-lg px-3 py-1.5">
          <span className="text-yellow-400 text-xs font-medium">Estimated — connect payroll provider or CFO sheet to go live</span>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <MetricCard label="Total Employees" value={totalHeadcount.toString()} subtext="Full & part time" />
        <MetricCard label="Monthly Payroll" value={fmt(totalMonthly)} subtext="Salaries + benefits" highlight />
        <MetricCard label="Annual Salaries" value={fmt(totalAnnualSalaries)} subtext="Base compensation" />
        <MetricCard label="Annual Benefits" value={fmt(totalAnnualBenefits)} subtext="HSA, insurance, etc." />
      </div>

      {/* Department breakdown */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden mb-6">
        <div className="px-6 py-4 border-b border-gray-800">
          <h2 className="text-sm font-semibold text-white">By Department</h2>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-500 text-xs uppercase tracking-wider bg-gray-800/50 border-b border-gray-800">
              <th className="py-3 px-4 text-left">Department</th>
              <th className="py-3 px-4 text-right">Headcount</th>
              <th className="py-3 px-4 text-right">Avg Salary</th>
              <th className="py-3 px-4 text-right">Annual Benefits</th>
              <th className="py-3 px-4 text-right">Annual Total</th>
              <th className="py-3 px-4 text-right">Monthly Cost</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {departments.map(dept => {
              const annual = dept.headcount * dept.avgSalary + dept.benefits;
              return (
                <tr key={dept.name} className="text-gray-300 hover:bg-gray-800/40">
                  <td className="py-2.5 px-4 font-medium">{dept.name}</td>
                  <td className="py-2.5 px-4 text-right">{dept.headcount}</td>
                  <td className="py-2.5 px-4 text-right">{fmt(dept.avgSalary)}</td>
                  <td className="py-2.5 px-4 text-right text-gray-400">{fmt(dept.benefits)}</td>
                  <td className="py-2.5 px-4 text-right text-white font-medium">{fmt(annual)}</td>
                  <td className="py-2.5 px-4 text-right text-emerald-400">{fmt(annual / 12)}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-gray-700 bg-gray-800/50 font-semibold text-white">
              <td className="py-3 px-4">Total</td>
              <td className="py-3 px-4 text-right">{totalHeadcount}</td>
              <td className="py-3 px-4" />
              <td className="py-3 px-4 text-right">{fmt(totalAnnualBenefits)}</td>
              <td className="py-3 px-4 text-right">{fmt(totalAnnual)}</td>
              <td className="py-3 px-4 text-right text-emerald-400">{fmt(totalMonthly)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* What we need to go live */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
        <h2 className="text-sm font-semibold text-white mb-3">To Connect Live Payroll Data</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {[
            { option: "Gusto", desc: "If you use Gusto for payroll — we can connect via API", difficulty: "Easy" },
            { option: "ADP / Paychex", desc: "Export monthly summary CSV → upload to CFO sheet", difficulty: "Medium" },
            { option: "Manual CFO Sheet", desc: "You enter monthly payroll totals — we read from sheet", difficulty: "Easy" },
          ].map(opt => (
            <div key={opt.option} className="bg-gray-800/50 rounded-lg p-4">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-white">{opt.option}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full ${opt.difficulty === "Easy" ? "bg-green-900/40 text-green-400" : "bg-yellow-900/40 text-yellow-400"}`}>
                  {opt.difficulty}
                </span>
              </div>
              <p className="text-xs text-gray-400">{opt.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
