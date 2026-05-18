// Webhook delivery gap detection.
//
// Pulls Shopify's authoritative order list for a window and diffs it
// against shopify_webhook_log to surface drift. Called from two places:
//   1. /api/webhooks/shopify/order/gaps  — on-demand inspection
//   2. /api/cron/webhook-gap-check       — nightly Slack alert

import { getOrders, ShopifyOrder } from "./shopify";
import { getSql } from "./db";

interface LogRow {
  shopify_order_id: string;
  hmac_valid: boolean;
  parsed: boolean;
  persisted: boolean;
  persist_error: string | null;
  conversion_path: string | null;
}

export interface GapSample {
  id: string;
  name: string | null;
  created_at: string | null;
  total: string | null;
}

export interface GapReport {
  window: { start: string; end: string };
  shopify_total: number;
  logged: number;
  gaps: {
    never_received: number;
    hmac_failed: number;
    parse_failed: number;
    persist_failed: number;
    skipped: number;
  };
  samples: {
    never_received: GapSample[];
    hmac_failed: GapSample[];
    parse_failed: GapSample[];
    persist_failed: { id: string; error: string | null }[];
    skipped: GapSample[];
  };
}

export async function detectWebhookGaps(
  start: string,
  end: string,
  sampleSize = 20
): Promise<GapReport> {
  const params = `created_at_min=${start}T00:00:00-07:00&created_at_max=${end}T23:59:59-07:00`;
  const { orders } = await getOrders(params);
  const shopifyIds = orders.map((o) => String(o.id));
  const shopifyById = new Map<string, ShopifyOrder>(
    orders.map((o) => [String(o.id), o])
  );

  const sql = getSql();
  const rows =
    shopifyIds.length === 0
      ? []
      : await sql<LogRow[]>`
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

  // Multiple deliveries per order are possible (orders/create + orders/paid).
  // Keep the "best" row per order: prefer persisted, then parsed, then hmac.
  const logById = new Map<string, LogRow>();
  const rank = (x: LogRow) =>
    (x.persisted ? 4 : 0) + (x.parsed ? 2 : 0) + (x.hmac_valid ? 1 : 0);
  for (const r of rows) {
    const existing = logById.get(r.shopify_order_id);
    if (!existing || rank(r) > rank(existing)) {
      logById.set(r.shopify_order_id, r);
    }
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
    else if (!log.persisted) persistFailed.push({ id, error: log.persist_error });
    else if (log.conversion_path === "skipped") skipped.push(id);
  }

  const buildSample = (ids: string[]): GapSample[] =>
    ids.slice(0, sampleSize).map((id) => {
      const o = shopifyById.get(id);
      return {
        id,
        name: o?.name ?? null,
        created_at: o?.created_at ?? null,
        total: o?.total_price ?? null,
      };
    });

  return {
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
  };
}
