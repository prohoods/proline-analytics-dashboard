import Link from "next/link";

interface Feature {
  title: string;
  description: string;
}

interface Props {
  title: string;
  icon: string;
  description: string;
  features: Feature[];
}

export default function ComingSoonSection({ title, icon, description, features }: Props) {
  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-emerald-900/40 border border-emerald-800/40 flex items-center justify-center text-xl">
          {icon}
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">{title}</h1>
          <p className="text-gray-500 text-sm mt-0.5">{description}</p>
        </div>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-yellow-900/40 text-yellow-400 border border-yellow-800/40 uppercase tracking-wider">
            Planned
          </span>
          <span className="text-xs text-gray-500">Needs full transaction-level data to activate</span>
        </div>

        <h2 className="text-sm font-semibold text-white mb-3">What this section will include</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {features.map(f => (
            <div key={f.title} className="bg-gray-800/40 border border-gray-800 rounded-lg p-3">
              <div className="text-white text-sm font-medium">{f.title}</div>
              <div className="text-xs text-gray-400 mt-1 leading-relaxed">{f.description}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-white mb-2">Unblocks this section</h2>
        <ul className="text-sm text-gray-400 space-y-1.5 list-disc list-inside">
          <li>Full 2025 + 2026 YTD KeyBank statements (accounts …0115 and …2285)</li>
          <li>Any other bank/credit card statements referenced by transfers</li>
          <li>KeyBank ACH detail export (to resolve the $1.6M &quot;KBBO&quot; bucket)</li>
        </ul>
        <Link
          href="/finance/upload"
          className="inline-flex items-center gap-2 mt-4 px-3 py-2 rounded-lg bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30 text-sm font-medium transition-colors"
        >
          <span>📤</span>
          Upload statements
        </Link>
      </div>
    </div>
  );
}
