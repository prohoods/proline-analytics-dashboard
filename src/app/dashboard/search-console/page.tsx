// Search Console performance. Reads from search_console_daily, populated
// by POST /api/search-console/sync.

import { getSql } from "@/lib/db";

export const dynamic = "force-dynamic";

interface QueryRow {
  query: string;
  clicks: number;
  impressions: number;
  ctr: string | null;
  position: string | null;
}

interface DailyRow {
  day: string;
  clicks: number;
  impressions: number;
  ctr: string | null;
  position: string | null;
}

async function loadData() {
  const sql = getSql();
  try {
    const [totals, queries, daily] = await Promise.all([
      sql<
        {
          clicks: number;
          impressions: number;
          ctr: string | null;
          position: string | null;
        }[]
      >`
        select
          coalesce(sum(clicks), 0)::int as clicks,
          coalesce(sum(impressions), 0)::int as impressions,
          case when sum(impressions) > 0
               then (sum(clicks)::numeric / sum(impressions))::text
               else '0' end as ctr,
          case when sum(impressions) > 0
               then (sum(position * impressions) / sum(impressions))::text
               else '0' end as position
        from search_console_daily
        where date >= current_date - interval '30 days'
      `,
      sql<QueryRow[]>`
        select
          query,
          coalesce(sum(clicks), 0)::int as clicks,
          coalesce(sum(impressions), 0)::int as impressions,
          case when sum(impressions) > 0
               then (sum(clicks)::numeric / sum(impressions))::text
               else '0' end as ctr,
          case when sum(impressions) > 0
               then (sum(position * impressions) / sum(impressions))::text
               else '0' end as position
        from search_console_daily
        where date >= current_date - interval '30 days'
        group by query
        order by clicks desc
        limit 50
      `,
      sql<DailyRow[]>`
        select
          to_char(date, 'YYYY-MM-DD') as day,
          coalesce(sum(clicks), 0)::int as clicks,
          coalesce(sum(impressions), 0)::int as impressions,
          case when sum(impressions) > 0
               then (sum(clicks)::numeric / sum(impressions))::text
               else '0' end as ctr,
          case when sum(impressions) > 0
               then (sum(position * impressions) / sum(impressions))::text
               else '0' end as position
        from search_console_daily
        where date >= current_date - interval '30 days'
        group by 1
        order by 1 desc
      `,
    ]);
    return {
      totals: totals[0] ?? { clicks: 0, impressions: 0, ctr: "0", position: "0" },
      queries,
      daily,
      error: null as string | null,
    };
  } catch (e) {
    return {
      totals: { clicks: 0, impressions: 0, ctr: "0", position: "0" },
      queries: [] as QueryRow[],
      daily: [] as DailyRow[],
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

function num(n: number | null): string {
  if (n === null) return "—";
  return Math.round(n).toLocaleString();
}

function pct(v: string | null): string {
  if (v === null) return "—";
  const n = parseFloat(v);
  if (Number.isNaN(n)) return "—";
  return `${(n * 100).toFixed(2)}%`;
}

function pos(v: string | null): string {
  if (v === null) return "—";
  const n = parseFloat(v);
  if (Number.isNaN(n)) return "—";
  return n.toFixed(1);
}

export default async function SearchConsolePage() {
  const { totals, queries, daily, error } = await loadData();

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-white">Search Console</h1>
        <p className="text-sm text-gray-400 mt-1">
          Organic search performance from Google Search Console. Synced via{" "}
          <code className="text-gray-300">POST /api/search-console/sync</code>.
        </p>
      </div>

      {error && (
        <div className="mb-6 p-4 rounded-lg border border-red-700 bg-red-900/20 text-red-200 text-sm">
          <div className="font-semibold">Database error</div>
          <div className="mt-1 text-red-300">{error}</div>
          <div className="mt-2 text-xs text-red-300">
            Apply migration 010 first:{" "}
            <code className="px-1.5 py-0.5 rounded bg-black/40">POST /api/conversions/migrate</code>
            , then{" "}
            <code className="px-1.5 py-0.5 rounded bg-black/40">POST /api/search-console/sync?days=90</code>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Stat label="Clicks (30d)" value={num(totals.clicks)} accent="text-emerald-300" />
        <Stat label="Impressions (30d)" value={num(totals.impressions)} />
        <Stat label="Avg CTR (30d)" value={pct(totals.ctr)} />
        <Stat label="Avg position (30d)" value={pos(totals.position)} />
      </div>

      <Section title="Top queries (last 30d)">
        <table className="w-full text-sm">
          <thead className="text-gray-500 text-xs uppercase tracking-wider">
            <tr className="border-b border-gray-800">
              <th className="text-left px-4 py-2">Query</th>
              <th className="text-right px-4 py-2">Clicks</th>
              <th className="text-right px-4 py-2">Impressions</th>
              <th className="text-right px-4 py-2">CTR</th>
              <th className="text-right px-4 py-2">Avg pos</th>
            </tr>
          </thead>
          <tbody>
            {queries.length === 0 && !error && (
              <tr>
                <td colSpan={5} className="text-center py-12 text-gray-500 text-sm">
                  No Search Console data yet — run{" "}
                  <code className="px-1 py-0.5 rounded bg-black/40">
                    POST /api/search-console/sync?days=90
                  </code>
                </td>
              </tr>
            )}
            {queries.map((q, i) => (
              <tr
                key={`${q.query}-${i}`}
                className="border-b border-gray-800/60 hover:bg-gray-800/30"
              >
                <td className="px-4 py-2 text-gray-200">{q.query || "(empty)"}</td>
                <td className="px-4 py-2 text-right text-emerald-300">{num(q.clicks)}</td>
                <td className="px-4 py-2 text-right text-gray-300">{num(q.impressions)}</td>
                <td className="px-4 py-2 text-right text-gray-200">{pct(q.ctr)}</td>
                <td className="px-4 py-2 text-right text-gray-200">{pos(q.position)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title="Daily breakdown (last 30d)">
        <table className="w-full text-sm">
          <thead className="text-gray-500 text-xs uppercase tracking-wider">
            <tr className="border-b border-gray-800">
              <th className="text-left px-4 py-2">Day</th>
              <th className="text-right px-4 py-2">Clicks</th>
              <th className="text-right px-4 py-2">Impressions</th>
              <th className="text-right px-4 py-2">CTR</th>
              <th className="text-right px-4 py-2">Avg pos</th>
            </tr>
          </thead>
          <tbody>
            {daily.map((d) => (
              <tr key={d.day} className="border-b border-gray-800/60 hover:bg-gray-800/30">
                <td className="px-4 py-2 text-gray-300 whitespace-nowrap">{d.day}</td>
                <td className="px-4 py-2 text-right text-emerald-300">{num(d.clicks)}</td>
                <td className="px-4 py-2 text-right text-gray-300">{num(d.impressions)}</td>
                <td className="px-4 py-2 text-right text-gray-200">{pct(d.ctr)}</td>
                <td className="px-4 py-2 text-right text-gray-200">{pos(d.position)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
    </div>
  );
}

function Stat({
  label,
  value,
  accent = "text-white",
}: {
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
      <div className="text-xs uppercase tracking-wider text-gray-500">{label}</div>
      <div className={`mt-1 text-2xl font-semibold ${accent}`}>{value}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden mb-6">
      <div className="px-4 py-3 border-b border-gray-800 text-sm text-white font-medium">{title}</div>
      <div className="overflow-x-auto">{children}</div>
    </div>
  );
}
