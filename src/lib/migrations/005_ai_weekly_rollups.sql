create table if not exists ai_weekly_rollups (
  week_start date primary key,
  generated_at timestamptz not null default now(),
  total_calls int not null default 0,
  sales_count int not null default 0,
  support_count int not null default 0,
  other_count int not null default 0,
  key_trends jsonb,
  content_ideas jsonb,
  sales_summary text,
  support_summary text
);
