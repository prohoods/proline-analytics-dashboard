// GA4 traffic + conversion overview. Reads from ga4_daily, populated by
// POST /api/ga4/sync.

import { getSql } from "@/lib/db";

export const dynamic = "force-dynamic";

interface ChannelRow {
  channel_group: string;
  sessions: number;
  active_users: number;
  conversions: string | null;
  total_revenue: string | null;
}

interface CampaignRow {
  source: string;
  medium: string;
  campaign: string;
  sessions: number;
  conversions: string | null;
  total_revenue: string | null;
}

interface DailyRow {
  day: string;
  sessions: number;
  active_users: number;
  conversions: string | null;
  total_revenue: string | null;
}

async function loadData() {
  const sql = getSql();
  try {
    const [totals, channels, campaigns, daily] = await Promise.all([
      sql<
        {
          sessions: number;
          active_users: number;
          conversions: string | null;
          total_revenue: string | null;
        }[]
      >`
        select
          coalesce(sum(sessions), 0)::int as sessions,
          coalesce(sum(active_users), 0)::int as active_users,
          coalesce(sum(conversions), 0)::text as conversions,
          coalesce(sum(total_revenue), 0)::text as total_revenue
        from ga4_daily
        where date >= current_date - interval '30 days'
      `,
      sql<ChannelRow[]>`
        select
          channel_group,
          coalesce(sum(sessions), 0)::int as sessions,
          coalesce(sum(active_users), 0)::int as active_users,
          coalesce(sum(conversions), 0)::text as conversions,
          coalesce(sum(total_revenue), 0)::text as total_revenue
        from ga4_daily
        where date >= current_date - interval '30 days'
        group by channel_group
        order by sessions desc
      `,
      sql<CampaignRow[]>`
        select
          source, medium, campaign,
          coalesce(sum(sessions), 0)::int as sessions,
          coalesce(sum(conversions), 0)::text as conversions,
          coalesce(sum(total_revenue), 0)::text as total_revenue
        from ga4_daily
        where date >= current_date - interval '30 days'
          and campaign <> ''
        group by source, medium, campaign
        order by sessions desc
        limit 25
      `,
      sql<DailyRow[]>`
        select
          to_char(date, 'YYYY-MM-DD') as day,
          coalesce(sum(sessions), 0)::int as sessions,
          coalesce(sum(active_users), 0)::int as active_users,
          coalesce(sum(conversions), 0)::text as conversions,
          coalesce(sum(total_revenue), 0)::text as total_revenue
        from ga4_daily
        where date >= current_date - interval '30 days'
        group by 1
        order by 1 desc
      `,
    ]);
    return {
      totals: totals[0] ?? {
        sessions: 0,
        active_users: 0,
        conversions: "0",
        total_revenue: "0",
      },
      channels,
      campaigns,
      daily,
      error: null as string | null,
    };
  } catch (e) {
    return {
      totals: { sessions: 0, active_users: 0, conversions: "0", total_revenue: "0" },
      channels: [] as ChannelRow[],
      campaigns: [] as CampaignRow[],
      daily: [] as DailyRow[],
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

function num(n: number | string | null): string {
  if (n === null) return "—";
  const v = typeof n === "string" ? parseFloat(n) : n;
  if (Number.isNaN(v)) return "—";
  return Math.round(v).toLocaleString();
}

function money(v: string | null) {
  if (v === null) return "—";
  const n = parseFloat(v);
  if (Number.isNaN(n)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

export default async function GA4Page() {
  const { totals, channels, campaigns, daily, error } = await loadData();

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-white">GA4 Traffic</h1>
        <p className="text-sm text-gray-400 mt-1">
          Sessions, users, and conversions from Google Analytics 4. Synced via{" "}
          <code className="text-gray-300">POST /api/ga4/sync</code>.
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
            <code className="px-1.5 py-0.5 rounded bg-black/40">POST /api/ga4/sync?days=90</code>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Stat label="Sessions (30d)" value={num(totals.sessions)} />
        <Stat label="Active users (30d)" value={num(totals.active_users)} />
        <Stat
          label="Conversions (30d)"
          value={num(totals.conversions)}
          accent="text-emerald-300"
        />
        <Stat
          label="Revenue (30d)"
          value={money(totals.total_revenue)}
          accent="text-emerald-300"
        />
      </div>

      <Section title="Channel breakdown (last 30d)">
        <table className="w-full text-sm">
          <thead className="text-gray-500 text-xs uppercase tracking-wider">
            <tr className="border-b border-gray-800">
              <th className="text-left px-4 py-2">Channel</th>
              <th className="text-right px-4 py-2">Sessions</th>
              <th className="text-right px-4 py-2">Users</th>
              <th className="text-right px-4 py-2">Conversions</th>
              <th className="text-right px-4 py-2">Revenue</th>
            </tr>
          </thead>
          <tbody>
            {channels.length === 0 && !error && (
              <tr>
                <td colSpan={5} className="text-center py-12 text-gray-500 text-sm">
                  No GA4 data yet — run{" "}
                  <code className="px-1 py-0.5 rounded bg-black/40">
                    POST /api/ga4/sync?days=90
                  </code>
                </td>
              </tr>
            )}
            {channels.map((c) => (
              <tr
                key={c.channel_group || "—"}
                className="border-b border-gray-800/60 hover:bg-gray-800/30"
              >
                <td className="px-4 py-2 text-gray-200">{c.channel_group || "—"}</td>
                <td className="px-4 py-2 text-right text-gray-200">{num(c.sessions)}</td>
                <td className="px-4 py-2 text-right text-gray-300">{num(c.active_users)}</td>
                <td className="px-4 py-2 text-right text-emerald-300">{num(c.conversions)}</td>
                <td className="px-4 py-2 text-right text-gray-200">{money(c.total_revenue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title="Top campaigns (last 30d)">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[800px]">
            <thead className="text-gray-500 text-xs uppercase tracking-wider">
              <tr className="border-b border-gray-800">
                <th className="text-left px-4 py-2">Source / Medium</th>
                <th className="text-left px-4 py-2">Campaign</th>
                <th className="text-right px-4 py-2">Sessions</th>
                <th className="text-right px-4 py-2">Conversions</th>
                <th className="text-right px-4 py-2">Revenue</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.length === 0 && !error && (
                <tr>
                  <td colSpan={5} className="text-center py-12 text-gray-500 text-sm">
                    No campaigns with non-empty name.
                  </td>
                </tr>
              )}
              {campaigns.map((c, i) => (
                <tr key={`${c.campaign}-${i}`} className="border-b border-gray-800/60 hover:bg-gray-800/30">
                  <td className="px-4 py-2 text-gray-300 text-xs">
                    {c.source} / {c.medium}
                  </td>
                  <td className="px-4 py-2 text-gray-200">{c.campaign}</td>
                  <td className="px-4 py-2 text-right text-gray-200">{num(c.sessions)}</td>
                  <td className="px-4 py-2 text-right text-emerald-300">{num(c.conversions)}</td>
                  <td className="px-4 py-2 text-right text-gray-200">{money(c.total_revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Daily breakdown (last 30d)">
        <table className="w-full text-sm">
          <thead className="text-gray-500 text-xs uppercase tracking-wider">
            <tr className="border-b border-gray-800">
              <th className="text-left px-4 py-2">Day</th>
              <th className="text-right px-4 py-2">Sessions</th>
              <th className="text-right px-4 py-2">Users</th>
              <th className="text-right px-4 py-2">Conversions</th>
              <th className="text-right px-4 py-2">Revenue</th>
            </tr>
          </thead>
          <tbody>
            {daily.map((d) => (
              <tr key={d.day} className="border-b border-gray-800/60 hover:bg-gray-800/30">
                <td className="px-4 py-2 text-gray-300 whitespace-nowrap">{d.day}</td>
                <td className="px-4 py-2 text-right text-gray-200">{num(d.sessions)}</td>
                <td className="px-4 py-2 text-right text-gray-300">{num(d.active_users)}</td>
                <td className="px-4 py-2 text-right text-emerald-300">{num(d.conversions)}</td>
                <td className="px-4 py-2 text-right text-gray-200">{money(d.total_revenue)}</td>
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
