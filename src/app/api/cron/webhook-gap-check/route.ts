// Nightly check that every order Shopify recorded yesterday also has a
// shopify_webhook_log row. Posts to Slack only when something is off so
// the channel stays quiet on healthy days.
//
// Window: yesterday in America/New_York (matches the slack-daily-calls
// digest cadence). Shopify created_at filters are 7h offset (PT) but
// the window is wide enough to cover both timezones safely — drift is
// measured by counts, not by precise boundary alignment.

import { NextRequest, NextResponse } from "next/server";
import { detectWebhookGaps } from "@/lib/shopify-webhook-gaps";

const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL ?? "";
const CRON_SECRET = process.env.CRON_SECRET ?? "";

export const maxDuration = 300;

function authorize(req: NextRequest): boolean {
  if (!CRON_SECRET) return true;
  const auth = req.headers.get("authorization");
  if (auth === `Bearer ${CRON_SECRET}`) return true;
  if (req.nextUrl.searchParams.get("secret") === CRON_SECRET) return true;
  return false;
}

function yesterdayISO(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().substring(0, 10);
}

export async function GET(req: NextRequest) {
  if (!authorize(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const day = yesterdayISO();

  try {
    const report = await detectWebhookGaps(day, day, 10);
    const totalGaps =
      report.gaps.never_received +
      report.gaps.hmac_failed +
      report.gaps.parse_failed +
      report.gaps.persist_failed;

    if (totalGaps === 0) {
      return NextResponse.json({ ok: true, day, totalGaps: 0, ...report });
    }

    if (SLACK_WEBHOOK_URL) {
      const lines: string[] = [];
      lines.push(
        `:rotating_light: *Shopify webhook gap detected — ${day}*`
      );
      lines.push(
        `${report.shopify_total} orders in Shopify · ${report.logged} logged`
      );
      const parts: string[] = [];
      if (report.gaps.never_received)
        parts.push(`*${report.gaps.never_received}* never received`);
      if (report.gaps.hmac_failed)
        parts.push(`*${report.gaps.hmac_failed}* HMAC failed`);
      if (report.gaps.parse_failed)
        parts.push(`*${report.gaps.parse_failed}* parse failed`);
      if (report.gaps.persist_failed)
        parts.push(`*${report.gaps.persist_failed}* persist failed`);
      lines.push(parts.join(" · "));

      const sampleNames = report.samples.never_received
        .map((s) => s.name ?? s.id)
        .slice(0, 5);
      if (sampleNames.length > 0) {
        lines.push(`Missing sample: ${sampleNames.join(", ")}`);
      }
      lines.push(
        `Backfill: \`POST /api/identities/backfill-shopify?start=${day}&end=${day}\``
      );

      const res = await fetch(SLACK_WEBHOOK_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: lines.join("\n") }),
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(`Slack ${res.status}: ${t}`);
      }
    }

    return NextResponse.json({ ok: true, day, totalGaps, ...report });
  } catch (e) {
    return NextResponse.json(
      { ok: false, day, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
