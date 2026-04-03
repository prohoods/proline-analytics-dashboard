export default function CFOLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      {/* CFO restricted banner */}
      <div className="bg-emerald-900/30 border-b border-emerald-700/30 px-8 py-2 flex items-center gap-2">
        <svg className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
        <span className="text-xs text-emerald-400 font-medium">CFO — Restricted Access</span>
      </div>
      {children}
    </div>
  );
}
