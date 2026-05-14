-- Unified customer identity across channels (Shopify, CallRail, future Tidio).
-- One row per real person; resolved by any of email/phone/shopify_customer_id.
--
-- This replaces Shopify's "is_new_customer" (which only knows about Shopify)
-- with a cross-channel notion: a customer is "new" if THIS is their first
-- touch anywhere in our system.

create table if not exists customer_identities (
  id                   bigserial primary key,
  email_lower          text,
  phone_e164           text,
  shopify_customer_id  bigint,

  -- First-touch attribution. Set once when the identity is created,
  -- never overwritten — this is the click that acquired the customer.
  first_seen_at        timestamptz not null default now(),
  first_channel        text,              -- 'shopify' | 'callrail'
  first_gclid          text,
  first_gbraid         text,
  first_wbraid         text,
  first_utm_source     text,
  first_utm_medium     text,
  first_utm_campaign   text,
  first_landing_page   text,

  -- Last-touch + lifetime totals. Updated on every event.
  last_seen_at         timestamptz not null default now(),
  last_channel         text,
  total_orders         int not null default 0,
  total_revenue        numeric(12,2) not null default 0,

  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- shopify_customer_id is the most authoritative key — partial unique so we
-- can't accidentally create two identities for the same Shopify customer.
create unique index if not exists customer_identities_shopify_uniq
  on customer_identities (shopify_customer_id)
  where shopify_customer_id is not null;

-- Email/phone are not unique (households share emails/phones) but indexed
-- for fast resolver lookups.
create index if not exists customer_identities_email_idx
  on customer_identities (email_lower)
  where email_lower is not null;
create index if not exists customer_identities_phone_idx
  on customer_identities (phone_e164)
  where phone_e164 is not null;

-- Link orders + calls to identities. Nullable since old rows have none until
-- backfill runs.
alter table shopify_orders
  add column if not exists customer_identity_id bigint references customer_identities(id);
alter table callrail_calls
  add column if not exists customer_identity_id bigint references customer_identities(id);

create index if not exists shopify_orders_identity_idx
  on shopify_orders (customer_identity_id);
create index if not exists callrail_calls_identity_idx
  on callrail_calls (customer_identity_id);
