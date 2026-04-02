import MetricCard from "@/components/MetricCard";

const campaignData = [
  { tier: "$300–599", campaign: "Performance Max | <$1.2k", shopCost30: 1054.35, shopCostMTD: 816.74, convVal30: 3784.25, convValMTD: 2182.06, netProfit30: 2400.59, netProfitMTD: 1177.39 },
  { tier: "$600–899", campaign: "Performance Max | <$1.2k", shopCost30: 4599.42, shopCostMTD: 3279.29, convVal30: 21746.07, convValMTD: 12595.76, netProfit30: 15706.00, netProfitMTD: 8369.38 },
  { tier: "$900–1199", campaign: "Performance Max | <$1.2k", shopCost30: 2162.56, shopCostMTD: 1601.60, convVal30: 3627.12, convValMTD: 1270.09, netProfit30: 1218.19, netProfitMTD: -450.83 },
  { tier: "$1200–1499", campaign: "Perf Max | >$1.2k<$2.1K", shopCost30: 3506.50, shopCostMTD: 2772.03, convVal30: 10451.18, convValMTD: 10451.18, netProfit30: 6399.84, netProfitMTD: 7134.31 },
  { tier: "$300–599", campaign: "<1200 Shopping Campaign", shopCost30: 4788.34, shopCostMTD: 3946.71, convVal30: 16908.41, convValMTD: 13943.04, netProfit30: 10781.14, netProfitMTD: 8873.82 },
  { tier: "$600–899", campaign: "<1200 Shopping Campaign", shopCost30: 18988.17, shopCostMTD: 15279.90, convVal30: 53111.79, convValMTD: 40564.27, netProfit30: 22050.83, netProfitMTD: 2995.27 },
  { tier: "$900–1199", campaign: "<1200 Shopping Campaign", shopCost30: 7055.45, shopCostMTD: 5545.93, convVal30: 25154.51, convValMTD: 25542.72, netProfit30: 16276.41, netProfitMTD: 18188.75 },
];

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

export default function PMAXPage() {
  const totals = campaignData.reduce(
    (acc, row) => ({ shopCost30: acc.shopCost30 + row.shopCost30, shopCostMTD: acc.shopCostMTD + row.shopCostMTD, convVal30: acc.convVal30 + row.convVal30, convValMTD: acc.convValMTD + row.convValMTD, netProfit30: acc.netProfit30 + row.netProfit30, netProfitMTD: acc.netProfitMTD + row.netProfitMTD }),
    { shopCost30: 0, shopCostMTD: 0, convVal30: 0, convValMTD: 0, netProfit30: 0, netProfitMTD: 0 }
  );

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">PMAX & Shopping Performance</h1>
        <p className="text-gray-400 mt-1">Performance Max and Shopping campaigns by product tier</p>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        <MetricCard label="Shopping Cost (30d)" value={fmt(totals.shopCost30)} />
        <MetricCard label="Shopping Cost (MTD)" value={fmt(totals.shopCostMTD)} />
        <MetricCard label="Conv Value (30d)" value={fmt(totals.convVal30)} highlight />
        <MetricCard label="Conv Value (MTD)" value={fmt(totals.convValMTD)} highlight />
        <MetricCard label="Net Profit (30d)" value={fmt(totals.netProfit30)} trend="up" />
        <MetricCard label="Net Profit (MTD)" value={fmt(totals.netProfitMTD)} trend="up" />
      </div>
      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-500 text-xs uppercase tracking-wider bg-gray-800/50 border-b border-gray-800">
                <th className="py-3 px-4 text-left">Tier</th>
                <th className="py-3 px-4 text-left">Campaign</th>
                <th className="py-3 px-4 text-right">Cost 30d</th>
                <th className="py-3 px-4 text-right">Cost MTD</th>
                <th className="py-3 px-4 text-right">Conv Val 30d</th>
                <th className="py-3 px-4 text-right">Conv Val MTD</th>
                <th className="py-3 px-4 text-right">Net Profit 30d</th>
                <th className="py-3 px-4 text-right">Net Profit MTD</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {campaignData.map((row, i) => (
                <tr key={i} className="text-gray-300 hover:bg-gray-800/40">
                  <td className="py-2.5 px-4 text-xs text-gray-400">{row.tier}</td>
                  <td className="py-2.5 px-4 text-xs">{row.campaign}</td>
                  <td className="py-2.5 px-4 text-right text-xs">{fmt(row.shopCost30)}</td>
                  <td className="py-2.5 px-4 text-right text-xs">{fmt(row.shopCostMTD)}</td>
                  <td className="py-2.5 px-4 text-right text-xs text-blue-300">{fmt(row.convVal30)}</td>
                  <td className="py-2.5 px-4 text-right text-xs text-blue-300">{fmt(row.convValMTD)}</td>
                  <td className={`py-2.5 px-4 text-right text-xs font-medium ${row.netProfit30 >= 0 ? "text-green-400" : "text-red-400"}`}>{fmt(row.netProfit30)}</td>
                  <td className={`py-2.5 px-4 text-right text-xs font-medium ${row.netProfitMTD >= 0 ? "text-green-400" : "text-red-400"}`}>{fmt(row.netProfitMTD)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-gray-700 bg-gray-800/50 font-semibold text-white text-xs">
                <td className="py-3 px-4" colSpan={2}>Total</td>
                <td className="py-3 px-4 text-right">{fmt(totals.shopCost30)}</td>
                <td className="py-3 px-4 text-right">{fmt(totals.shopCostMTD)}</td>
                <td className="py-3 px-4 text-right">{fmt(totals.convVal30)}</td>
                <td className="py-3 px-4 text-right">{fmt(totals.convValMTD)}</td>
                <td className="py-3 px-4 text-right text-green-400">{fmt(totals.netProfit30)}</td>
                <td className="py-3 px-4 text-right text-green-400">{fmt(totals.netProfitMTD)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}
