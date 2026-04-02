import MetricCard from "@/components/MetricCard";

// March 2026 data from your sheets — will be live API data in Phase 3
const marchSpend = [
  { platform: "Google Shopping", spend: 204529.99, color: "bg-blue-500" },
  { platform: "Connexity", spend: 3195.18, color: "bg-purple-500" },
  { platform: "Bing / Microsoft", spend: 10470.05, color: "bg-teal-500" },
  { platform: "Meta", spend: 1893.60, color: "bg-indigo-500" },
  { platform: "Pinterest", spend: 1748.89, color: "bg-pink-500" },
  { platform: "Amazon Ads", spend: 0, color: "bg-orange-500" },
];

const totalSpend = marchSpend.reduce((sum, p) => sum + p.spend, 0);

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

export default function AdSpendPage() {
  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">All Ad Spend</h1>
        <p className="text-gray-400 mt-1">All platforms — March 2026 (from sheets, live APIs in Phase 3)</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <MetricCard label="Total Ad Spend" value={fmt(totalSpend)} subtext="March 2026" highlight />
        <MetricCard label="Blended ROAS" value="3.29" subtext="Conv Value / Spend" />
        <MetricCard label="Net Revenue" value="$821,064" subtext="After COGS + refunds" />
        <MetricCard label="ROI" value="3.70" subtext="Net Rev / Spend" />
      </div>

      {/* Platform breakdown */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
        <h2 className="text-base font-semibold text-white mb-4">Spend by Platform</h2>
        <div className="space-y-4">
          {marchSpend.map((p) => {
            const pct = totalSpend > 0 ? (p.spend / totalSpend) * 100 : 0;
            return (
              <div key={p.platform} className="flex items-center gap-4">
                <div className="w-36 text-sm text-gray-300 flex-shrink-0">{p.platform}</div>
                <div className="flex-1 bg-gray-800 rounded-full h-2">
                  <div className={`${p.color} rounded-full h-2 transition-all`} style={{ width: `${pct}%` }} />
                </div>
                <div className="w-24 text-right text-sm text-white font-medium">{fmt(p.spend)}</div>
                <div className="w-12 text-right text-xs text-gray-500">{pct.toFixed(1)}%</div>
              </div>
            );
          })}
        </div>

        <div className="mt-4 pt-4 border-t border-gray-800 flex justify-between">
          <span className="text-sm text-gray-400">Total</span>
          <span className="text-sm font-bold text-white">{fmt(totalSpend)}</span>
        </div>
      </div>

      {/* Monthly trend table */}
      <div className="mt-6 bg-gray-900 rounded-xl border border-gray-800 p-6">
        <h2 className="text-base font-semibold text-white mb-4">Monthly Trend (2026)</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-500 text-xs uppercase tracking-wider border-b border-gray-800">
                <th className="pb-3 text-left">Month</th>
                <th className="pb-3 text-right">Google</th>
                <th className="pb-3 text-right">Connexity</th>
                <th className="pb-3 text-right">Bing</th>
                <th className="pb-3 text-right">Meta</th>
                <th className="pb-3 text-right">Pinterest</th>
                <th className="pb-3 text-right font-semibold text-gray-300">Total</th>
                <th className="pb-3 text-right">ROAS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {[
                { month: "Jan 2026", google: 142338, conn: 4697, bing: 12918, meta: 540, pint: 550, total: 163615, roas: 3.59 },
                { month: "Feb 2026", google: 160341, conn: 3552, bing: 11316, meta: 1789, pint: 1025, total: 180602, roas: 3.62 },
                { month: "Mar 2026", google: 204530, conn: 3195, bing: 10470, meta: 1894, pint: 1749, total: 221837, roas: 3.29 },
              ].map((row) => (
                <tr key={row.month} className="text-gray-300">
                  <td className="py-3 text-gray-400">{row.month}</td>
                  <td className="py-3 text-right">{fmt(row.google)}</td>
                  <td className="py-3 text-right">{fmt(row.conn)}</td>
                  <td className="py-3 text-right">{fmt(row.bing)}</td>
                  <td className="py-3 text-right">{fmt(row.meta)}</td>
                  <td className="py-3 text-right">{fmt(row.pint)}</td>
                  <td className="py-3 text-right font-semibold text-white">{fmt(row.total)}</td>
                  <td className="py-3 text-right text-green-400">{row.roas}x</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-gray-600 mt-3">Data from 2026 Monthly Ad Spend Performance sheet — will be replaced with live API data</p>
      </div>
    </div>
  );
}
