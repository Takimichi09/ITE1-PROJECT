-- Run in the Supabase SQL Editor after schema.sql. Safe to rerun.
-- Prices are enforced at checkout from these product rows: 16 oz = ₱130, 22 oz = ₱140.
begin;

insert into public.product_categories (name, sort_order)
values ('Drinks', 10)
on conflict (name) do nothing;

insert into public.product_subcategories (category_name, name, sort_order)
values ('Drinks', 'Coffee', 10)
on conflict (category_name, name) do nothing;

with menu (id, name, image, sort_order) as (
  values
    ('coffee-cappuccino', 'Cappuccino', '/menu/cappuccino.jpg', 10),
    ('coffee-cafe-latte', 'Cafe Latte', '/menu/cafe-latte.jpg', 20),
    ('coffee-white-chocolate-latte', 'White Chocolate Latte', '/menu/white-chocolate-latte.jpg', 30),
    ('coffee-butterscotch-latte', 'Butterscotch Latte', '/menu/butterscotch-latte.jpg', 40),
    ('coffee-salted-caramel-latte', 'Salted Caramel Latte', '/menu/salted-caramel-latte.jpg', 50),
    ('coffee-caramel-latte', 'Caramel Latte', '', 60),
    ('coffee-chocolate-latte', 'Chocolate Latte', '', 70),
    ('coffee-hazelnut-latte', 'Hazelnut Latte', '/menu/hazelnut-latte.jpg', 80),
    ('coffee-french-vanilla-latte', 'French Vanilla Latte', '/menu/french-vanilla-latte.png', 90)
)
insert into public.products
  (id, name, category, subcategory_id, description, price, image, customizations, available, sort_order)
select
  menu.id,
  menu.name,
  'Drinks',
  subcategory.id,
  'Coffee made hot or cold. Choose medium 16 oz or large 22 oz.',
  130,
  menu.image,
  jsonb_build_array(
    jsonb_build_object(
      'id', 'temperature', 'name', 'Temperature', 'type', 'single', 'required', true,
      'options', jsonb_build_array(
        jsonb_build_object('id', 'hot', 'name', 'Hot', 'price', 0),
        jsonb_build_object('id', 'cold', 'name', 'Cold', 'price', 0)
      )
    ),
    jsonb_build_object(
      'id', 'size', 'name', 'Size', 'type', 'single', 'required', true,
      'options', jsonb_build_array(
        jsonb_build_object('id', 'medium-16oz', 'name', 'Medium 16 oz', 'price', 0),
        jsonb_build_object('id', 'large-22oz', 'name', 'Large 22 oz', 'price', 10)
      )
    )
  ),
  true,
  menu.sort_order
from menu
cross join public.product_subcategories as subcategory
where subcategory.category_name = 'Drinks' and subcategory.name = 'Coffee'
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
