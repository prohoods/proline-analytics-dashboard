create table if not exists shipping_costs (
  id           bigserial primary key,
  order_name   text not null,
  shipped_at   date,
  carrier      text,
  service      text,
  cost         numeric(10,2) not null,
  tracking     text,
  source       text default 'redo_csv',
  uploaded_at  timestamptz default now(),
  unique (tracking)
);

create index if not exists shipping_costs_order_name_idx on shipping_costs (order_name);
create index if not exists shipping_costs_shipped_at_idx on shipping_costs (shipped_at);
