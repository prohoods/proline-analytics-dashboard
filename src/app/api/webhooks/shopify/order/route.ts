// Shopify order/paid webhook → fires the matching offline conversion in Google Ads.
//
// Three paths:
//   1. Order has a GCLID in note_attributes  → "Offline - Purchase"
//   2. Order has a GBRAID in note_attributes → "Offline - Purchase - GBRAID"
//   3. Otherwise, look up the customer phone in `callrail_calls` for a recent
//      call with a GCLID/GBRAID → "Phone Call Sale"

import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { uploadClickConversion } from "@/lib/google-ads-conversions";
import { getSql } from "@/lib/db";
import {
  extractAttrs,
  normalizePhoneE164,
  persistShopifyOrder,
  pickPhone,
  type PersistableShopifyOrder,
} from "@/lib/shopify-orders-persist";

const SHOPIFY_WEBHOOK_SECRET = process.env.SHOPIFY_WEBHOOK_SECRET ?? "";

type ShopifyOrder = PersistableShopifyOrder;

interface WebhookLog {
  topic: string | null;
  shopify_order_id: number | null;
  order_number: string | null;
  hmac_valid: boolean;
  parsed: boolean;
  persisted: boolean;
  persist_error: string | null;
  conversion_path: string | null;
  conversion_result: unknown;
  http_status: number;
}

async function writeWebhookLog(log: WebhookLog): Promise<void> {
  // Best-effort. If logging fails we still want the webhook response to
  // succeed — Shopify will retry on non-2xx, and we don't want to flap a
  // healthy delivery just because the audit insert failed.
  try {
    const sql = getSql();
    await sql`
      insert into shopify_webhook_log (
        topic, shopify_order_id, order_number, hmac_valid, parsed,
        persisted, persist_error, conversion_path, conversion_result, http_status
      ) values (
        ${log.topic}, ${log.shopify_order_id}, ${log.order_number},
        ${log.hmac_valid}, ${log.parsed}, ${log.persisted}, ${log.persist_error},
        ${log.conversion_path},
        ${log.conversion_result == null ? null : sql.json(log.conversion_result as never)},
        ${log.http_status}
      )
    `;
  } catch (e) {
    console.error("shopify_webhook_log insert failed", e);
  }
}

function verifyHmac(rawBody: string, headerHmac: string | null): boolean {
  if (!SHOPIFY_WEBHOOK_SECRET || !headerHmac) return false;
  const digest = crypto
    .createHmac("sha256", SHOPIFY_WEBHOOK_SECRET)
    .update(rawBody, "utf8")
    .digest("base64");
  try {
    return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(headerHmac));
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const hmac = req.headers.get("x-shopify-hmac-sha256");
  const topic = req.headers.get("x-shopify-topic");

  const log: WebhookLog = {
    topic,
    shopify_order_id: null,
    order_number: null,
    hmac_valid: false,
    parsed: false,
    persisted: false,
    persist_error: null,
    conversion_path: null,
    conversion_result: null,
    http_status: 200,
  };

  const respond = async (body: unknown, init?: { status?: number }) => {
    log.http_status = init?.status ?? 200;
    await writeWebhookLog(log);
    return NextResponse.json(body, init);
  };

  if (!verifyHmac(rawBody, hmac)) {
    return respond({ ok: false, error: "invalid hmac" }, { status: 401 });
  }
  log.hmac_valid = true;

  let order: ShopifyOrder;
  try {
    order = JSON.parse(rawBody);
  } catch {
    return respond({ ok: false, error: "invalid json" }, { status: 400 });
  }
  log.parsed = true;
  log.shopify_order_id = order.id;
  log.order_number = order.name ?? null;

  const sourceId = String(order.id);
  const conversionAt = new Date(order.processed_at || order.created_at);
  const value = parseFloat(order.total_price ?? order.subtotal_price ?? "0") || 1;
  const currency = order.currency ?? "USD";

  const attrs = extractAttrs(order);
  const gclid = attrs.gclid;
  const gbraid = attrs.gbraid;
  const wbraid = attrs.wbraid;
  const phoneForOrder = normalizePhoneE164(pickPhone(order));

  // Persist before any conversion upload so we have an audit row no matter what.
  try {
    await persistShopifyOrder(order, attrs, phoneForOrder);
    log.persisted = true;
  } catch (e) {
    // Never block the conversion upload on persistence failure — just log.
    log.persist_error = e instanceof Error ? e.message : String(e);
    console.error("shopify_orders persist failed", e);
  }

  // Path 1 / 2: direct click attribution from the order itself.
  if (gclid || gbraid || wbraid) {
    const action = gclid
      ? "offline_purchase"
      : gbraid
      ? "offline_purchase_gbraid"
      : "offline_purchase_gbraid"; // wbraid currently bucketed with gbraid action
    const result = await uploadClickConversion({
      source: "shopify",
      sourceId,
      conversionAction: action,
      gclid,
      gbraid,
      wbraid,
      conversionAt,
      value,
      currency,
    });
    log.conversion_path = "direct";
    log.conversion_result = result;
    return respond({ ok: true, path: "direct", result });
  }

  // Path 3: phone-call attribution. Match by customer phone against callrail_calls.
  const phone = phoneForOrder;
  if (!phone) {
    log.conversion_path = "skipped";
    log.conversion_result = { reason: "no gclid and no phone" };
    return respond({ ok: true, path: "skipped", reason: "no gclid and no phone" });
  }

  const sql = getSql();
  // Look back 90 days (Google Ads click-through window) for a matching call.
  // The phone_call_sale conversion action only accepts gclid (not gbraid/wbraid),
  // so we filter on gclid here. A call with only gbraid/wbraid is dropped — there's
  // no equivalent phone-call action set up in Google Ads for those click types yet.
  const calls = await sql<
    { id: string; gclid: string; call_started_at: Date }[]
  >`
    select id, gclid, call_started_at
    from callrail_calls
    where phone_e164 = ${phone}
      and call_started_at >= ${new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()}
      and call_started_at <= ${conversionAt.toISOString()}
      and gclid is not null
      and btrim(gclid) <> ''
    order by call_started_at desc
    limit 1
  `;

  if (calls.length === 0) {
    log.conversion_path = "skipped";
    log.conversion_result = { reason: "no matching call with gclid" };
    return respond({ ok: true, path: "skipped", reason: "no matching call with gclid" });
  }

  const call = calls[0];
  const result = await uploadClickConversion({
    source: "shopify",
    sourceId,
    conversionAction: "phone_call_sale",
    gclid: call.gclid,
    conversionAt,
    value,
    currency,
  });

  log.conversion_path = "phone_call";
  log.conversion_result = { matchedCallId: call.id, ...result };
  return respond({
    ok: true,
    path: "phone_call",
    matchedCallId: call.id,
    result,
  });
}
