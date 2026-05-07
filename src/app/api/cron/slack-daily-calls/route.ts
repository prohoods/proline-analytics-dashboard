// Daily Slack digest of yesterday's CallRail call activity.
// Runs via Vercel Cron (configured in vercel.json).

import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db";

const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL ?? "";
const CRON_SECRET = process.env.CRON_SECRET ?? "";
const TIMEZONE = "America/New_York";

interface CallSummary {
  id: string;
  phone_e164: string;
  duration_seconds: number | null;
  category: string | null;
  sentiment: string | null;
  summary: string | null;
  follow_up_needed: boolean | null;
}

function authorize(req: NextRequest): boolean {
  // Vercel Cron sends Authorization: Bearer <CRON_SECRET> when configured.
  // Allow either CRON_SECRET match or the x-vercel-cron header (legacy).
  if (!CRON_SECRET) return true;
  const auth = req.headers.get("authorization");
  if (auth === `Bearer ${CRON_SECRET}`) return true;
  if (req.nextUrl.searchParams.get("secret") === CRON_SECRET) return true;
  return false;
}

function fmtDuration(s: number | null) {
  if (s == null) return "—";
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

export async function GET(req: NextRequest) {
  if (!authorize(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (!SLACK_WEBHOOK_URL) {
    return NextResponse.json(
      { ok: false, error: "SLACK_WEBHOOK_URL not configured" },
      { status: 500 }
    );
  }

  const sql = getSql();
  // "Yesterday" in ET — call_started_at is timestamptz, so compare in tz.
  const window = sql`
    call_started_at >= (date_trunc('day', (now() at time zone ${TIMEZONE})) - interval '1 day')
                        at time zone ${TIMEZONE}
    and call_started_at <  date_trunc('day', (now() at time zone ${TIMEZONE}))
                        at time zone ${TIMEZONE}
  `;

  const [counts, calls, followUps] = await Promise.all([
    sql<{ category: string | null; count: number }[]>`
      select category, count(*)::int as count
      from callrail_calls
      where ${window}
      group by category
    `,
    sql<CallSummary[]>`
      select id, phone_e164, duration_seconds, category, sentiment, summary, follow_up_needed
      from callrail_calls
      where ${window}
      order by call_started_at desc
    `,
    sql<CallSummary[]>`
      select id, phone_e164, duration_seconds, category, sentiment, summary, follow_up_needed
      from callrail_calls
      where ${window} and follow_up_needed = true
      order by call_started_at desc
      limit 5
    `,
  ]);

  const total = calls.length;
  const sales = counts.find((r) => r.category === "sales")?.count ?? 0;
  const support = counts.find((r) => r.category === "support")?.count ?? 0;
  const other = counts.find((r) => r.category === "other")?.count ?? 0;
  const unclassified = total - sales - support - other;
  const negSentiment = calls.filter((c) => c.sentiment === "negative").length;

  const yesterdayLabel = new Date(Date.now() - 24 * 60 * 60 * 1000).toLocaleDateString(
    "en-US",
    { weekday: "long", month: "long", day: "numeric", timeZone: TIMEZONE }
  );

  if (total === 0) {
    await postToSlack({
      text: `📞 *Calls digest — ${yesterdayLabel}*\n_No calls yesterday._`,
    });
    return NextResponse.json({ ok: true, total: 0 });
  }

  const lines: string[] = [];
  lines.push(`📞 *Calls digest — ${yesterdayLabel}*`);
  lines.push(
    `*${total}* total · 🛒 *${sales}* sales · 🛟 *${support}* support · 🤷 *${other}* other` +
      (unclassified > 0 ? ` · ⏳ *${unclassified}* still processing` : "")
  );
  if (negSentiment > 0) lines.push(`⚠️ *${negSentiment}* negative-sentiment call${negSentiment === 1 ? "" : "s"}`);

  // Top sales (most recent up to 3)
  const topSales = calls.filter((c) => c.category === "sales" && c.summary).slice(0, 3);
  if (topSales.length > 0) {
    lines.push("");
    lines.push("*Sales calls*");
    for (const c of topSales) {
      lines.push(`• \`${c.phone_e164}\` (${fmtDuration(c.duration_seconds)}) — ${c.summary}`);
    }
  }

  // Top support
  const topSupport = calls.filter((c) => c.category === "support" && c.summary).slice(0, 3);
  if (topSupport.length > 0) {
    lines.push("");
    lines.push("*Support calls*");
    for (const c of topSupport) {
      lines.push(`• \`${c.phone_e164}\` (${fmtDuration(c.duration_seconds)}) — ${c.summary}`);
    }
  }

  // Follow-ups
  if (followUps.length > 0) {
    lines.push("");
    lines.push(`*🚩 Follow-up needed (${followUps.length})*`);
    for (const c of followUps) {
      lines.push(`• \`${c.phone_e164}\` — ${c.summary ?? "(no summary)"}`);
    }
  }

  await postToSlack({ text: lines.join("\n") });
  return NextResponse.json({ ok: true, total, sales, support, other });
}

async function postToSlack(body: { text: string }) {
  const res = await fetch(SLACK_WEBHOOK_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Slack ${res.status}: ${t}`);
  }
}
