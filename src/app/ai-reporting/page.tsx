import Link from "next/link";
import { getSql } from "@/lib/db";

export const dynamic = "force-dynamic";

interface CallRow {
  id: string;
  phone_e164: string;
  call_started_at: Date;
  duration_seconds: number | null;
  transcription_status: string | null;
  category: string | null;
  summary: string | null;
  sentiment: string | null;
  key_points: string[] | null;
  follow_up_needed: boolean | null;
  error_message: string | null;
}

interface CategoryRow {
  category: string | null;
  count: number;
}

const FILTERS = ["all", "sales", "support", "other"] as const;
type Filter = (typeof FILTERS)[number];

async function loadData(filter: Filter) {
  const sql = getSql();
  try {
    const where =
      filter === "all"
        ? sql`call_started_at >= now() - interval '30 days'`
        : sql`call_started_at >= now() - interval '30 days' and category = ${filter}`;

    const [rows, byCategory, last24, followUps] = await Promise.all([
      sql<CallRow[]>`
        select id, phone_e164, call_started_at, duration_seconds,
               transcription_status, category, summary, sentiment,
               key_points, follow_up_needed, error_message
        from callrail_calls
        where ${where}
        order by call_started_at desc
        limit 200
      `,
      sql<CategoryRow[]>`
        select category, count(*)::int as count
        from callrail_calls
        where call_started_at >= now() - interval '30 days'
        group by category
      `,
      sql<{ count: number }[]>`
        select count(*)::int as count from callrail_calls
        where call_started_at >= now() - interval '24 hours'
      `,
      sql<{ count: number }[]>`
        select count(*)::int as count from callrail_calls
        where call_started_at >= now() - interval '30 days'
          and follow_up_needed = true
      `,
    ]);
    return {
      rows,
      byCategory,
      last24h: last24[0]?.count ?? 0,
      followUps: followUps[0]?.count ?? 0,
      error: null as string | null,
    };
  } catch (e) {
    return {
      rows: [] as CallRow[],
      byCategory: [] as CategoryRow[],
      last24h: 0,
      followUps: 0,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

function fmtDate(d: Date) {
  return new Date(d).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function fmtDuration(s: number | null) {
  if (s == null) return "—";
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

export default async function AIReportingPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const sp = await searchParams;
  const filter = (FILTERS as readonly string[]).includes(sp.filter ?? "")
    ? (sp.filter as Filter)
    : "all";

  const { rows, byCategory, last24h, followUps, error } = await loadData(filter);

  const total30d = byCategory.reduce((s, r) => s + r.count, 0);
  const sales = byCategory.find((r) => r.category === "sales")?.count ?? 0;
  const support = byCategory.find((r) => r.category === "support")?.count ?? 0;

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-white">Calls</h1>
        <p className="text-sm text-gray-400 mt-1">
          CallRail calls transcribed by AssemblyAI and classified by OpenAI.
          Sales vs support, sentiment, and AI-generated summaries.
        </p>
      </div>

      {error && (
        <div className="mb-6 p-4 rounded-lg border border-red-700 bg-red-900/20 text-red-200 text-sm">
          <div className="font-semibold">Database error</div>
          <div className="mt-1 text-red-300">{error}</div>
          <div className="mt-2 text-xs text-red-300">
            If the columns don&apos;t exist yet, run the migration:
            <code className="ml-1 px-1.5 py-0.5 rounded bg-black/40">
              POST /api/ai-reporting/migrate
            </code>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Stat label="Last 24h" value={last24h.toString()} />
        <Stat label="Sales (30d)" value={sales.toString()} accent="text-blue-400" />
        <Stat label="Support (30d)" value={support.toString()} accent="text-amber-400" />
        <Stat
          label="Follow-up needed (30d)"
          value={followUps.toString()}
          accent={followUps > 0 ? "text-rose-400" : "text-gray-400"}
        />
      </div>

      <div className="flex items-center gap-2 mb-4">
        {FILTERS.map((f) => {
          const isActive = filter === f;
          const count =
            f === "all"
              ? total30d
              : byCategory.find((r) => r.category === f)?.count ?? 0;
          return (
            <Link
              key={f}
              href={f === "all" ? "/ai-reporting" : `/ai-reporting?filter=${f}`}
              className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${
                isActive
                  ? "bg-violet-600/20 border-violet-700/60 text-violet-300"
                  : "bg-gray-900 border-gray-800 text-gray-400 hover:text-gray-100 hover:border-gray-700"
              }`}
            >
              <span className="capitalize">{f}</span>
              <span className="ml-2 text-xs text-gray-500">{count}</span>
            </Link>
          );
        })}
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
          <div className="text-sm text-white font-medium">Recent calls</div>
          <div className="text-xs text-gray-500">most recent 200 (last 30 days)</div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-sm">
            <thead className="text-gray-500 text-xs uppercase tracking-wider">
              <tr className="border-b border-gray-800">
                <th className="text-left px-4 py-2">Time</th>
                <th className="text-left px-4 py-2">From</th>
                <th className="text-right px-4 py-2">Duration</th>
                <th className="text-left px-4 py-2">Category</th>
                <th className="text-left px-4 py-2">Sentiment</th>
                <th className="text-left px-4 py-2">Summary</th>
                <th className="text-left px-4 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && !error && (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-gray-500 text-sm">
                    No calls yet. CallRail webhook activity will appear here.
                  </td>
                </tr>
              )}
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-gray-800/60 hover:bg-gray-800/30 align-top">
                  <td className="px-4 py-3 text-gray-300 whitespace-nowrap">{fmtDate(r.call_started_at)}</td>
                  <td className="px-4 py-3 text-gray-300 font-mono text-xs">{r.phone_e164}</td>
                  <td className="px-4 py-3 text-right text-gray-300 whitespace-nowrap">
                    {fmtDuration(r.duration_seconds)}
                  </td>
                  <td className="px-4 py-3">
                    <CategoryBadge category={r.category} />
                  </td>
                  <td className="px-4 py-3">
                    <SentimentBadge sentiment={r.sentiment} />
                  </td>
                  <td className="px-4 py-3 text-gray-300 max-w-[480px]">
                    {r.summary ? (
                      <div>
                        <div className="leading-snug">{r.summary}</div>
                        {r.follow_up_needed && (
                          <div className="mt-1 text-xs text-rose-400">⚠ Follow-up needed</div>
                        )}
                      </div>
                    ) : (
                      <span className="text-gray-600 text-xs italic">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={r.transcription_status} error={r.error_message} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, accent = "text-white" }: { label: string; value: string; accent?: string }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
      <div className="text-xs uppercase tracking-wider text-gray-500">{label}</div>
      <div className={`mt-1 text-2xl font-semibold ${accent}`}>{value}</div>
    </div>
  );
}

function CategoryBadge({ category }: { category: string | null }) {
  if (!category) return <span className="text-gray-600 text-xs">—</span>;
  const styles: Record<string, string> = {
    sales: "bg-blue-900/40 text-blue-300 border-blue-700/50",
    support: "bg-amber-900/40 text-amber-300 border-amber-700/50",
    other: "bg-gray-800 text-gray-400 border-gray-700",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs border capitalize ${styles[category] ?? styles.other}`}>
      {category}
    </span>
  );
}

function SentimentBadge({ sentiment }: { sentiment: string | null }) {
  if (!sentiment) return <span className="text-gray-600 text-xs">—</span>;
  const styles: Record<string, string> = {
    positive: "bg-emerald-900/40 text-emerald-300 border-emerald-700/50",
    neutral: "bg-gray-800 text-gray-400 border-gray-700",
    negative: "bg-rose-900/40 text-rose-300 border-rose-700/50",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs border capitalize ${styles[sentiment] ?? styles.neutral}`}>
      {sentiment}
    </span>
  );
}

function StatusBadge({ status, error }: { status: string | null; error: string | null }) {
  if (!status) return <span className="text-gray-600 text-xs">—</span>;
  const styles: Record<string, string> = {
    classified: "bg-emerald-900/40 text-emerald-300 border-emerald-700/50",
    transcribed: "bg-blue-900/40 text-blue-300 border-blue-700/50",
    transcribing: "bg-gray-800 text-gray-400 border-gray-700",
    pending: "bg-gray-800 text-gray-500 border-gray-700",
    no_recording: "bg-gray-800 text-gray-500 border-gray-700",
    error: "bg-red-900/40 text-red-300 border-red-700/50",
  };
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs border ${styles[status] ?? styles.pending}`}
      title={error ?? ""}
    >
      {status}
    </span>
  );
}
