import Link from "next/link";
import { getSql } from "@/lib/db";
import CallVolumeChart from "@/components/CallVolumeChart";
import CallsTable, { type CallRow } from "@/components/CallsTable";
import WeeklyRollupPanel, {
  type WeeklyRollupData,
} from "@/components/WeeklyRollupPanel";

export const dynamic = "force-dynamic";

interface CategoryRow {
  category: string | null;
  count: number;
}

interface DailyRow {
  date: string;
  category: string | null;
  count: number;
}

const FILTERS = ["all", "sales", "support", "other"] as const;
type Filter = (typeof FILTERS)[number];

// postgres.js returns DATE as string and TIMESTAMPTZ as Date, but be defensive
// in case driver/column behavior shifts — calling .toISOString() on a string crashes.
function toIsoDate(v: Date | string): string {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).slice(0, 10);
}
function toIsoString(v: Date | string): string {
  if (v instanceof Date) return v.toISOString();
  return new Date(String(v)).toISOString();
}
// jsonb arrays can come back as already-parsed arrays OR as JSON strings,
// depending on driver path. Normalize so .map() never crashes the client.
function toStringArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x));
  if (typeof v === "string") {
    try {
      const p = JSON.parse(v);
      return Array.isArray(p) ? p.map((x) => String(x)) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function mondayOfThisWeek(): string {
  const d = new Date();
  const day = d.getUTCDay();
  const diff = (day + 6) % 7;
  d.setUTCDate(d.getUTCDate() - diff);
  return d.toISOString().slice(0, 10);
}

async function loadData(filter: Filter) {
  const sql = getSql();
  try {
    const where =
      filter === "all"
        ? sql`call_started_at >= now() - interval '30 days'`
        : sql`call_started_at >= now() - interval '30 days' and category = ${filter}`;

    const [rows, byCategory, last24, followUps, daily, rollupRows] = await Promise.all([
      sql<
        (Omit<CallRow, "call_started_at"> & { call_started_at: Date })[]
      >`
        select id, phone_e164, call_started_at, duration_seconds,
               transcription_status, category, summary, sentiment,
               follow_up_needed, error_message
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
      sql<DailyRow[]>`
        select to_char(date_trunc('day', call_started_at), 'YYYY-MM-DD') as date,
               category, count(*)::int as count
        from callrail_calls
        where call_started_at >= now() - interval '30 days'
        group by 1, 2
        order by 1
      `,
      sql<
        (Omit<WeeklyRollupData, "week_start" | "generated_at"> & {
          week_start: Date | string;
          generated_at: Date | string;
        })[]
      >`
        select week_start, generated_at, total_calls, sales_count, support_count,
               key_trends, content_ideas, sales_summary, support_summary
        from ai_weekly_rollups
        where week_start = ${mondayOfThisWeek()}::date
        limit 1
      `,
    ]);

    const callRows: CallRow[] = rows.map((r) => ({
      ...r,
      call_started_at: r.call_started_at.toISOString(),
    }));

    const dailyMap = new Map<
      string,
      { date: string; sales: number; support: number; other: number }
    >();
    for (const d of daily) {
      const cur =
        dailyMap.get(d.date) ?? { date: d.date, sales: 0, support: 0, other: 0 };
      const cat = d.category === "sales" || d.category === "support" ? d.category : "other";
      cur[cat] += d.count;
      dailyMap.set(d.date, cur);
    }
    // Fill 30 days so chart isn't gappy.
    const dailySeries: { date: string; sales: number; support: number; other: number }[] = [];
    for (let i = 29; i >= 0; i--) {
      const dt = new Date();
      dt.setUTCDate(dt.getUTCDate() - i);
      const key = dt.toISOString().slice(0, 10);
      dailySeries.push(dailyMap.get(key) ?? { date: key, sales: 0, support: 0, other: 0 });
    }

    const rollup: WeeklyRollupData | null = rollupRows[0]
      ? {
          ...rollupRows[0],
          week_start: toIsoDate(rollupRows[0].week_start),
          generated_at: toIsoString(rollupRows[0].generated_at),
          key_trends: toStringArray(rollupRows[0].key_trends),
          content_ideas: toStringArray(rollupRows[0].content_ideas),
        }
      : null;

    return {
      rows: callRows,
      byCategory,
      last24h: last24[0]?.count ?? 0,
      followUps: followUps[0]?.count ?? 0,
      dailySeries,
      rollup,
      error: null as string | null,
    };
  } catch (e) {
    return {
      rows: [] as CallRow[],
      byCategory: [] as CategoryRow[],
      last24h: 0,
      followUps: 0,
      dailySeries: [] as { date: string; sales: number; support: number; other: number }[],
      rollup: null as WeeklyRollupData | null,
      error: e instanceof Error ? e.message : String(e),
    };
  }
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

  const { rows, byCategory, last24h, followUps, dailySeries, rollup, error } =
    await loadData(filter);

  const total30d = byCategory.reduce((s, r) => s + r.count, 0);
  const sales = byCategory.find((r) => r.category === "sales")?.count ?? 0;
  const support = byCategory.find((r) => r.category === "support")?.count ?? 0;
  const other = byCategory.find((r) => r.category === "other")?.count ?? 0;
  const classified = sales + support + other;

  const salesPct = classified > 0 ? Math.round((sales / classified) * 100) : 0;
  const supportPct = classified > 0 ? Math.round((support / classified) * 100) : 0;
  const otherPct = classified > 0 ? 100 - salesPct - supportPct : 0;

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

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <Stat label="Last 24h" value={last24h.toString()} />
        <Stat label="Sales (30d)" value={sales.toString()} accent="text-blue-400" />
        <Stat label="Support (30d)" value={support.toString()} accent="text-amber-400" />
        <Stat
          label="Follow-up needed (30d)"
          value={followUps.toString()}
          accent={followUps > 0 ? "text-rose-400" : "text-gray-400"}
        />
      </div>

      {/* Mix bar */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-6">
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs uppercase tracking-wider text-gray-500">Call mix · 30d</div>
          <div className="text-xs text-gray-500">{classified} classified · {total30d - classified} pending</div>
        </div>
        {classified === 0 ? (
          <div className="text-xs text-gray-600 italic">No classified calls yet.</div>
        ) : (
          <>
            <div className="h-2.5 rounded-full overflow-hidden bg-gray-800 flex">
              <div className="h-full bg-blue-500" style={{ width: `${salesPct}%` }} />
              <div className="h-full bg-amber-500" style={{ width: `${supportPct}%` }} />
              <div className="h-full bg-gray-600" style={{ width: `${otherPct}%` }} />
            </div>
            <div className="flex items-center gap-4 mt-2 text-xs text-gray-400">
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-blue-500" /> Sales {salesPct}%</span>
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-500" /> Support {supportPct}%</span>
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-gray-600" /> Other {otherPct}%</span>
              <span className="ml-auto text-gray-500">Δ {sales - support >= 0 ? "+" : ""}{sales - support} sales vs support</span>
            </div>
          </>
        )}
      </div>

      <div className="mb-6">
        <CallVolumeChart data={dailySeries} />
      </div>

      <WeeklyRollupPanel rollup={rollup} />

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

      <CallsTable rows={rows} />
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
