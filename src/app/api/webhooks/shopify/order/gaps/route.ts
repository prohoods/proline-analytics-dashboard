// Webhook delivery gap detector.
//
// Compares Shopify's authoritative order list for a window against
// shopify_webhook_log to surface any delivery gaps — orders Shopify says
// exist that we either never received, received but failed HMAC, received
// but failed to persist, or received but never reached a conversion path.
//
// Usage:
//   GET /api/webhooks/shopify/order/gaps?start=YYYY-MM-DD&end=YYYY-MM-DD
//
// Returns counts + a sample of the missing/failed order ids so we can
// kick off a targeted backfill instead of re-running the whole window.

import { NextRequest, NextResponse } from "next/server";
import { getOrders } from "@/lib/shopify";
import { getSql } from "@/lib/db";

export const maxDuration = 300;

function todayISO(): string {
  return new Date().toISOString().substring(0, 10);
}

function defaultStart(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 7);
  return d.toISOString().substring(0, 10);
}

interface LogRow {
  shopify_order_id: string;
  hmac_valid: boolean;
  parsed: boolean;
  persisted: boolean;
  persist_error: string | null;
  conversion_path: string | null;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const start = searchParams.get("start") ?? defaultStart();
  const end = searchParams.get("end") ?? todayISO();
  const sampleSize = parseInt(searchParams.get("sample") ?? "20", 10) || 20;

  try {
    const params = `created_at_min=${start}T00:00:00-07:00&created_at_max=${end}T23:59:59-07:00`;
    const { orders } = await getOrders(params);
    const shopifyIds = orders.map((o) => String(o.id));
    const shopifyById = new Map(orders.map((o) => [String(o.id), o]));

    const sql = getSql();
    const rows = await sql<LogRow[]>`
      select
        shopify_order_id::text as shopify_order_id,
        hmac_valid,
        parsed,
        persisted,
        persist_error,
        conversion_path
      from shopify_webhook_log
      where shopify_order_id = any(${shopifyIds}::bigint[])
    `;

    const logById = new Map<string, LogRow>();
    for (const r of rows) {
      // Multiple webhook deliveries per order are possible (orders/create
      // + orders/paid). Keep the "best" row: prefer persisted=true, then
      // hmac_valid, then anything.
      const existing = logById.get(r.shopify_order_id);
      if (!existing) {
        logById.set(r.shopify_order_id, r);
        continue;
      }
      const rank = (x: LogRow) =>
        (x.persisted ? 4 : 0) +
        (x.parsed ? 2 : 0) +
        (x.hmac_valid ? 1 : 0);
      if (rank(r) > rank(existing)) logById.set(r.shopify_order_id, r);
    }

    const neverReceived: string[] = [];
    const hmacFailed: string[] = [];
    const parseFailed: string[] = [];
    const persistFailed: { id: string; error: string | null }[] = [];
    const skipped: string[] = [];

    for (const id of shopifyIds) {
      const log = logById.get(id);
      if (!log) {
        neverReceived.push(id);
        continue;
      }
      if (!log.hmac_valid) hmacFailed.push(id);
      else if (!log.parsed) parseFailed.push(id);
      else if (!log.persisted)
        persistFailed.push({ id, error: log.persist_error });
      else if (log.conversion_path === "skipped") skipped.push(id);
    }

    const buildSample = (ids: string[]) =>
      ids.slice(0, sampleSize).map((id) => {
        const o = shopifyById.get(id);
        return {
          id,
          name: o?.name ?? null,
          created_at: o?.created_at ?? null,
          total: o?.total_price ?? null,
        };
      });

    return NextResponse.json({
      ok: true,
      window: { start, end },
      shopify_total: shopifyIds.length,
      logged: logById.size,
      gaps: {
        never_received: neverReceived.length,
        hmac_failed: hmacFailed.length,
        parse_failed: parseFailed.length,
        persist_failed: persistFailed.length,
        skipped: skipped.length,
      },
      samples: {
        never_received: buildSample(neverReceived),
        hmac_failed: buildSample(hmacFailed),
        parse_failed: buildSample(parseFailed),
        persist_failed: persistFailed.slice(0, sampleSize),
        skipped: buildSample(skipped),
      },
    });
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
