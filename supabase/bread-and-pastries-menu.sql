-- Run in the Supabase SQL Editor after schema.sql. Safe to rerun.
-- Publishes the bread and pastries menu under Foods -> Pastry.
begin;

insert into public.product_categories (name, sort_order)
values ('Foods', 20)
on conflict (name) do nothing;

insert into public.product_subcategories (category_name, name, sort_order)
values ('Foods', 'Pastry', 10)
on conflict (category_name, name) do nothing;

with menu (id, name, price, image, sort_order) as (
  values
    ('pastry-ensay-mada', 'Ensay Mada', 100, '', 10),
    ('pastry-croissant', 'Croissant', 120, '/menu/croissant.jpg', 20),
    ('pastry-banana-loaf', 'Banana Loaf', 120, '/menu/banana-loaf.jpg', 30),
    ('pastry-brownies', 'Brownies', 140, '/menu/brownies.jpg', 40),
    ('pastry-muffin', 'Muffin', 110, '', 50),
    ('pastry-cinnamon-roll', 'Cinnamon Roll', 120, '/menu/cinnamon-roll.jpg', 60),
    ('pastry-donuts', 'Donuts', 180, '', 70)
)
insert into public.products
  (id, name, category, subcategory_id, description, price, image, customizations, available, sort_order)
select
  menu.id,
  menu.name,
  'Foods',
  subcategory.id,
  '',
  menu.price,
  menu.image,
  '[]'::jsonb,
  true,
  menu.sort_order
from menu
cross join public.product_subcategories as subcategory
where subcategory.category_name = 'Foods' and subcategory.name = 'Pastry'
on conflict (id) do update set
  name = excluded.name,
  category = excluded.category,
  subcategory_id = excluded.subcategory_id,
  description = excluded.description,
  price = excluded.price,
  image = excluded.image,
  customizations = excluded.customizations,
  available = excluded.available,
  sort_order = excluded.sort_order;

commit;
