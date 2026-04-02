import MetricCard from "@/components/MetricCard";

// Placeholder data — will be replaced with live API data in Phase 2
const overviewMetrics = [
  { label: "MTD Net Sales", value: "$1,265,696", subtext: "March 2026", trend: "up" as const, trendValue: "+38% vs Feb" },
  { label: "MTD Ad Spend", value: "$221,837", subtext: "All platforms", trend: "up" as const, trendValue: "+23% vs Feb" },
  { label: "Blended ROAS", value: "3.29", subtext: "March 2026", trend: "down" as const, trendValue: "-9% vs Feb" },
  { label: "Google ROAS", value: "3.57", subtext: "March 2026", highlight: true },
  { label: "MER", value: "5.70", subtext: "Net Sales / Total Spend" },
  { label: "Net Revenue", value: "$821,064", subtext: "After COGS + refunds" },
];

const channelSales = [
  { channel: "PRH (Proline)", mtd: "$1,009,409", pct: "79.8%" },
  { channel: "PP (Proline Pro)", mtd: "$83,639", pct: "6.6%" },
  { channel: "Phone Sales", mtd: "$228,262", pct: "18.0%" },
  { channel: "SHL (Smart Home Luxury)", mtd: "$26,643", pct: "2.1%" },
  { channel: "Marketplaces", mtd: "$46,123", pct: "3.6%" },
];

export default function DashboardOverview() {
  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Overview</h1>
        <p className="text-gray-400 mt-1">Proline Range Hoods — March 2026</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        {overviewMetrics.map((m) => (
          <MetricCard key={m.label} {...m} />
        ))}
      </div>

      {/* Sales by Channel */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 mb-6">
        <h2 className="text-base font-semibold text-white mb-4">Sales by Channel — March 2026</h2>
        <div className="space-y-3">
          {channelSales.map((row) => (
            <div key={row.channel} className="flex items-center gap-4">
              <div className="w-36 text-sm text-gray-400 flex-shrink-0">{row.channel}</div>
              <div className="flex-1 bg-gray-800 rounded-full h-2">
                <div
                  className="bg-blue-500 rounded-full h-2"
                  style={{ width: row.pct }}
                />
              </div>
              <div className="w-28 text-right text-sm text-white font-medium">{row.mtd}</div>
              <div className="w-12 text-right text-xs text-gray-500">{row.pct}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Ad Spend by Platform */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
        <h2 className="text-base font-semibold text-white mb-1">Ad Spend by Platform — March 2026</h2>
        <p className="text-xs text-gray-500 mb-4">Live data connects in Phase 3 — showing last known values</p>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { platform: "Google", spend: "$204,530" },
            { platform: "Connexity", spend: "$3,195" },
            { platform: "Bing", spend: "$10,470" },
            { platform: "Amazon", spend: "—" },
            { platform: "Meta", spend: "$1,894" },
            { platform: "Pinterest", spend: "$1,749" },
          ].map((p) => (
            <div key={p.platform} className="bg-gray-800 rounded-lg p-3 text-center">
              <div className="text-xs text-gray-400 mb-1">{p.platform}</div>
              <div className="text-sm font-semibold text-white">{p.spend}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Status Banner */}
      <div className="mt-6 bg-blue-900/20 border border-blue-700/30 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <div className="text-blue-400 mt-0.5">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-medium text-blue-300">Dashboard in active development</p>
            <p className="text-xs text-blue-400/70 mt-0.5">
              Phase 1 complete — dashboard shell and auth live. Phase 2 connects Shopify API for live sales data. Numbers shown are from your sheets for reference.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
