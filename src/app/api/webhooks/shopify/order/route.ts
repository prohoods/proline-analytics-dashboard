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

  if (!verifyHmac(rawBody, hmac)) {
    return NextResponse.json({ ok: false, error: "invalid hmac" }, { status: 401 });
  }

  let order: ShopifyOrder;
  try {
    order = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }

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
  } catch (e) {
    // Never block the conversion upload on persistence failure — just log.
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
    return NextResponse.json({ ok: true, path: "direct", result });
  }

  // Path 3: phone-call attribution. Match by customer phone against callrail_calls.
  const phone = phoneForOrder;
  if (!phone) {
    return NextResponse.json({ ok: true, path: "skipped", reason: "no gclid and no phone" });
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
    return NextResponse.json({ ok: true, path: "skipped", reason: "no matching call with gclid" });
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

  return NextResponse.json({
    ok: true,
    path: "phone_call",
    matchedCallId: call.id,
    result,
  });
}
