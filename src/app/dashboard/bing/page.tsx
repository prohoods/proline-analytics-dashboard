export default function BingPage() {
  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Bing / Microsoft Ads</h1>
        <p className="text-gray-400 mt-1">Microsoft Advertising — Account F119XJ59</p>
        <div className="mt-2 inline-flex items-center gap-2 bg-yellow-900/20 border border-yellow-700/30 rounded-lg px-3 py-1.5">
          <span className="text-yellow-400 text-xs font-medium">Manual monthly data — enter via Google Sheet</span>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { title: "PMAX", href: "/dashboard/bing/pmax", desc: ">1200 PMAX and >1200 <2100 campaigns", active: true },
          { title: "Shopping", href: "/dashboard/bing/shopping", desc: "Standard Shopping campaigns", active: false },
          { title: "Branded & Search", href: "/dashboard/bing/search", desc: "Nonbranded Search, Branded Search, Branded SKU", active: true },
        ].map(section => (
          <a key={section.title} href={section.href} className="bg-gray-900 rounded-xl border border-gray-800 p-5 hover:border-gray-700 transition-colors">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold text-white">{section.title}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full ${section.active ? "bg-green-900/40 text-green-400" : "bg-gray-800 text-gray-500"}`}>
                {section.active ? "Active" : "Paused"}
              </span>
            </div>
            <p className="text-xs text-gray-400">{section.desc}</p>
          </a>
        ))}
      </div>
      <div className="mt-6 bg-blue-900/10 border border-blue-700/30 rounded-xl p-5">
        <div className="text-sm font-semibold text-white mb-1">Microsoft Ads API — Future Integration</div>
        <p className="text-xs text-gray-400">Microsoft Advertising has a REST API. Once connected it will pull the same campaign-level data as Google Ads automatically. For now, enter monthly spend totals in the Google Sheet.</p>
      </div>
    </div>
  );
}
