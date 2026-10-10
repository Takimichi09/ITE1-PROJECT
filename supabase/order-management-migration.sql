-- Run once in the Supabase SQL Editor, then rerun menu-customizations-migration.sql.
begin;
alter table public.store_settings add column if not exists gcash_qr_image text not null default '';
alter table public.orders drop constraint if exists orders_status_check;
alter table public.orders alter column status set default 'verifying_payment';
alter table public.orders add constraint orders_status_check check (status in ('verifying_payment','placed','preparing','ready','out_for_delivery','completed','cancelled'));
alter table public.orders drop constraint if exists orders_payment_method_check;
alter table public.orders add constraint orders_payment_method_check check (payment_method in ('cash','gcash'));
alter table public.orders add column if not exists payment_status text not null default 'pending' check (payment_status in ('pending','paid'));
alter table public.orders add column if not exists payment_reference text not null default '';
alter table public.orders add column if not exists payment_proof_path text not null default '';
alter table public.orders add column if not exists cancellation_reason text not null default '';

create table if not exists public.order_feedback (
  order_id uuid primary key references public.orders(id) on delete cascade,
  customer_id uuid not null references public.profiles(id),
  rating integer not null check (rating between 1 and 5),
  comment text not null default '' check (char_length(comment) <= 500),
  created_at timestamptz not null default now()
);
alter table public.order_feedback enable row level security;
grant select on public.order_feedback to anon, authenticated;
grant insert on public.order_feedback to authenticated;
drop policy if exists public_feedback on public.order_feedback;
drop policy if exists completed_order_feedback on public.order_feedback;
create policy public_feedback on public.order_feedback for select to anon, authenticated using (true);
create policy completed_order_feedback on public.order_feedback for insert to authenticated with check (customer_id=auth.uid() and exists(select 1 from public.orders o where o.id=order_id and o.customer_id=auth.uid() and o.status='completed'));
grant update(gcash_qr_image) on public.store_settings to authenticated;
drop policy if exists admin_order_status on public.orders;

create or replace function public.cancel_own_order(p_order_id uuid) returns public.orders language plpgsql security definer set search_path='' as $$
declare v_order public.orders%rowtype; begin
 update public.orders set status='cancelled',cancellation_reason='Cancelled by customer' where id=p_order_id and customer_id=auth.uid() and status in ('verifying_payment','placed') returning * into v_order;
 if not found then raise exception 'This order can no longer be cancelled.'; end if; return v_order; end; $$;
revoke all on function public.cancel_own_order(uuid) from public,anon; grant execute on function public.cancel_own_order(uuid) to authenticated;

create or replace function public.admin_update_order(p_order_id uuid,p_action text,p_reason text default '') returns public.orders language plpgsql security definer set search_path='' as $$
declare v_order public.orders%rowtype; begin
 if not public.is_admin() then raise exception 'Admin access required.'; end if;
 select * into v_order from public.orders where id=p_order_id for update; if not found then raise exception 'Order not found.'; end if;
 if p_action='cancelled' then
  if v_order.status not in ('verifying_payment','placed') then raise exception 'Orders can only be cancelled before preparation.'; end if;
  if btrim(coalesce(p_reason,''))='' then raise exception 'Choose a cancellation reason.'; end if;
  update public.orders set status='cancelled',cancellation_reason=left(btrim(p_reason),200) where id=p_order_id returning * into v_order;
 elsif p_action='paid' then update public.orders set payment_status='paid' where id=p_order_id returning * into v_order;
 elsif p_action='preparing' and v_order.status in ('verifying_payment','placed') then update public.orders set status='preparing',payment_status=case when payment_method='gcash' then 'paid' else payment_status end where id=p_order_id returning * into v_order;
 elsif p_action='ready' and v_order.status='preparing' and v_order.fulfillment='pickup' then update public.orders set status='ready' where id=p_order_id returning * into v_order;
 elsif p_action='out_for_delivery' and v_order.status='preparing' and v_order.fulfillment='delivery' then update public.orders set status='out_for_delivery' where id=p_order_id returning * into v_order;
 elsif p_action='completed' and ((v_order.fulfillment='pickup' and v_order.status='ready') or (v_order.fulfillment='delivery' and v_order.status='out_for_delivery')) then update public.orders set status='completed' where id=p_order_id returning * into v_order;
 else raise exception 'That status change is not allowed.'; end if; return v_order; end; $$;
revoke all on function public.admin_update_order(uuid,text,text) from public,anon; grant execute on function public.admin_update_order(uuid,text,text) to authenticated;
commit;
