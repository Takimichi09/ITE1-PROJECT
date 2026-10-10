-- Daily Cup: run once in a NEW Supabase project's SQL Editor.
-- Paste this complete file into a fresh query. Do not append it to an older draft.
-- Customer accounts are created through Supabase Auth. No credentials are seeded.
begin;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (username ~ '^[a-z][a-z0-9_]{2,23}$'),
  full_name text not null default '' check (char_length(full_name) <= 100),
  contact text not null default '' check (contact = '' or contact ~ '^(09[0-9]{9}|\+639[0-9]{9})$'),
  address_line text not null default '' check (char_length(address_line) <= 250),
  barangay text not null default '',
  role text not null default 'customer' check (role in ('customer', 'admin')),
  created_at timestamptz not null default now()
);

create table public.delivery_barangays (name text primary key);
-- PSA PSGC June 2026: Barangay 176 was replaced by 176-A through 176-F.
insert into public.delivery_barangays(name)
select 'Barangay ' || n from generate_series(1,188) as n where n <> 176;
insert into public.delivery_barangays(name)
select 'Barangay 176-' || suffix from unnest(array['A','B','C','D','E','F']) as suffix;

create table public.product_categories (
  name text primary key check (char_length(btrim(name)) between 2 and 50),
  sort_order integer not null default 0
);

create table public.product_subcategories (
  id bigint generated always as identity primary key,
  category_name text not null references public.product_categories(name) on update cascade on delete cascade,
  name text not null check (char_length(btrim(name)) between 2 and 50),
  sort_order integer not null default 0,
  unique(category_name, name)
);

create table public.products (
  id text primary key,
  name text not null,
  category text not null references public.product_categories(name) on update cascade,
  subcategory_id bigint references public.product_subcategories(id) on delete set null,
  description text not null default '',
  price numeric(10,2) not null check (price > 0),
  image text not null default '',
  detail text not null default '',
  badge text not null default '',
  customizations jsonb not null default '[]'::jsonb check (jsonb_typeof(customizations) = 'array'),
  available boolean not null default true,
  sort_order integer not null default 0
);

create table public.store_settings (
  id boolean primary key default true check (id),
  shop_name text not null default 'Daily Cup' check (char_length(shop_name) between 2 and 80),
  announcement text not null default '' check (char_length(announcement) <= 160),
  about_text text not null default '' check (char_length(about_text) <= 2000),
  address text not null default '' check (char_length(address) <= 250),
  hours text not null default '' check (char_length(hours) <= 250),
  phone text not null default '' check (char_length(phone) <= 40),
  email text not null default '' check (char_length(email) <= 254),
  hero_image text not null default '' check (char_length(hero_image) <= 1000),
  cafe_image text not null default '' check (char_length(cafe_image) <= 1000)
  ,gcash_qr_image text not null default '' check (char_length(gcash_qr_image) <= 1000)
);
insert into public.store_settings(id) values (true);

create table public.gallery_images (
  id uuid primary key default gen_random_uuid(),
  image_url text not null check (image_url ~ '^https://[^ ]+$' and char_length(image_url) <= 1000),
  caption text not null default '' check (char_length(caption) <= 160),
  sort_order integer not null default 0,
  published boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles(id),
  request_id uuid not null,
  order_number text not null unique default ('DC-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,12))),
  status text not null default 'verifying_payment' check (status in ('verifying_payment','placed','preparing','ready','out_for_delivery','completed','cancelled')),
  fulfillment text not null check (fulfillment in ('pickup','delivery')),
  full_name text not null check (char_length(full_name) between 2 and 100),
  contact text not null check (contact ~ '^(09[0-9]{9}|\+639[0-9]{9})$'),
  address_line text,
  barangay text references public.delivery_barangays(name),
  city text,
  notes text not null default '' check (char_length(notes) <= 300),
  subtotal numeric(10,2) not null check (subtotal > 0),
  delivery_fee numeric(10,2) not null,
  total numeric(10,2) not null,
  payment_method text not null default 'cash' check (payment_method in ('cash','gcash')),
  payment_status text not null default 'pending' check (payment_status in ('pending','paid')),
  payment_reference text not null default '' check (char_length(payment_reference) <= 80),
  payment_proof_path text not null default '' check (char_length(payment_proof_path) <= 500),
  cancellation_reason text not null default '' check (char_length(cancellation_reason) <= 200),
  created_at timestamptz not null default now(),
  unique(customer_id, request_id),
  check (total = subtotal + delivery_fee),
  check ((fulfillment = 'pickup' and delivery_fee = 0 and address_line is null and barangay is null and city is null)
    or (fulfillment = 'delivery' and delivery_fee = 60 and city = 'Caloocan City' and address_line is not null and char_length(btrim(address_line)) between 5 and 250 and barangay is not null))
);
create index orders_customer_created_idx on public.orders(customer_id, created_at desc);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id text references public.products(id) on delete set null,
  name text not null,
  image text not null default '',
  detail text not null default '',
  customizations jsonb not null default '[]'::jsonb,
  quantity integer not null check (quantity between 1 and 20),
  unit_price numeric(10,2) not null check (unit_price > 0),
  unique(order_id, product_id)
);

create table public.order_feedback (
  order_id uuid primary key references public.orders(id) on delete cascade,
  customer_id uuid not null references public.profiles(id),
  rating integer not null check (rating between 1 and 5),
  comment text not null default '' check (char_length(comment) <= 500),
  created_at timestamptz not null default now()
);

create function public.create_customer_profile() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_username text := lower(coalesce(new.raw_user_meta_data->>'username', ''));
begin
  -- Storefront customers supply a username. Dashboard-created staff users do not,
  -- so give those users a collision-resistant internal profile username.
  if v_username !~ '^[a-z][a-z0-9_]{2,23}$' then
    v_username := 'admin_' || left(replace(new.id::text, '-', ''), 12);
  end if;
  insert into public.profiles(id, username, full_name, contact, role)
  values (new.id, v_username, left(coalesce(new.raw_user_meta_data->>'full_name', split_part(coalesce(new.email, ''), '@', 1), ''),100),
    coalesce(new.raw_user_meta_data->>'contact',''), 'customer');
  return new;
end;
$$;
revoke all on function public.create_customer_profile() from public;
create trigger on_customer_signup after insert on auth.users for each row execute function public.create_customer_profile();

create function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

alter table public.profiles enable row level security;
alter table public.products enable row level security;
alter table public.product_categories enable row level security;
alter table public.product_subcategories enable row level security;
alter table public.store_settings enable row level security;
alter table public.gallery_images enable row level security;
alter table public.delivery_barangays enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.order_feedback enable row level security;

revoke all on public.profiles, public.products, public.product_categories, public.product_subcategories, public.store_settings, public.gallery_images, public.delivery_barangays, public.orders, public.order_items, public.order_feedback from anon, authenticated;
grant select on public.products, public.product_categories, public.product_subcategories, public.store_settings, public.gallery_images, public.delivery_barangays to anon, authenticated;
grant usage, select on sequence public.product_subcategories_id_seq to authenticated;
grant select on public.profiles, public.orders, public.order_items to authenticated;
grant select on public.order_feedback to anon, authenticated;
grant insert on public.order_feedback to authenticated;
grant update(full_name, contact, address_line, barangay) on public.profiles to authenticated;
grant insert, update, delete on public.products to authenticated;
grant insert, update, delete on public.product_categories, public.product_subcategories to authenticated;
grant update(shop_name, announcement, about_text, address, hours, phone, email, hero_image, cafe_image, gcash_qr_image) on public.store_settings to authenticated;
grant insert, update, delete on public.gallery_images to authenticated;
grant update(status) on public.orders to authenticated;

create policy public_catalog on public.products for select to anon, authenticated using (true);
create policy admin_products on public.products for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy public_categories on public.product_categories for select to anon, authenticated using (true);
create policy admin_add_categories on public.product_categories for insert to authenticated with check (public.is_admin());
create policy admin_change_categories on public.product_categories for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_delete_categories on public.product_categories for delete to authenticated using (public.is_admin());
create policy public_subcategories on public.product_subcategories for select to anon, authenticated using (true);
create policy admin_subcategories on public.product_subcategories for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy public_settings on public.store_settings for select to anon, authenticated using (true);
create policy admin_settings on public.store_settings for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy public_gallery on public.gallery_images for select to anon, authenticated using (published);
create policy admin_gallery on public.gallery_images for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy public_barangays on public.delivery_barangays for select to anon, authenticated using (true);
create policy own_profile on public.profiles for select to authenticated using (id = (select auth.uid()) or public.is_admin());
create policy edit_own_profile on public.profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()) and (barangay = '' or exists(select 1 from public.delivery_barangays b where b.name = profiles.barangay)));
create policy own_orders on public.orders for select to authenticated using (customer_id = (select auth.uid()) or public.is_admin());
create policy own_order_items on public.order_items for select to authenticated using (exists(select 1 from public.orders o where o.id = order_id and (o.customer_id = (select auth.uid()) or public.is_admin())));
create policy public_feedback on public.order_feedback for select to anon, authenticated using (true);
create policy completed_order_feedback on public.order_feedback for insert to authenticated with check (customer_id = (select auth.uid()) and exists(select 1 from public.orders o where o.id = order_id and o.customer_id = (select auth.uid()) and o.status = 'completed'));

-- All order writes are atomic. The caller supplies IDs/quantities, never prices or fees.
create function public.place_order(p_request_id uuid, p_details jsonb, p_items jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_order public.orders%rowtype;
  v_product public.products%rowtype;
  v_item jsonb;
  v_lines jsonb := '[]'::jsonb;
  v_seen text[] := array[]::text[];
  v_qty integer;
  v_group jsonb;
  v_option jsonb;
  v_selected jsonb;
  v_group_selected jsonb;
  v_option_id text;
  v_matched integer;
  v_adjustment numeric(10,2);
  v_customizations jsonb;
  v_subtotal numeric(10,2) := 0;
  v_fee numeric(10,2) := 0;
  v_fulfillment text := p_details->>'fulfillment';
  v_name text := btrim(p_details->>'full_name');
  v_contact text := regexp_replace(p_details->>'contact', '[\s()-]', '', 'g');
  v_address text;
  v_barangay text;
  v_city text;
  v_payment_method text := coalesce(p_details->>'payment_method','cash');
  v_payment_reference text := btrim(coalesce(p_details->>'payment_reference',''));
  v_payment_proof_path text := btrim(coalesce(p_details->>'payment_proof_path',''));
begin
  if v_user is null then raise exception 'Please sign in before placing an order.'; end if;
  if not exists(select 1 from public.profiles where id = v_user and role in ('customer','admin')) then raise exception 'Customer profile is unavailable.'; end if;
  if p_request_id is null then raise exception 'Order reference is required.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_user::text || ':' || p_request_id::text,0));
  select * into v_order from public.orders where customer_id = v_user and request_id = p_request_id;
  if found then return to_jsonb(v_order); end if;
  if v_fulfillment is null or v_fulfillment not in ('pickup','delivery') then raise exception 'Choose pickup or delivery.'; end if;
  if v_name is null or char_length(v_name) not between 2 and 100 then raise exception 'Enter your full name.'; end if;
  if v_contact is null or v_contact !~ '^(09[0-9]{9}|\+639[0-9]{9})$' then raise exception 'Enter a valid Philippine mobile number.'; end if;
  if v_payment_method not in ('cash','gcash') then raise exception 'Choose a valid payment method.'; end if;
  if v_payment_method = 'gcash' and (char_length(v_payment_reference) < 6 or v_payment_proof_path = '') then raise exception 'GCash reference number and payment proof are required.'; end if;
  if v_fulfillment = 'delivery' then
    v_address := btrim(p_details->>'address_line');
    v_barangay := p_details->>'barangay';
    v_city := p_details->>'city';
    if v_city is distinct from 'Caloocan City' or not exists(select 1 from public.delivery_barangays where name = v_barangay) then raise exception 'Delivery is available only within Caloocan City. Choose a valid barangay.'; end if;
    if v_address is null or char_length(v_address) not between 5 and 250 then raise exception 'Enter your complete delivery address.'; end if;
    v_fee := 60;
  end if;
  if jsonb_typeof(p_items) is distinct from 'array' then raise exception 'Your bag is invalid.'; end if;
  if jsonb_array_length(p_items) not between 1 and 30 then raise exception 'Your bag must contain between 1 and 30 different products.'; end if;
  for v_item in select value from jsonb_array_elements(p_items) loop
    if (v_item->>'quantity') is null or (v_item->>'quantity') !~ '^[0-9]{1,2}$' then raise exception 'Invalid item quantity.'; end if;
    v_qty := (v_item->>'quantity')::integer;
    if v_qty not between 1 and 20 then raise exception 'Choose between 1 and 20 of each product.'; end if;
    if (v_item->>'product_id') = any(v_seen) then raise exception 'Each product may appear only once in your bag.'; end if;
    select * into v_product from public.products where id = v_item->>'product_id' and available for share;
    if not found then raise exception 'An item is no longer available. Please update your bag.'; end if;
    v_selected := coalesce(v_item->'selections', '{}'::jsonb);
    if jsonb_typeof(v_selected) is distinct from 'object' then raise exception 'Invalid item customization.'; end if;
    v_adjustment := 0;
    v_customizations := '[]'::jsonb;
    for v_group in select value from jsonb_array_elements(v_product.customizations) loop
      v_group_selected := coalesce(v_selected->(v_group->>'id'), '[]'::jsonb);
      if jsonb_typeof(v_group_selected) is distinct from 'array' then raise exception 'Invalid item customization.'; end if;
      if coalesce((v_group->>'required')::boolean, false) and jsonb_array_length(v_group_selected) = 0 then raise exception 'Choose all required options for %.', v_product.name; end if;
      if v_group->>'type' = 'single' and jsonb_array_length(v_group_selected) > 1 then raise exception 'Choose only one option per size group.'; end if;
      v_matched := 0;
      for v_option_id in select value #>> '{}' from jsonb_array_elements(v_group_selected) loop
        for v_option in select value from jsonb_array_elements(coalesce(v_group->'options','[]'::jsonb)) loop
          if v_option->>'id' = v_option_id then
            v_matched := v_matched + 1;
            v_adjustment := v_adjustment + coalesce((v_option->>'price')::numeric, 0);
            v_customizations := v_customizations || jsonb_build_array(jsonb_build_object('group',v_group->>'name','option',v_option->>'name','price',coalesce((v_option->>'price')::numeric,0)));
          end if;
        end loop;
      end loop;
      if v_matched <> jsonb_array_length(v_group_selected) then raise exception 'An item option is no longer available.'; end if;
    end loop;
    v_seen := array_append(v_seen, v_product.id);
    v_subtotal := v_subtotal + (v_product.price + v_adjustment) * v_qty;
    v_lines := v_lines || jsonb_build_array(jsonb_build_object('product_id', v_product.id, 'name', v_product.name, 'image', v_product.image, 'detail', '', 'customizations', v_customizations, 'quantity', v_qty, 'unit_price', v_product.price + v_adjustment));
  end loop;
  insert into public.orders(customer_id, request_id, fulfillment, full_name, contact, address_line, barangay, city, notes, subtotal, delivery_fee, total, payment_method, payment_reference, payment_proof_path)
  values(v_user,p_request_id,v_fulfillment,v_name,v_contact,v_address,v_barangay,v_city,left(coalesce(p_details->>'notes',''),300),v_subtotal,v_fee,v_subtotal+v_fee,v_payment_method,v_payment_reference,v_payment_proof_path)
  returning * into v_order;
  insert into public.order_items(order_id,product_id,name,image,detail,customizations,quantity,unit_price)
  select v_order.id,x.product_id,x.name,x.image,x.detail,x.customizations,x.quantity,x.unit_price
  from jsonb_to_recordset(v_lines) as x(product_id text,name text,image text,detail text,customizations jsonb,quantity integer,unit_price numeric);
  return to_jsonb(v_order);
end;
$$;
revoke all on function public.place_order(uuid,jsonb,jsonb) from public, anon;
grant execute on function public.place_order(uuid,jsonb,jsonb) to authenticated;

create function public.cancel_own_order(p_order_id uuid) returns public.orders
language plpgsql security definer set search_path = '' as $$
declare v_order public.orders%rowtype;
begin
  update public.orders set status='cancelled', cancellation_reason='Cancelled by customer'
  where id=p_order_id and customer_id=auth.uid() and status in ('verifying_payment','placed') returning * into v_order;
  if not found then raise exception 'This order can no longer be cancelled.'; end if;
  return v_order;
end; $$;
revoke all on function public.cancel_own_order(uuid) from public, anon;
grant execute on function public.cancel_own_order(uuid) to authenticated;

create function public.admin_update_order(p_order_id uuid, p_action text, p_reason text default '') returns public.orders
language plpgsql security definer set search_path = '' as $$
declare v_order public.orders%rowtype;
begin
  if not public.is_admin() then raise exception 'Admin access required.'; end if;
  select * into v_order from public.orders where id=p_order_id for update;
  if not found then raise exception 'Order not found.'; end if;
  if p_action='cancelled' then
    if v_order.status not in ('verifying_payment','placed') then raise exception 'Orders can only be cancelled before preparation.'; end if;
    if btrim(coalesce(p_reason,''))='' then raise exception 'Choose a cancellation reason.'; end if;
    update public.orders set status='cancelled',cancellation_reason=left(btrim(p_reason),200) where id=p_order_id returning * into v_order;
  elsif p_action='paid' then
    update public.orders set payment_status='paid' where id=p_order_id returning * into v_order;
  elsif p_action='preparing' and v_order.status in ('verifying_payment','placed') then
    update public.orders set status='preparing',payment_status=case when payment_method='gcash' then 'paid' else payment_status end where id=p_order_id returning * into v_order;
  elsif p_action='ready' and v_order.status='preparing' and v_order.fulfillment='pickup' then
    update public.orders set status='ready' where id=p_order_id returning * into v_order;
  elsif p_action='out_for_delivery' and v_order.status='preparing' and v_order.fulfillment='delivery' then
    update public.orders set status='out_for_delivery' where id=p_order_id returning * into v_order;
  elsif p_action='completed' and ((v_order.fulfillment='pickup' and v_order.status='ready') or (v_order.fulfillment='delivery' and v_order.status='out_for_delivery')) then
    update public.orders set status='completed' where id=p_order_id returning * into v_order;
  else raise exception 'That status change is not allowed.';
  end if;
  return v_order;
end; $$;
revoke all on function public.admin_update_order(uuid,text,text) from public, anon;
grant execute on function public.admin_update_order(uuid,text,text) to authenticated;
commit;
