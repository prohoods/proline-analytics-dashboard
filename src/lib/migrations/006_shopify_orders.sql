-- Audit trail for every Shopify order with its captured attribution.
-- Lets us measure GCLID capture rate and reconcile against Google Ads clicks.
create table if not exists shopify_orders (
  id                  bigint primary key,        -- shopify order id
  order_number        text,                      -- e.g. "#1234"
  email               text,
  phone_e164          text,
  shopify_customer_id bigint,
  customer_orders_count integer,                 -- for new vs returning classification
  is_new_customer     boolean,
  ordered_at          timestamptz not null,
  total               numeric(12,2),
  currency            text default 'USD',

  -- click ids captured from note_attributes
  gclid               text,
  gbraid              text,
  wbraid              text,
  fbclid              text,
  msclkid             text,
  ttclid              text,

  -- utm params captured from note_attributes
  utm_source          text,
  utm_medium          text,
  utm_campaign        text,
  utm_term            text,
  utm_content         text,

  -- session context
  landing_page        text,
  referrer            text,

  -- raw note_attributes for debugging / future fields
  note_attributes     jsonb,

  received_at         timestamptz not null default now()
);

create index if not exists shopify_orders_ordered_at_idx on shopify_orders (ordered_at desc);
create index if not exists shopify_orders_gclid_idx on shopify_orders (gclid) where gclid is not null;
create index if not exists shopify_orders_phone_idx on shopify_orders (phone_e164) where phone_e164 is not null;
create index if not exists shopify_orders_email_idx on shopify_orders (email) where email is not null;
create index if not exists shopify_orders_customer_idx on shopify_orders (shopify_customer_id) where shopify_customer_id is not null;
