-- Google Ads click_view import. One row per gclid that Google reports.
-- Joined against shopify_orders to compute capture rate:
-- (# orders w/ captured gclid that matches) / (# clicks).
create table if not exists google_ads_clicks (
  gclid             text primary key,
  click_date        date not null,
  campaign_id       text,
  campaign_name     text,
  ad_group_id       text,
  ad_group_name     text,
  device            text,            -- MOBILE / DESKTOP / TABLET / OTHER
  ad_network_type   text,            -- SEARCH / DISPLAY / YOUTUBE / etc
  imported_at       timestamptz not null default now()
);

create index if not exists google_ads_clicks_date_idx
  on google_ads_clicks (click_date desc);
create index if not exists google_ads_clicks_campaign_idx
  on google_ads_clicks (campaign_id);
