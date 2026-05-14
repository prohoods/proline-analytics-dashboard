-- GA4 + Search Console daily rollups.
--
-- We mirror the slices we actually use in the dashboard rather than every
-- possible dimension combination — keeps the table small and queries fast.
--
-- Re-syncs are idempotent: each (date, dimension tuple) is unique, so the
-- sync endpoint upserts on conflict.

create table if not exists ga4_daily (
  date              date not null,
  channel_group     text not null default '',  -- e.g. 'Paid Search', 'Organic Search'
  source            text not null default '',
  medium            text not null default '',
  campaign          text not null default '',
  sessions          int  not null default 0,
  active_users      int  not null default 0,
  engaged_sessions  int  not null default 0,
  conversions       numeric(12,2) not null default 0,
  total_revenue     numeric(12,2) not null default 0,
  bounce_rate       numeric(6,4)  not null default 0,
  synced_at         timestamptz not null default now(),
  primary key (date, channel_group, source, medium, campaign)
);

create index if not exists ga4_daily_date_idx on ga4_daily (date desc);
create index if not exists ga4_daily_channel_idx on ga4_daily (channel_group);

create table if not exists search_console_daily (
  date         date not null,
  query        text not null default '',
  clicks       int  not null default 0,
  impressions  int  not null default 0,
  ctr          numeric(7,6) not null default 0,
  position     numeric(8,4) not null default 0,
  synced_at    timestamptz not null default now(),
  primary key (date, query)
);

create index if not exists search_console_daily_date_idx
  on search_console_daily (date desc);
create index if not exists search_console_daily_clicks_idx
  on search_console_daily (clicks desc);
