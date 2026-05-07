create table if not exists bank_statements (
  id            text primary key,
  file_name     text not null,
  uploaded_at   timestamptz not null default now(),
  size_bytes    integer not null,
  account       text,
  period_start  date,
  period_end    date,
  parsed        jsonb not null,
  summary       jsonb not null
);

create index if not exists bank_statements_period_end_idx on bank_statements (period_end);
create index if not exists bank_statements_account_period_idx on bank_statements (account, period_end);
