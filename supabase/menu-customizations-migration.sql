-- Run once in the Supabase SQL Editor for an existing Daily Cup database.
begin;
alter table public.products add column if not exists customizations jsonb not null default '[]'::jsonb;
alter table public.order_items add column if not exists customizations jsonb not null default '[]'::jsonb;

create or replace function public.place_order(p_request_id uuid, p_details jsonb, p_items jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid(); v_order public.orders%rowtype; v_product public.products%rowtype;
  v_item jsonb; v_lines jsonb := '[]'::jsonb; v_seen text[] := array[]::text[]; v_qty integer;
  v_group jsonb; v_option jsonb; v_selected jsonb; v_group_selected jsonb; v_option_id text;
  v_matched integer; v_adjustment numeric(10,2); v_customizations jsonb;
  v_subtotal numeric(10,2) := 0; v_fee numeric(10,2) := 0;
  v_fulfillment text := p_details->>'fulfillment'; v_name text := btrim(p_details->>'full_name');
  v_contact text := regexp_replace(p_details->>'contact', '[\s()-]', '', 'g');
  v_address text; v_barangay text; v_city text;
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
    v_address := btrim(p_details->>'address_line'); v_barangay := p_details->>'barangay'; v_city := p_details->>'city';
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
    v_adjustment := 0; v_customizations := '[]'::jsonb;
    for v_group in select value from jsonb_array_elements(v_product.customizations) loop
      v_group_selected := coalesce(v_selected->(v_group->>'id'), '[]'::jsonb);
      if jsonb_typeof(v_group_selected) is distinct from 'array' then raise exception 'Invalid item customization.'; end if;
      if coalesce((v_group->>'required')::boolean, false) and jsonb_array_length(v_group_selected) = 0 then raise exception 'Choose all required options for %.', v_product.name; end if;
      if v_group->>'type' = 'single' and jsonb_array_length(v_group_selected) > 1 then raise exception 'Choose only one option per size group.'; end if;
      v_matched := 0;
      for v_option_id in select value #>> '{}' from jsonb_array_elements(v_group_selected) loop
        for v_option in select value from jsonb_array_elements(coalesce(v_group->'options','[]'::jsonb)) loop
          if v_option->>'id' = v_option_id then
            v_matched := v_matched + 1; v_adjustment := v_adjustment + coalesce((v_option->>'price')::numeric, 0);
            v_customizations := v_customizations || jsonb_build_array(jsonb_build_object('group',v_group->>'name','option',v_option->>'name','price',coalesce((v_option->>'price')::numeric,0)));
          end if;
        end loop;
      end loop;
      if v_matched <> jsonb_array_length(v_group_selected) then raise exception 'An item option is no longer available.'; end if;
    end loop;
    v_seen := array_append(v_seen, v_product.id);
    v_subtotal := v_subtotal + (v_product.price + v_adjustment) * v_qty;
    v_lines := v_lines || jsonb_build_array(jsonb_build_object('product_id',v_product.id,'name',v_product.name,'image',v_product.image,'detail','','customizations',v_customizations,'quantity',v_qty,'unit_price',v_product.price+v_adjustment));
  end loop;
  insert into public.orders(customer_id,request_id,fulfillment,full_name,contact,address_line,barangay,city,notes,subtotal,delivery_fee,total,payment_method,payment_reference,payment_proof_path)
  values(v_user,p_request_id,v_fulfillment,v_name,v_contact,v_address,v_barangay,v_city,left(coalesce(p_details->>'notes',''),300),v_subtotal,v_fee,v_subtotal+v_fee,v_payment_method,v_payment_reference,v_payment_proof_path) returning * into v_order;
  insert into public.order_items(order_id,product_id,name,image,detail,customizations,quantity,unit_price)
  select v_order.id,x.product_id,x.name,x.image,x.detail,x.customizations,x.quantity,x.unit_price
  from jsonb_to_recordset(v_lines) as x(product_id text,name text,image text,detail text,customizations jsonb,quantity integer,unit_price numeric);
  return to_jsonb(v_order);
end;
$$;
commit;
