import Link from "next/link";

export default function Portal() {
  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center p-6">
      {/* Logo */}
      <div className="flex items-center gap-3 mb-12">
        <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center">
          <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
        </div>
        <div>
          <div className="text-white font-semibold text-lg leading-tight">Proline Analytics</div>
          <div className="text-gray-500 text-sm">DZV Distributing LLC</div>
        </div>
      </div>

      <p className="text-gray-400 text-sm mb-8">Select a dashboard to continue</p>

      {/* Three cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 w-full max-w-4xl">

        {/* Analytics */}
        <Link
          href="/dashboard"
          prefetch={false}
          className="group bg-gray-900 border border-gray-800 hover:border-blue-700/60 rounded-2xl p-8 transition-all hover:bg-gray-900/80 flex flex-col gap-5"
        >
          <div className="w-12 h-12 rounded-xl bg-blue-600/20 border border-blue-700/40 flex items-center justify-center group-hover:bg-blue-600/30 transition-colors">
            <svg className="w-6 h-6 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
            </svg>
          </div>
          <div>
            <h2 className="text-white font-semibold text-lg mb-1.5">Analytics</h2>
            <p className="text-gray-500 text-sm leading-relaxed">Revenue, ad spend, ROAS, Shopify orders, email marketing, and platform performance.</p>
          </div>
          <div className="flex items-center gap-1.5 text-blue-400 text-sm font-medium mt-auto">
            Enter Analytics
            <svg className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </Link>

        {/* Finance Hub */}
        <Link
          href="/finance"
          className="group bg-gray-900 border border-gray-800 hover:border-emerald-700/60 rounded-2xl p-8 transition-all hover:bg-gray-900/80 flex flex-col gap-5"
        >
          <div className="w-12 h-12 rounded-xl bg-emerald-600/20 border border-emerald-700/40 flex items-center justify-center group-hover:bg-emerald-600/30 transition-colors">
            <svg className="w-6 h-6 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <div>
            <h2 className="text-white font-semibold text-lg mb-1.5">Finance Hub</h2>
            <p className="text-gray-500 text-sm leading-relaxed">Cash flow, P&amp;L, expenses by category, payroll, and bank statement analysis.</p>
          </div>
          <div className="flex items-center gap-1.5 text-emerald-400 text-sm font-medium mt-auto">
            Enter Finance Hub
            <svg className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </Link>

        {/* AI Reporting */}
        <Link
          href="/ai-reporting"
          prefetch={false}
          className="group bg-gray-900 border border-gray-800 hover:border-violet-700/60 rounded-2xl p-8 transition-all hover:bg-gray-900/80 flex flex-col gap-5"
        >
          <div className="w-12 h-12 rounded-xl bg-violet-600/20 border border-violet-700/40 flex items-center justify-center group-hover:bg-violet-600/30 transition-colors">
            <svg className="w-6 h-6 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M12 8V4H8m8 0h4v4M4 8V4h4m0 16H4v-4m12 4h4v-4M9 12h.01M15 12h.01M9 16c.85.63 1.885 1 3 1s2.15-.37 3-1" />
            </svg>
          </div>
          <div>
            <h2 className="text-white font-semibold text-lg mb-1.5">AI Reporting</h2>
            <p className="text-gray-500 text-sm leading-relaxed">Call transcripts, sales vs support classification, sentiment, and AI-generated summaries.</p>
          </div>
          <div className="flex items-center gap-1.5 text-violet-400 text-sm font-medium mt-auto">
            Enter AI Reporting
            <svg className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </Link>

      </div>

      <p className="text-gray-700 text-xs mt-10">Finance Hub requires access credentials</p>
    </div>
  );
}
