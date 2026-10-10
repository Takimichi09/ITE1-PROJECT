-- Run once in Supabase SQL Editor for projects that already installed schema.sql.
-- It lets dashboard-created Auth users receive a profile without customer metadata.
create or replace function public.create_customer_profile() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_username text := lower(coalesce(new.raw_user_meta_data->>'username', ''));
begin
  if v_username !~ '^[a-z][a-z0-9_]{2,23}$' then
    v_username := 'admin_' || left(replace(new.id::text, '-', ''), 12);
  end if;

  insert into public.profiles(id, username, full_name, contact, role)
  values (
    new.id,
    v_username,
    left(coalesce(new.raw_user_meta_data->>'full_name', split_part(coalesce(new.email, ''), '@', 1), ''), 100),
    coalesce(new.raw_user_meta_data->>'contact', ''),
    'customer'
  );
  return new;
end;
$$;

revoke all on function public.create_customer_profile() from public;

-- After creating an auto-confirmed user in Authentication > Users, promote it:
-- update public.profiles p
-- set role = 'admin'
-- from auth.users u
-- where p.id = u.id and lower(u.email) = lower('admin@yourbusiness.com')
-- returning u.email, p.username, p.role;
