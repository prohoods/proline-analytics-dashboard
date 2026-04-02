export default function GoogleAdsPage() {
  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Google Ads</h1>
        <p className="text-gray-400 mt-1">Customer ID: 329-838-9676</p>
      </div>

      <div className="bg-gray-900 rounded-xl border border-gray-800 p-8 text-center">
        <div className="text-4xl mb-4">🔵</div>
        <h2 className="text-lg font-semibold text-white mb-2">Google Ads API Integration</h2>
        <p className="text-gray-400 text-sm max-w-md mx-auto">
          Will show spend, clicks, impressions, conversions, ROAS, and GCLID attribution — pulled live from Google Ads API (Customer ID: 329-838-9676).
        </p>
        <div className="mt-6 inline-flex items-center gap-2 bg-yellow-900/20 border border-yellow-700/30 rounded-lg px-4 py-2">
          <span className="text-yellow-400 text-sm font-medium">Phase 3 — Ad reporting</span>
        </div>
      </div>
    </div>
  );
}
