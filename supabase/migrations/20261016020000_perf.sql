-- One round-trip read of everything needed to price a bill (order + items w/ category + applied code + applied promo).
create function order_snapshot(p_order uuid) returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'order', to_jsonb(o),
    'items', coalesce((
      select jsonb_agg(to_jsonb(i) || jsonb_build_object('category_id', m.category_id) order by i.created_at)
      from order_items i left join menu_items m on m.id = i.menu_item_id
      where i.order_id = o.id), '[]'::jsonb),
    'code', (select to_jsonb(c) from discount_codes c where c.id = o.discount_code_id),
    'promo', (select to_jsonb(p) from promotions p where p.id = o.promotion_id),
    'kt', (select kitchen_token_hash from settings where id = 1))
  from orders o where o.id = p_order;
$$;
revoke execute on function order_snapshot from anon, authenticated;  -- Edge Function (service role) only

-- create_order in one round-trip (was: shift lookup, table check, allocate number, insert). Atomic, so a failed insert
-- (e.g. table already has an open bill → 23505) does not burn an order number.
create function create_order(p_channel channel, p_table int) returns orders
language plpgsql as $$
declare s shifts; tc int; n int; o orders;
begin
  select * into s from shifts where closed_at is null;
  if not found then raise exception 'ยังไม่ได้เปิดร้าน' using errcode = 'P0001'; end if;
  if p_channel = 'dine_in' then
    select table_count into tc from settings where id = 1;
    if p_table is null or p_table < 1 or p_table > tc then raise exception 'หมายเลขโต๊ะไม่ถูกต้อง' using errcode = 'P0001'; end if;
  end if;
  update shifts set next_order_no = next_order_no + 1 where id = s.id returning next_order_no - 1 into n;
  insert into orders (shift_id, order_no, channel, table_no)
    values (s.id, n, p_channel, case when p_channel = 'dine_in' then p_table end) returning * into o;
  return o;
end $$;
revoke execute on function create_order from anon, authenticated;

-- Menu revision: bumped whenever menu/sizes/categories change, so cashiers can cache the menu and refetch only on change.
alter table settings add column menu_rev int not null default 0;

create function bump_menu_rev() returns trigger language plpgsql security definer set search_path = public as $$
begin
  update settings set menu_rev = menu_rev + 1 where id = 1;
  return null;
end $$;

create trigger menu_items_rev after insert or update or delete on menu_items for each statement execute function bump_menu_rev();
create trigger menu_sizes_rev after insert or update or delete on menu_sizes for each statement execute function bump_menu_rev();
create trigger categories_rev after insert or update or delete on categories for each statement execute function bump_menu_rev();
