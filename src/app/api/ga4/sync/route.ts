// Pulls daily GA4 traffic (channel × source × medium × campaign) into
// `ga4_daily`. Idempotent — re-running the same window upserts.
//
// Usage: POST /api/ga4/sync?days=30  (default 30, max 365)

import { NextRequest, NextResponse } from "next/server";
import { pullGA4Daily } from "@/lib/ga4";
import { getSql } from "@/lib/db";

export const maxDuration = 300;

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// GA4 returns dates as "YYYYMMDD" — coerce to ISO.
function ga4DateToIso(d: string): string {
  if (d.length !== 8) return d;
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
}

export async function POST(req: NextRequest) {
  const days = Math.max(
    1,
    Math.min(365, Number(req.nextUrl.searchParams.get("days") ?? "30"))
  );

  const end = new Date();
  const start = new Date();
  start.setUTCDate(start.getUTCDate() - (days - 1));

  try {
    const sql = getSql();
    const rows = await pullGA4Daily(isoDate(start), isoDate(end));

    // Dedupe inside the batch — multi-row INSERT can't resolve dupes
    // against itself via ON CONFLICT.
    const seen = new Set<string>();
    const batch = rows
      .map((r) => {
        const date = ga4DateToIso(r.date);
        const key = `${date}|${r.channel_group}|${r.source}|${r.medium}|${r.campaign}`;
        if (seen.has(key)) return null;
        seen.add(key);
        return {
          date,
          channel_group: r.channel_group,
          source: r.source,
          medium: r.medium,
          campaign: r.campaign,
          sessions: r.sessions,
          active_users: r.active_users,
          engaged_sessions: r.engaged_sessions,
          conversions: r.conversions,
          total_revenue: r.total_revenue,
          bounce_rate: r.bounce_rate,
        };
      })
      .filter((v): v is NonNullable<typeof v> => v !== null);

    const CHUNK = 4000;
    for (let off = 0; off < batch.length; off += CHUNK) {
      const slice = batch.slice(off, off + CHUNK);
      await sql`
        insert into ga4_daily ${sql(
          slice,
          "date",
          "channel_group",
          "source",
          "medium",
          "campaign",
          "sessions",
          "active_users",
          "engaged_sessions",
          "conversions",
          "total_revenue",
          "bounce_rate"
        )}
        on conflict (date, channel_group, source, medium, campaign) do update set
          sessions = excluded.sessions,
          active_users = excluded.active_users,
          engaged_sessions = excluded.engaged_sessions,
          conversions = excluded.conversions,
          total_revenue = excluded.total_revenue,
          bounce_rate = excluded.bounce_rate,
          synced_at = now()
      `;
    }

    const [{ total }] = await sql<{ total: number }[]>`
      select count(*)::int as total from ga4_daily
    `;

    return NextResponse.json({
      ok: true,
      window: { days, start: isoDate(start), end: isoDate(end) },
      fetched: rows.length,
      upserted: batch.length,
      tableTotal: total,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
