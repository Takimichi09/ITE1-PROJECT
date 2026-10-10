-- Run once in the Supabase SQL Editor for an existing Daily Cup database.
begin;

alter table public.products drop constraint if exists products_category_fkey;
alter table public.products add constraint products_category_fkey
  foreign key (category) references public.product_categories(name) on update cascade;

create table if not exists public.product_subcategories (
  id bigint generated always as identity primary key,
  category_name text not null references public.product_categories(name) on update cascade on delete cascade,
  name text not null check (char_length(btrim(name)) between 2 and 50),
  sort_order integer not null default 0,
  unique(category_name, name)
);

alter table public.products add column if not exists subcategory_id bigint
  references public.product_subcategories(id) on delete set null;
alter table public.products add column if not exists customizations jsonb not null default '[]'::jsonb;
alter table public.order_items add column if not exists customizations jsonb not null default '[]'::jsonb;

-- Keep historical order snapshots intact when an administrator deletes a menu item.
alter table public.order_items drop constraint if exists order_items_product_id_fkey;
alter table public.order_items alter column product_id drop not null;
alter table public.order_items add constraint order_items_product_id_fkey
  foreign key (product_id) references public.products(id) on delete set null;

alter table public.product_subcategories enable row level security;
revoke all on public.product_subcategories from anon, authenticated;
grant select on public.product_subcategories to anon, authenticated;
grant usage, select on sequence public.product_subcategories_id_seq to authenticated;
grant insert, update, delete on public.product_categories, public.product_subcategories to authenticated;

drop policy if exists admin_add_categories on public.product_categories;
drop policy if exists admin_change_categories on public.product_categories;
drop policy if exists admin_delete_categories on public.product_categories;
drop policy if exists public_subcategories on public.product_subcategories;
drop policy if exists admin_subcategories on public.product_subcategories;
create policy admin_add_categories on public.product_categories for insert to authenticated with check (public.is_admin());
create policy admin_change_categories on public.product_categories for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_delete_categories on public.product_categories for delete to authenticated using (public.is_admin());
create policy public_subcategories on public.product_subcategories for select to anon, authenticated using (true);
create policy admin_subcategories on public.product_subcategories for all to authenticated using (public.is_admin()) with check (public.is_admin());

commit;
