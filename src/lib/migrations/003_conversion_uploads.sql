-- Audit log for every offline conversion we attempt to upload to Google Ads.
-- Each row = one attempt. Retries get their own rows so we can see history.
create table if not exists conversion_uploads (
  id                  bigserial primary key,
  source              text not null,        -- 'shopify' | 'callrail'
  source_id           text not null,        -- shopify order id or callrail call id
  conversion_action   text not null,        -- 'offline_purchase' | 'offline_purchase_gbraid' | 'phone_call_sale'
  conversion_action_id text not null,       -- numeric id used in the API call
  gclid               text,
  gbraid              text,
  wbraid              text,
  conversion_value    numeric(12,2),
  currency            text default 'USD',
  conversion_at       timestamptz not null, -- moment the conversion happened (order paid / call ended)
  status              text not null,        -- 'pending' | 'success' | 'error'
  error_message       text,
  google_response     jsonb,
  attempted_at        timestamptz not null default now()
);

create index if not exists conversion_uploads_status_idx on conversion_uploads (status, attempted_at desc);
create index if not exists conversion_uploads_source_idx on conversion_uploads (source, source_id);
create index if not exists conversion_uploads_conversion_at_idx on conversion_uploads (conversion_at desc);

-- CallRail call history — phone number → GCLID/GBRAID lookup so a later
-- Shopify order can be attributed back to the call that drove it.
create table if not exists callrail_calls (
  id                  text primary key,     -- callrail call id
  phone_e164          text not null,        -- normalized customer phone (e.g. +14155551234)
  call_started_at     timestamptz not null,
  call_ended_at       timestamptz,
  duration_seconds    integer,
  gclid               text,
  gbraid              text,
  wbraid              text,
  source              text,                 -- google ads / direct / etc per callrail
  payload             jsonb not null,       -- full webhook body for debugging
  received_at         timestamptz not null default now()
);

create index if not exists callrail_calls_phone_idx on callrail_calls (phone_e164, call_started_at desc);
create index if not exists callrail_calls_started_idx on callrail_calls (call_started_at desc);
