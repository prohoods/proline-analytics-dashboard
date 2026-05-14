// Pulls (date, query) Search Console performance into `search_console_daily`.
// Idempotent — re-running upserts each (date, query) row.
//
// Usage: POST /api/search-console/sync?days=30  (default 30, max 365)
// GSC only retains 16 months of data, so days is clamped to ~480.

import { NextRequest, NextResponse } from "next/server";
import { pullSearchConsoleDaily } from "@/lib/search-console";
import { getSql } from "@/lib/db";

export const maxDuration = 300;

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function POST(req: NextRequest) {
  const days = Math.max(
    1,
    Math.min(480, Number(req.nextUrl.searchParams.get("days") ?? "30"))
  );

  const end = new Date();
  // GSC data lags 2-3 days; pull through "today" anyway — partial rows
  // are valid, the upsert will refresh them on later syncs.
  const start = new Date();
  start.setUTCDate(start.getUTCDate() - (days - 1));

  try {
    const sql = getSql();
    const rows = await pullSearchConsoleDaily(isoDate(start), isoDate(end));

    const seen = new Set<string>();
    const batch = rows
      .map((r) => {
        const key = `${r.date}|${r.query}`;
        if (seen.has(key)) return null;
        seen.add(key);
        return {
          date: r.date,
          query: r.query,
          clicks: r.clicks,
          impressions: r.impressions,
          ctr: r.ctr,
          position: r.position,
        };
      })
      .filter((v): v is NonNullable<typeof v> => v !== null);

    const CHUNK = 4000;
    for (let off = 0; off < batch.length; off += CHUNK) {
      const slice = batch.slice(off, off + CHUNK);
      await sql`
        insert into search_console_daily ${sql(
          slice,
          "date",
          "query",
          "clicks",
          "impressions",
          "ctr",
          "position"
        )}
        on conflict (date, query) do update set
          clicks = excluded.clicks,
          impressions = excluded.impressions,
          ctr = excluded.ctr,
          position = excluded.position,
          synced_at = now()
      `;
    }

    const [{ total }] = await sql<{ total: number }[]>`
      select count(*)::int as total from search_console_daily
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
