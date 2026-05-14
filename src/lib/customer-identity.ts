// Resolve a unified customer_identity from any combination of
// email / phone / shopify_customer_id, creating a new identity if no
// match is found. Returns the identity id.
//
// Lookup priority (most → least authoritative):
//   1. shopify_customer_id    (Shopify-issued, globally unique)
//   2. email_lower            (canonicalized)
//   3. phone_e164             (normalized US-style)
//
// On match, the identity is back-filled with any new identifiers and its
// last_seen_at / last_channel are touched. first_* fields are only set on
// initial creation — they preserve the acquiring click forever.

import { getSql } from "./db";

export type IdentityChannel = "shopify" | "callrail";

export interface ResolveIdentityInput {
  email?: string | null;
  phone_e164?: string | null;
  shopify_customer_id?: number | null;
  channel: IdentityChannel;
  seen_at: Date;
  gclid?: string | null;
  gbraid?: string | null;
  wbraid?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  landing_page?: string | null;
  // Optional revenue contribution from this event (orders only).
  order_value?: number | null;
}

function emailLower(e: string | null | undefined): string | null {
  if (!e) return null;
  const t = e.trim().toLowerCase();
  return t || null;
}

interface IdentityRow {
  id: number;
}

export async function resolveCustomerIdentity(
  input: ResolveIdentityInput
): Promise<number> {
  const sql = getSql();
  const email = emailLower(input.email);
  const phone = input.phone_e164 ?? null;
  const shopifyId = input.shopify_customer_id ?? null;

  // Pass 1: try to find an existing identity by any of the provided keys.
  // Order matters — shopify_customer_id is the strongest signal.
  let existing: IdentityRow[] = [];
  if (shopifyId !== null) {
    existing = await sql<IdentityRow[]>`
      select id from customer_identities
      where shopify_customer_id = ${shopifyId}
      limit 1
    `;
  }
  if (existing.length === 0 && email) {
    existing = await sql<IdentityRow[]>`
      select id from customer_identities
      where email_lower = ${email}
      order by created_at asc
      limit 1
    `;
  }
  if (existing.length === 0 && phone) {
    existing = await sql<IdentityRow[]>`
      select id from customer_identities
      where phone_e164 = ${phone}
      order by created_at asc
      limit 1
    `;
  }

  if (existing.length > 0) {
    const id = existing[0].id;
    // Back-fill any missing identifiers + update last-touch + bump totals.
    // coalesce(existing, new) preserves whatever we already know.
    await sql`
      update customer_identities set
        email_lower         = coalesce(email_lower, ${email}),
        phone_e164          = coalesce(phone_e164, ${phone}),
        shopify_customer_id = coalesce(shopify_customer_id, ${shopifyId}),
        last_seen_at        = greatest(last_seen_at, ${input.seen_at.toISOString()}),
        last_channel        = ${input.channel},
        total_orders        = total_orders + ${input.order_value != null ? 1 : 0},
        total_revenue       = total_revenue + ${input.order_value ?? 0},
        updated_at          = now()
      where id = ${id}
    `;
    return id;
  }

  // Pass 2: no existing match → create a fresh identity.
  const [row] = await sql<IdentityRow[]>`
    insert into customer_identities (
      email_lower, phone_e164, shopify_customer_id,
      first_seen_at, first_channel,
      first_gclid, first_gbraid, first_wbraid,
      first_utm_source, first_utm_medium, first_utm_campaign,
      first_landing_page,
      last_seen_at, last_channel,
      total_orders, total_revenue
    ) values (
      ${email}, ${phone}, ${shopifyId},
      ${input.seen_at.toISOString()}, ${input.channel},
      ${input.gclid ?? null}, ${input.gbraid ?? null}, ${input.wbraid ?? null},
      ${input.utm_source ?? null}, ${input.utm_medium ?? null}, ${input.utm_campaign ?? null},
      ${input.landing_page ?? null},
      ${input.seen_at.toISOString()}, ${input.channel},
      ${input.order_value != null ? 1 : 0}, ${input.order_value ?? 0}
    )
    returning id
  `;
  return row.id;
}
