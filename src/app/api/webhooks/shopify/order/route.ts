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

const SHOPIFY_WEBHOOK_SECRET = process.env.SHOPIFY_WEBHOOK_SECRET ?? "";

interface NoteAttribute {
  name: string;
  value: string;
}

interface ShopifyOrder {
  id: number;
  name: string;
  created_at: string;
  processed_at?: string | null;
  total_price?: string;
  subtotal_price?: string;
  currency?: string;
  email?: string | null;
  landing_site?: string | null;
  referring_site?: string | null;
  note_attributes?: NoteAttribute[];
  customer?: {
    id?: number | null;
    phone?: string | null;
    orders_count?: number | null;
  } | null;
  billing_address?: { phone?: string | null } | null;
  shipping_address?: { phone?: string | null } | null;
  phone?: string | null;
}

const ATTR_FIELDS = [
  "gclid",
  "gbraid",
  "wbraid",
  "fbclid",
  "msclkid",
  "ttclid",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "landing_page",
  "referrer",
] as const;

type AttrField = (typeof ATTR_FIELDS)[number];

function extractAttrs(
  order: ShopifyOrder
): Record<AttrField, string | null> {
  const out = {} as Record<AttrField, string | null>;
  for (const f of ATTR_FIELDS) out[f] = pickAttr(order.note_attributes, f);
  return out;
}

async function persistShopifyOrder(
  order: ShopifyOrder,
  attrs: Record<AttrField, string | null>,
  phone: string | null
): Promise<void> {
  const sql = getSql();
  const ordersCount = order.customer?.orders_count ?? null;
  const isNew = ordersCount == null ? null : ordersCount <= 1;
  const total = parseFloat(order.total_price ?? order.subtotal_price ?? "0") || null;
  const orderedAt = new Date(order.processed_at || order.created_at).toISOString();

  await sql`
    insert into shopify_orders (
      id, order_number, email, phone_e164, shopify_customer_id,
      customer_orders_count, is_new_customer, ordered_at, total, currency,
      gclid, gbraid, wbraid, fbclid, msclkid, ttclid,
      utm_source, utm_medium, utm_campaign, utm_term, utm_content,
      landing_page, referrer, note_attributes
    ) values (
      ${order.id}, ${order.name ?? null}, ${order.email ?? null}, ${phone},
      ${order.customer?.id ?? null}, ${ordersCount}, ${isNew},
      ${orderedAt}, ${total}, ${order.currency ?? "USD"},
      ${attrs.gclid}, ${attrs.gbraid}, ${attrs.wbraid},
      ${attrs.fbclid}, ${attrs.msclkid}, ${attrs.ttclid},
      ${attrs.utm_source}, ${attrs.utm_medium}, ${attrs.utm_campaign},
      ${attrs.utm_term}, ${attrs.utm_content},
      ${attrs.landing_page ?? order.landing_site ?? null},
      ${attrs.referrer ?? order.referring_site ?? null},
      ${sql.json((order.note_attributes ?? []) as never)}
    )
    on conflict (id) do update set
      email = excluded.email,
      phone_e164 = coalesce(excluded.phone_e164, shopify_orders.phone_e164),
      shopify_customer_id = coalesce(excluded.shopify_customer_id, shopify_orders.shopify_customer_id),
      customer_orders_count = coalesce(excluded.customer_orders_count, shopify_orders.customer_orders_count),
      is_new_customer = coalesce(excluded.is_new_customer, shopify_orders.is_new_customer),
      total = coalesce(excluded.total, shopify_orders.total),
      gclid = coalesce(excluded.gclid, shopify_orders.gclid),
      gbraid = coalesce(excluded.gbraid, shopify_orders.gbraid),
      wbraid = coalesce(excluded.wbraid, shopify_orders.wbraid),
      fbclid = coalesce(excluded.fbclid, shopify_orders.fbclid),
      msclkid = coalesce(excluded.msclkid, shopify_orders.msclkid),
      ttclid = coalesce(excluded.ttclid, shopify_orders.ttclid),
      utm_source = coalesce(excluded.utm_source, shopify_orders.utm_source),
      utm_medium = coalesce(excluded.utm_medium, shopify_orders.utm_medium),
      utm_campaign = coalesce(excluded.utm_campaign, shopify_orders.utm_campaign),
      utm_term = coalesce(excluded.utm_term, shopify_orders.utm_term),
      utm_content = coalesce(excluded.utm_content, shopify_orders.utm_content),
      landing_page = coalesce(excluded.landing_page, shopify_orders.landing_page),
      referrer = coalesce(excluded.referrer, shopify_orders.referrer),
      note_attributes = excluded.note_attributes
  `;
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

function pickAttr(attrs: NoteAttribute[] | undefined, key: string): string | null {
  if (!attrs) return null;
  const hit = attrs.find((a) => a.name?.toLowerCase() === key.toLowerCase());
  const v = hit?.value?.trim();
  return v ? v : null;
}

// Normalize a US-style phone to E.164 (best-effort). Shopify phones are messy.
function normalizePhoneE164(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  if (raw.trim().startsWith("+")) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return `+${digits}`;
}

function pickPhone(order: ShopifyOrder): string | null {
  return (
    order.customer?.phone ||
    order.billing_address?.phone ||
    order.shipping_address?.phone ||
    order.phone ||
    null
  );
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
  // Look back 90 days (Google Ads click-through window) for a matching call with click ID.
  const calls = await sql<
    { id: string; gclid: string | null; gbraid: string | null; wbraid: string | null; call_started_at: Date }[]
  >`
    select id, gclid, gbraid, wbraid, call_started_at
    from callrail_calls
    where phone_e164 = ${phone}
      and call_started_at >= ${new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()}
      and call_started_at <= ${conversionAt.toISOString()}
      and (gclid is not null or gbraid is not null or wbraid is not null)
    order by call_started_at desc
    limit 1
  `;

  if (calls.length === 0) {
    return NextResponse.json({ ok: true, path: "skipped", reason: "no matching call" });
  }

  const call = calls[0];
  const result = await uploadClickConversion({
    source: "shopify",
    sourceId,
    conversionAction: "phone_call_sale",
    gclid: call.gclid,
    gbraid: call.gbraid,
    wbraid: call.wbraid,
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
