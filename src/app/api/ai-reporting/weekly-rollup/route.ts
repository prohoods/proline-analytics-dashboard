// Generates (or regenerates) the weekly rollup for a given ISO-week start.
// Default = the current week (Monday). Stores into ai_weekly_rollups so
// the dashboard can render it without paying OpenAI on every load.

import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { generateWeeklyRollup } from "@/lib/call-intelligence";

// Returns YYYY-MM-DD for the Monday of the week containing the given date (ET-ish — uses UTC date math).
function mondayOf(d: Date): string {
  const date = new Date(d);
  const day = date.getUTCDay();
  const diff = (day + 6) % 7; // 0 if Monday, 6 if Sunday
  date.setUTCDate(date.getUTCDate() - diff);
  return date.toISOString().slice(0, 10);
}

export async function POST(req: NextRequest) {
  const sql = getSql();
  const weekParam = req.nextUrl.searchParams.get("week");
  const weekStart = weekParam ? mondayOf(new Date(weekParam)) : mondayOf(new Date());

  try {
    const rows = await sql<
      { category: string | null; summary: string | null }[]
    >`
      select category, summary
      from callrail_calls
      where call_started_at >= ${weekStart}::date
        and call_started_at <  (${weekStart}::date + interval '7 days')
        and summary is not null
    `;

    const salesSummaries = rows
      .filter((r) => r.category === "sales" && r.summary)
      .map((r) => r.summary as string);
    const supportSummaries = rows
      .filter((r) => r.category === "support" && r.summary)
      .map((r) => r.summary as string);

    const total = rows.length;
    const sales = salesSummaries.length;
    const support = supportSummaries.length;
    const other = total - sales - support;

    if (total === 0) {
      await sql`
        insert into ai_weekly_rollups
          (week_start, generated_at, total_calls, sales_count, support_count, other_count,
           key_trends, content_ideas, sales_summary, support_summary)
        values (${weekStart}, now(), 0, 0, 0, 0,
                ${JSON.stringify([])}::jsonb, ${JSON.stringify([])}::jsonb,
                'No sales calls this week.', 'No support calls this week.')
        on conflict (week_start) do update set
          generated_at = excluded.generated_at,
          total_calls = excluded.total_calls,
          sales_count = excluded.sales_count,
          support_count = excluded.support_count,
          other_count = excluded.other_count,
          key_trends = excluded.key_trends,
          content_ideas = excluded.content_ideas,
          sales_summary = excluded.sales_summary,
          support_summary = excluded.support_summary
      `;
      return NextResponse.json({ ok: true, weekStart, total: 0 });
    }

    const rollup = await generateWeeklyRollup({ salesSummaries, supportSummaries });

    await sql`
      insert into ai_weekly_rollups
        (week_start, generated_at, total_calls, sales_count, support_count, other_count,
         key_trends, content_ideas, sales_summary, support_summary)
      values (
        ${weekStart}, now(), ${total}, ${sales}, ${support}, ${other},
        ${JSON.stringify(rollup.key_trends)}::jsonb,
        ${JSON.stringify(rollup.content_ideas)}::jsonb,
        ${rollup.sales_summary},
        ${rollup.support_summary}
      )
      on conflict (week_start) do update set
        generated_at = excluded.generated_at,
        total_calls = excluded.total_calls,
        sales_count = excluded.sales_count,
        support_count = excluded.support_count,
        other_count = excluded.other_count,
        key_trends = excluded.key_trends,
        content_ideas = excluded.content_ideas,
        sales_summary = excluded.sales_summary,
        support_summary = excluded.support_summary
    `;

    return NextResponse.json({
      ok: true,
      weekStart,
      total,
      sales,
      support,
      other,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
