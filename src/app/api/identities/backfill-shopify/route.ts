// Historical Shopify-orders backfill.
//
// The webhook at /api/webhooks/shopify/order only persists orders going
// forward from when it was registered (May 13). Orders placed before that
// — or that the webhook missed for any reason — never landed in
// shopify_orders, which is why the Capture Rate page (which reads the
// persisted table) shows ~8x fewer orders than the GCLID Attribution page
// (which reads Shopify live).
//
// This route catches the table up: it pulls orders directly from the
// Shopify Admin API in the requested window and runs each one through the
// same persistence + identity-resolution logic the webhook uses. Safe to
// re-run — persistShopifyOrder upserts on conflict.
//
// Usage:
//   POST /api/identities/backfill-shopify?start=2026-04-18&end=2026-05-18
// Optional:
//   &limit=N    — cap how many orders we persist (testing)
//   &dryRun=1   — fetch + count, no DB writes

import { NextRequest, NextResponse } from "next/server";
import { getOrders } from "@/lib/shopify";
import {
  persistShopifyOrder,
  type PersistableShopifyOrder,
} from "@/lib/shopify-orders-persist";

export const maxDuration = 300;

function defaultStart(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 90);
  return d.toISOString().substring(0, 10);
}

function todayISO(): string {
  return new Date().toISOString().substring(0, 10);
}

export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const start = searchParams.get("start") ?? defaultStart();
  const end = searchParams.get("end") ?? todayISO();
  const limit = parseInt(searchParams.get("limit") ?? "0", 10) || 0;
  const dryRun = searchParams.get("dryRun") === "1";

  const params = `created_at_min=${start}T00:00:00-07:00&created_at_max=${end}T23:59:59-07:00`;

  let fetched = 0;
  let persisted = 0;
  const errors: { id: number; error: string }[] = [];

  try {
    const { orders } = await getOrders(params);
    fetched = orders.length;

    const toProcess = limit > 0 ? orders.slice(0, limit) : orders;

    if (dryRun) {
      return NextResponse.json({
        ok: true,
        dryRun: true,
        window: { start, end },
        fetched,
        wouldPersist: toProcess.length,
      });
    }

    for (const order of toProcess) {
      try {
        // Lib's ShopifyOrder declares billing_address without phone, but
        // Shopify's actual REST response includes it. Cast through unknown.
        await persistShopifyOrder(order as unknown as PersistableShopifyOrder);
        persisted++;
      } catch (e) {
        errors.push({
          id: order.id,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    return NextResponse.json({
      ok: true,
      window: { start, end },
      fetched,
      persisted,
      errorCount: errors.length,
      errorSample: errors.slice(0, 5),
    });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error: e instanceof Error ? e.message : String(e),
        window: { start, end },
        fetched,
        persisted,
        errorCount: errors.length,
        errorSample: errors.slice(0, 5),
      },
      { status: 500 }
    );
  }
}
