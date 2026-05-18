// On-demand webhook delivery gap inspection.
//
// Usage:
//   GET /api/webhooks/shopify/order/gaps?start=YYYY-MM-DD&end=YYYY-MM-DD
//
// The nightly cron at /api/cron/webhook-gap-check uses the same lib
// and posts to Slack when gaps > 0.

import { NextRequest, NextResponse } from "next/server";
import { detectWebhookGaps } from "@/lib/shopify-webhook-gaps";

export const maxDuration = 300;

function todayISO(): string {
  return new Date().toISOString().substring(0, 10);
}

function defaultStart(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 7);
  return d.toISOString().substring(0, 10);
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const start = searchParams.get("start") ?? defaultStart();
  const end = searchParams.get("end") ?? todayISO();
  const sample = parseInt(searchParams.get("sample") ?? "20", 10) || 20;

  try {
    const report = await detectWebhookGaps(start, end, sample);
    return NextResponse.json({ ok: true, ...report });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error: e instanceof Error ? e.message : String(e),
        window: { start, end },
      },
      { status: 500 }
    );
  }
}
