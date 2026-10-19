-- Align the data model with the Figma designs.

-- Payment total is rounded UP to whole baht; `rounding` = net - (subtotal - discount) so receipt lines always add up.
alter table orders add column rounding numeric(10,2) not null default 0;

-- Two numbers per bill: order_no = bill number (every bill, "บิล #026"); takeaway_no = takeaway queue ("กลับบ้าน #014").
alter table orders add column takeaway_no int;
update orders set takeaway_no = order_no where channel = 'takeaway';
create unique index orders_takeaway_no_uniq on orders (shift_id, takeaway_no) where takeaway_no is not null;
alter table shifts add column next_takeaway_no int not null default 1;

-- Owner settings page shows the current kitchen link, so keep the raw token (owner-readable only; hash stays for lookups).
alter table settings add column kitchen_token text;
grant select (kitchen_token) on settings to authenticated;

create or replace function create_order(p_channel channel, p_table int) returns orders
language plpgsql as $$
declare s shifts; tc int; n int; tn int; o orders;
begin
  select * into s from shifts where closed_at is null;
  if not found then raise exception 'ยังไม่ได้เปิดร้าน' using errcode = 'P0001'; end if;
  if p_channel = 'dine_in' then
    select table_count into tc from settings where id = 1;
    if p_table is null or p_table < 1 or p_table > tc then raise exception 'หมายเลขโต๊ะไม่ถูกต้อง' using errcode = 'P0001'; end if;
  end if;
  update shifts set next_order_no = next_order_no + 1 where id = s.id returning next_order_no - 1 into n;
  if p_channel = 'takeaway' then
    update shifts set next_takeaway_no = next_takeaway_no + 1 where id = s.id returning next_takeaway_no - 1 into tn;
  end if;
  insert into orders (shift_id, order_no, takeaway_no, channel, table_no)
    values (s.id, n, tn, p_channel, case when p_channel = 'dine_in' then p_table end) returning * into o;
  return o;
end $$;

-- snapshot also carries menu_rev so every bill action can tell the cashier its cached menu is stale (no extra query/request)
create or replace function order_snapshot(p_order uuid) returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'order', to_jsonb(o),
    'items', coalesce((
      select jsonb_agg(to_jsonb(i) || jsonb_build_object('category_id', m.category_id) order by i.created_at)
      from order_items i left join menu_items m on m.id = i.menu_item_id
      where i.order_id = o.id), '[]'::jsonb),
    'code', (select to_jsonb(c) from discount_codes c where c.id = o.discount_code_id),
    'promo', (select to_jsonb(p) from promotions p where p.id = o.promotion_id),
    'kt', (select kitchen_token_hash from settings where id = 1),
    'rev', (select menu_rev from settings where id = 1))
  from orders o where o.id = p_order;
$$;
