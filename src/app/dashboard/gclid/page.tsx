import MetricCard from "@/components/MetricCard";

export default function GCLIDPage() {
  // March 2026 monthly summary from your sheet
  const monthly = {
    totalOrders: 322,
    ordersWithGCLID: 76,
    attributionRate: "23.60%",
    revenueAll: "$367,398.53",
    revenueGoogleAds: "$111,387.18",
    adSpend: "$81,856.64",
    roas: "136.08%",
    costPerAcquisition: "$1,077.06",
  };

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">GCLID Attribution</h1>
        <p className="text-gray-400 mt-1">Google Click ID tracking — order attribution to Google Ads</p>
      </div>

      {/* Monthly summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <MetricCard label="Total Orders" value={monthly.totalOrders.toString()} subtext="March 2026" />
        <MetricCard label="Orders w/ GCLID" value={monthly.ordersWithGCLID.toString()} subtext="Attributed to Google" highlight />
        <MetricCard label="Attribution Rate" value={monthly.attributionRate} subtext="GCLID / Total orders" />
        <MetricCard label="Cost per Acquisition" value={monthly.costPerAcquisition} subtext="March 2026" />
        <MetricCard label="Revenue (All)" value={monthly.revenueAll} subtext="All channels" />
        <MetricCard label="Revenue (Google Ads)" value={monthly.revenueGoogleAds} subtext="GCLID-attributed" />
        <MetricCard label="Ad Spend" value={monthly.adSpend} subtext="March 2026" />
        <MetricCard label="ROAS" value={monthly.roas} subtext="Reported Google ROAS" trend="up" />
      </div>

      {/* Daily table */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
        <h2 className="text-base font-semibold text-white mb-1">Daily Summary — March 2026</h2>
        <p className="text-xs text-gray-500 mb-4">From GCLID Reporting sheet — Daily Summary tab</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-500 text-xs uppercase tracking-wider border-b border-gray-800">
                <th className="pb-3 text-left">Date</th>
                <th className="pb-3 text-right">Total Orders</th>
                <th className="pb-3 text-right">w/ GCLID</th>
                <th className="pb-3 text-right">Attribution</th>
                <th className="pb-3 text-right">Revenue (All)</th>
                <th className="pb-3 text-right">Revenue (Google)</th>
                <th className="pb-3 text-right">Ad Spend</th>
                <th className="pb-3 text-right">ROAS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {[
                { date: "2026-04-01", orders: 16, gclid: 7, rate: "43.75%", revAll: "$15,366.68", revGoogle: "$7,793.87", spend: "$0.00", roas: "0.0" },
                { date: "2026-03-31", orders: 35, gclid: 14, rate: "40.00%", revAll: "$52,083.38", revGoogle: "$19,662.44", spend: "$5,715.72", roas: "3.4" },
                { date: "2026-03-30", orders: 52, gclid: 23, rate: "44.23%", revAll: "$52,304.62", revGoogle: "$30,501.05", spend: "$6,300.01", roas: "4.8" },
                { date: "2026-03-29", orders: 21, gclid: 13, rate: "61.90%", revAll: "$22,410.60", revGoogle: "$14,549.64", spend: "$4,290.39", roas: "3.4" },
                { date: "2026-03-28", orders: 15, gclid: 8, rate: "53.33%", revAll: "$21,030.58", revGoogle: "$12,250.56", spend: "$4,855.33", roas: "2.5" },
                { date: "2026-03-27", orders: 40, gclid: 16, rate: "40.00%", revAll: "$43,797.00", revGoogle: "$21,337.00", spend: "$5,069.73", roas: "4.2" },
              ].map((row) => (
                <tr key={row.date} className="text-gray-300 hover:bg-gray-800/50">
                  <td className="py-2.5 text-gray-400">{row.date}</td>
                  <td className="py-2.5 text-right">{row.orders}</td>
                  <td className="py-2.5 text-right text-blue-400">{row.gclid}</td>
                  <td className="py-2.5 text-right">{row.rate}</td>
                  <td className="py-2.5 text-right">{row.revAll}</td>
                  <td className="py-2.5 text-right text-blue-300">{row.revGoogle}</td>
                  <td className="py-2.5 text-right">{row.spend}</td>
                  <td className="py-2.5 text-right text-green-400">{row.roas}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-gray-600 mt-3">Showing recent rows — full live data via Google Sheets API in Phase 2</p>
      </div>
    </div>
  );
}
