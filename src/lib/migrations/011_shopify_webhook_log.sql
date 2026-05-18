-- Audit log for every Shopify webhook delivery.
--
-- We had an 8x gap between orders shown on the GCLID Attribution page (live
-- Shopify API) and the Capture Rate page (persisted shopify_orders) because
-- the webhook was registered May 13 and we had no visibility into which
-- deliveries arrived vs. failed. This table records every POST hit so
-- future gaps surface automatically: compare shopify_webhook_log rows in a
-- window against Shopify's order count for the same window.
--
-- One row per delivery. Columns populated progressively as the request
-- moves through HMAC verification → JSON parse → persistence → conversion
-- upload.

create table if not exists shopify_webhook_log (
  id                bigserial primary key,
  topic             text,
  shopify_order_id  bigint,
  order_number      text,
  hmac_valid        boolean not null,
  parsed            boolean not null default false,
  persisted         boolean not null default false,
  persist_error     text,
  conversion_path   text,        -- 'direct' | 'phone_call' | 'skipped' | null
  conversion_result jsonb,
  http_status       int,
  received_at       timestamptz not null default now()
);

create index if not exists shopify_webhook_log_order_idx
  on shopify_webhook_log (shopify_order_id);

create index if not exists shopify_webhook_log_received_idx
  on shopify_webhook_log (received_at desc);
