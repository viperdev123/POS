-- POS schema (see SPEC.md §14). Access model: all writes/reads for cashier + kitchen go through
-- Edge Functions (service role). Only the owner (Supabase Auth) gets direct table access via RLS.

create type channel as enum ('dine_in', 'takeaway');            -- add 'delivery' later
create type kitchen_status as enum ('pending', 'cooking', 'done');
create type order_status as enum ('open', 'paid', 'void');
create type pay_method as enum ('cash', 'qr');
create type discount_kind as enum ('percent', 'baht');
create type promo_type as enum ('bogo', 'happy_hour', 'spend_x_get_y', 'set_menu');

-- single-row settings
create table settings (
  id int primary key default 1 check (id = 1),
  shop_name text not null default 'ร้านของฉัน',
  shop_address text not null default '',
  table_count int not null default 10 check (table_count >= 0),
  cashier_pin_hash text,          -- set by Edge Function (bcrypt/scrypt), never plaintext
  kitchen_token_hash text         -- sha256 of secret kitchen link token
);
insert into settings default values;

create table categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sort_order int not null default 0
);

create table menu_items (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references categories(id) on delete set null,
  name text not null,
  image_path text,
  price numeric(10,2) check (price >= 0),   -- null when item has sizes
  has_sizes boolean not null default false,
  is_active boolean not null default true,
  sort_order int not null default 0,
  check (has_sizes or price is not null)
);

create table menu_sizes (
  id uuid primary key default gen_random_uuid(),
  menu_item_id uuid not null references menu_items(id) on delete cascade,
  name text not null,
  price numeric(10,2) not null check (price >= 0),
  sort_order int not null default 0
);

-- shift = one open→close round; order numbers reset per shift
create table shifts (
  id uuid primary key default gen_random_uuid(),
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  next_order_no int not null default 1
);
create unique index one_open_shift on shifts ((closed_at is null)) where closed_at is null;

create table discount_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  kind discount_kind not null,
  value numeric(10,2) not null check (value > 0),
  min_total numeric(10,2),
  starts_at timestamptz,
  expires_at timestamptz,
  max_uses int,
  used_count int not null default 0,
  channels channel[],                  -- null = all
  menu_item_ids uuid[],                -- null = whole bill
  category_ids uuid[],
  is_active boolean not null default true
);

create table promotions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type promo_type not null,
  config jsonb not null default '{}',  -- per-type: items, kind/value, time window, weekdays, threshold, set price...
  is_active boolean not null default true
);

create table orders (
  id uuid primary key default gen_random_uuid(),
  shift_id uuid not null references shifts(id),
  order_no int not null,
  channel channel not null,
  table_no int,
  status order_status not null default 'open',
  kitchen_status kitchen_status not null default 'pending',
  subtotal numeric(10,2) not null default 0,
  discount numeric(10,2) not null default 0,
  discount_code_id uuid references discount_codes(id),
  promotion_id uuid references promotions(id),
  discount_label text,                 -- snapshot, e.g. "SAVE10"
  net numeric(10,2) not null default 0,
  vat numeric(10,2) not null default 0, -- ceil(net*7/107)
  pay_method pay_method,
  paid_at timestamptz,
  void_reason text,
  voided_at timestamptz,
  created_at timestamptz not null default now(),
  unique (shift_id, order_no),
  check (channel <> 'dine_in' or table_no is not null),
  check (discount_code_id is null or promotion_id is null),   -- 1 discount per bill
  check (status <> 'void' or void_reason is not null)
);
create index orders_open_idx on orders (status) where status = 'open';
-- at most one open bill per table
create unique index one_open_bill_per_table on orders (table_no) where status = 'open' and channel = 'dine_in';

create table order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  menu_item_id uuid references menu_items(id) on delete set null,
  name text not null,                  -- snapshots
  size_name text,
  unit_price numeric(10,2) not null,
  qty int not null check (qty > 0),
  note text,
  sent_to_kitchen_at timestamptz,
  removed_at timestamptz,              -- soft delete → kitchen shows strikethrough
  created_at timestamptz not null default now()
);
create index order_items_order_idx on order_items (order_id);

-- atomic order number allocation
create function allocate_order_no(p_shift uuid) returns int
language sql as $$
  update shifts set next_order_no = next_order_no + 1
  where id = p_shift and closed_at is null
  returning next_order_no - 1;
$$;

-- RLS: on everywhere; owner (authenticated) full access; anon gets nothing
do $$
declare t text;
begin
  for t in select unnest(array['settings','categories','menu_items','menu_sizes','shifts',
    'discount_codes','promotions','orders','order_items']) loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy owner_all on %I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;

-- cashier_pin_hash / kitchen_token_hash must not be readable from the browser, even by owner
revoke select on settings from authenticated, anon;
grant select (id, shop_name, shop_address, table_count) on settings to authenticated;

-- menu images (public read so cashier screens can show them)
insert into storage.buckets (id, name, public) values ('menu-images', 'menu-images', true)
on conflict do nothing;
create policy owner_write_menu_images on storage.objects for all to authenticated
  using (bucket_id = 'menu-images') with check (bucket_id = 'menu-images');
