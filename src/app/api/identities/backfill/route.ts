// One-shot backfill: walk existing shopify_orders + callrail_calls in
// chronological order, resolve each through the identity resolver, and
// stamp the customer_identity_id FK. Run after migration 009.
//
// Order matters: oldest event first so that first_seen_at / first_* fields
// on each identity reflect the true acquiring touch.

import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { resolveCustomerIdentity } from "@/lib/customer-identity";

interface OrderRow {
  id: number;
  email: string | null;
  phone_e164: string | null;
  shopify_customer_id: number | null;
  ordered_at: Date;
  total: string | number | null;
  gclid: string | null;
  gbraid: string | null;
  wbraid: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  landing_page: string | null;
}

interface CallRow {
  id: string;
  phone_e164: string | null;
  call_started_at: Date;
  gclid: string | null;
  gbraid: string | null;
  wbraid: string | null;
  source: string | null;
}

export async function POST() {
  const sql = getSql();

  let ordersProcessed = 0;
  let callsProcessed = 0;

  try {
    const orders = await sql<OrderRow[]>`
      select id, email, phone_e164, shopify_customer_id, ordered_at, total,
             gclid, gbraid, wbraid, utm_source, utm_medium, utm_campaign,
             landing_page
      from shopify_orders
      where customer_identity_id is null
      order by ordered_at asc
    `;

    const calls = await sql<CallRow[]>`
      select id, phone_e164, call_started_at, gclid, gbraid, wbraid, source
      from callrail_calls
      where customer_identity_id is null
      order by call_started_at asc
    `;

    // Merge the two streams in time order so first-touch is correctly
    // attributed regardless of which channel saw the customer first.
    type Event =
      | { kind: "order"; at: Date; row: OrderRow }
      | { kind: "call"; at: Date; row: CallRow };
    const events: Event[] = [
      ...orders.map((row) => ({ kind: "order" as const, at: row.ordered_at, row })),
      ...calls.map((row) => ({ kind: "call" as const, at: row.call_started_at, row })),
    ].sort((a, b) => a.at.getTime() - b.at.getTime());

    for (const ev of events) {
      if (ev.kind === "order") {
        const o = ev.row;
        const total = typeof o.total === "string" ? parseFloat(o.total) : o.total;
        const identityId = await resolveCustomerIdentity({
          email: o.email,
          phone_e164: o.phone_e164,
          shopify_customer_id: o.shopify_customer_id,
          channel: "shopify",
          seen_at: o.ordered_at,
          gclid: o.gclid,
          gbraid: o.gbraid,
          wbraid: o.wbraid,
          utm_source: o.utm_source,
          utm_medium: o.utm_medium,
          utm_campaign: o.utm_campaign,
          landing_page: o.landing_page,
          order_value: total ?? null,
        });
        await sql`
          update shopify_orders set customer_identity_id = ${identityId}
          where id = ${o.id}
        `;
        ordersProcessed++;
      } else {
        const c = ev.row;
        const identityId = await resolveCustomerIdentity({
          phone_e164: c.phone_e164,
          channel: "callrail",
          seen_at: c.call_started_at,
          gclid: c.gclid,
          gbraid: c.gbraid,
          wbraid: c.wbraid,
          utm_source: c.source,
        });
        await sql`
          update callrail_calls set customer_identity_id = ${identityId}
          where id = ${c.id}
        `;
        callsProcessed++;
      }
    }

    const [{ identities }] = await sql<{ identities: number }[]>`
      select count(*)::int as identities from customer_identities
    `;

    return NextResponse.json({
      ok: true,
      ordersProcessed,
      callsProcessed,
      totalIdentities: identities,
    });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error: e instanceof Error ? e.message : String(e),
        ordersProcessed,
        callsProcessed,
      },
      { status: 500 }
    );
  }
}
