import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

let db
const alice = '11111111-1111-4111-8111-111111111111'
const bob = '22222222-2222-4222-8222-222222222222'
const admin = '33333333-3333-4333-8333-333333333333'
const pickup = { full_name: 'Test Customer', contact: '09171234567', fulfillment: 'pickup', address_line: 'Stale address', barangay: 'Barangay 1', city: 'Caloocan City' }
const delivery = { ...pickup, fulfillment: 'delivery', address_line: '12 Test Street', barangay: 'Barangay 176-A' }
const lines = [{ product_id: 'iced-latte', quantity: 2, unit_price: 1 }]
async function asUser(user, role = 'authenticated') {
  await db.exec('reset role')
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [user || ''])
  await db.exec(`set role ${role}`)
}
async function order(details, items = lines, request = crypto.randomUUID()) {
  const { rows } = await db.query('select public.place_order($1::uuid,$2::jsonb,$3::jsonb) as result', [request, JSON.stringify(details), JSON.stringify(items)])
  return rows[0].result
}
before(async () => {
  db = new PGlite()
  // A minimal stand-in for Supabase Auth; application schema/policies run unchanged.
  await db.exec(`create role anon; create role authenticated; create schema auth;
    create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb default '{}'::jsonb);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
    grant usage on schema public,auth to anon,authenticated;
    grant execute on function auth.uid() to anon,authenticated;`)
  await db.exec(await readFile(new URL('../supabase/schema.sql', import.meta.url), 'utf8'))
  await db.exec("insert into public.product_categories(name) values('Coffee')")
  await db.exec("insert into public.products(id,name,category,price) values('iced-latte','Test Latte','Coffee',145)")
  for (const [id, username] of [[alice, 'alice'], [bob, 'bob'], [admin, 'admin']]) await db.query('insert into auth.users(id,raw_user_meta_data) values($1,$2::jsonb)', [id, JSON.stringify({ username, full_name: 'Test Customer', contact: '09171234567', role: 'admin' })])
  await db.query("update public.profiles set role='admin' where id=$1", [admin])
})
after(async () => { if (db) await db.close() })

test('signup always provisions customer, ignoring user-supplied role metadata', async () => {
  await asUser(alice)
  const { rows } = await db.query('select role, username from public.profiles where id=$1', [alice])
  assert.equal(rows[0].role, 'customer')
  assert.equal(rows[0].username, 'alice')
  await assert.rejects(db.query("update public.profiles set role='admin' where id=$1", [alice]), /permission denied/)
})
test('dashboard-created auth users receive a promotable profile without customer metadata', async () => {
  const staff = '44444444-4444-4444-8444-444444444444'
  await asUser(null, 'anon')
  await db.exec('reset role')
  await db.query("insert into auth.users(id,email) values($1,'manager@dailycup.ph')", [staff])
  const { rows } = await db.query('select username,full_name,contact,role from public.profiles where id=$1', [staff])
  assert.match(rows[0].username, /^admin_[a-f0-9]{12}$/)
  assert.equal(rows[0].full_name, 'manager')
  assert.equal(rows[0].contact, '')
  assert.equal(rows[0].role, 'customer')
})
test('guests can read menu but cannot place orders or read customer orders', async () => {
  await asUser(null, 'anon')
  assert.equal((await db.query('select * from public.products')).rows.length, 1)
  await assert.rejects(order(pickup), /permission denied/)
  await assert.rejects(db.query('select * from public.orders'), /permission denied/)
})
test('server prices are authoritative and pickup discards supplied delivery address', async () => {
  await asUser(alice)
  const result = await order({ ...pickup, total: 1, delivery_fee: 999 })
  assert.equal(Number(result.subtotal), 290); assert.equal(Number(result.total), 290); assert.equal(Number(result.delivery_fee), 0)
  assert.equal(result.address_line, null); assert.equal(result.barangay, null); assert.equal(result.city, null)
})
test('delivery fee is fixed at 60 and duplicate submit returns the same order', async () => {
  await asUser(alice)
  const request = crypto.randomUUID()
  const first = await order({ ...delivery, delivery_fee: 0 }, lines, request)
  const repeat = await order(delivery, lines, request)
  assert.equal(first.id, repeat.id); assert.equal(Number(first.total), 350); assert.equal(Number(first.delivery_fee), 60)
  assert.equal(first.barangay, 'Barangay 176-A')
})
test('invalid delivery regions, phone, empty bag and unavailable products are rejected atomically', async () => {
  await asUser(alice)
  const beforeCount = (await db.query('select id from public.orders')).rows.length
  await assert.rejects(order({ ...delivery, city: 'Quezon City' }), /Caloocan/)
  await assert.rejects(order({ ...delivery, barangay: 'Barangay 999' }), /Caloocan/)
  await assert.rejects(order({ ...delivery, address_line: '' }), /address/)
  await assert.rejects(order({ ...pickup, contact: '123' }), /mobile/)
  await assert.rejects(order(pickup, []), /bag/)
  await assert.rejects(order(pickup, [{ product_id: 'missing', quantity: 1 }]), /available/)
  await assert.rejects(order(pickup, [{ product_id: 'iced-latte', quantity: 1.5 }]), /quantity/)
  await assert.rejects(order(pickup, [...lines, ...lines]), /once/)
  assert.equal((await db.query('select id from public.orders')).rows.length, beforeCount)
})
test('customers cannot read or modify another customer’s profile, orders or order lines', async () => {
  await asUser(bob)
  assert.equal((await db.query('select * from public.orders')).rows.length, 0)
  assert.equal((await db.query('select * from public.order_items')).rows.length, 0)
  assert.equal((await db.query('select * from public.profiles')).rows.length, 1)
  assert.equal((await db.query("update public.profiles set full_name='Intruder' where id=$1 returning id", [alice])).rows.length, 0)
  assert.equal((await db.query("update public.orders set status='completed' returning id")).rows.length, 0)
  await assert.rejects(db.query("update public.orders set total=1"), /permission denied/)
  await assert.rejects(db.query("insert into public.orders(customer_id) values($1)", [bob]), /permission denied/)
})
test('customers can edit their own basic profile; admins can advance order status', async () => {
  await asUser(alice)
  assert.equal((await db.query("update public.profiles set full_name='Updated Customer',contact='09991234567' where id=$1 returning full_name", [alice])).rows[0].full_name, 'Updated Customer')
  await asUser(admin)
  const target = (await db.query("select id from public.orders where fulfillment='pickup' limit 1")).rows[0]
  await db.query("select public.admin_update_order($1,'preparing','')", [target.id])
  await db.query("select public.admin_update_order($1,'ready','')", [target.id])
  await db.query("select public.admin_update_order($1,'completed','')", [target.id])
  await asUser(alice)
  assert.ok((await db.query("select * from public.orders where status='completed'")).rows.length > 0)
})

test('admin menu and shop edits become customer-visible while customer writes are blocked', async () => {
  await asUser(alice)
  assert.equal((await db.query("update public.products set price=1 where id='iced-latte' returning id")).rows.length, 0)
  assert.equal((await db.query("update public.store_settings set shop_name='Wrong' returning id")).rows.length, 0)
  await assert.rejects(db.query("insert into public.product_categories(name) values('Pastries')"), /row-level security/)
  await asUser(admin)
  await db.query("insert into public.product_categories(name) values('Pastries')")
  await db.query("insert into public.products(id,name,category,price,available) values('test-cookie','Test Cookie','Pastries',55,true)")
  await db.query("update public.products set price=150 where id='iced-latte'")
  await db.query("update public.store_settings set shop_name='Updated Shop', address='12 Test Street' where id=true")
  await db.query("insert into public.gallery_images(image_url,caption,published) values('https://example.com/shop.jpg','Our shop',true)")
  await asUser(alice)
  assert.equal((await db.query("select price from public.products where id='iced-latte'")).rows[0].price, '150.00')
  assert.equal((await db.query('select shop_name from public.store_settings')).rows[0].shop_name, 'Updated Shop')
  assert.equal((await db.query('select caption from public.gallery_images')).rows[0].caption, 'Our shop')
  await asUser(admin)
  await db.query("update public.gallery_images set published=false where caption='Our shop'")
  await asUser(alice)
  assert.equal((await db.query('select * from public.gallery_images')).rows.length, 0)
})

test('customization prices are validated and calculated by the server', async () => {
  const customizations = [{ id: 'size', name: 'Size', type: 'single', required: true, options: [{ id: 'large', name: 'Large', price: 25 }] }]
  await asUser(admin)
  await db.query("update public.products set customizations=$1::jsonb where id='iced-latte'", [JSON.stringify(customizations)])
  await asUser(bob)
  await assert.rejects(order(pickup, [{ product_id: 'iced-latte', quantity: 1 }]), /required options/)
  const result = await order(pickup, [{ product_id: 'iced-latte', quantity: 1, selections: { size: ['large'] }, unit_price: 1 }])
  assert.equal(Number(result.subtotal), 175)
  const item = (await db.query('select unit_price,customizations from public.order_items where order_id=$1', [result.id])).rows[0]
  assert.equal(Number(item.unit_price), 175); assert.equal(item.customizations[0].option, 'Large')
})

test('payment verification, cancellation cutoff and completed feedback are enforced', async () => {
  await asUser(bob)
  await assert.rejects(order({ ...pickup, payment_method: 'gcash' }, [{ product_id: 'iced-latte', quantity: 1, selections: { size: ['large'] } }]), /payment proof/)
  const cancelled = await order(pickup, [{ product_id: 'iced-latte', quantity: 1, selections: { size: ['large'] } }])
  await db.query('select public.cancel_own_order($1)', [cancelled.id])
  assert.equal((await db.query('select status from public.orders where id=$1', [cancelled.id])).rows[0].status, 'cancelled')
  const completed = await order({ ...pickup, payment_method: 'gcash', payment_reference: 'GCASH123456', payment_proof_path: `${bob}/proof.png` }, [{ product_id: 'iced-latte', quantity: 1, selections: { size: ['large'] } }])
  await asUser(admin)
  await db.query("select public.admin_update_order($1,'preparing','')", [completed.id])
  await assert.rejects(db.query("select public.admin_update_order($1,'cancelled','Item is unavailable')", [completed.id]), /before preparation/)
  await db.query("select public.admin_update_order($1,'ready','')", [completed.id])
  await db.query("select public.admin_update_order($1,'completed','')", [completed.id])
  await asUser(bob)
  await db.query('insert into public.order_feedback(order_id,customer_id,rating,comment) values($1,$2,5,$3)', [completed.id, bob, 'Great order'])
  assert.equal((await db.query('select rating from public.order_feedback where order_id=$1', [completed.id])).rows[0].rating, 5)
})

test('admins manage category hierarchy while customers can only read it', async () => {
  await asUser(alice)
  await assert.rejects(db.query("insert into public.product_subcategories(category_name,name) values('Coffee','Iced Coffee')"), /row-level security/)
  await asUser(admin)
  const { rows } = await db.query("insert into public.product_subcategories(category_name,name) values('Coffee','Iced Coffee') returning id")
  await db.query("update public.products set subcategory_id=$1 where id='iced-latte'", [rows[0].id])
  await db.query("update public.product_categories set name='Drinks' where name='Coffee'")
  assert.equal((await db.query("select category from public.products where id='iced-latte'")).rows[0].category, 'Drinks')
  assert.equal((await db.query('select category_name from public.product_subcategories where id=$1', [rows[0].id])).rows[0].category_name, 'Drinks')
  await asUser(alice)
  assert.equal((await db.query("select name from public.product_subcategories where category_name='Drinks'")).rows[0].name, 'Iced Coffee')
  assert.equal((await db.query('delete from public.product_subcategories where id=$1 returning id', [rows[0].id])).rows.length, 0)
  await asUser(admin)
  await db.query("delete from public.products where id='iced-latte'")
  assert.ok((await db.query("select * from public.order_items where name='Test Latte' and product_id is null")).rows.length > 0)
})

test('admin shop details are readable by customers and visitors', async () => {
  await asUser(admin)
  const settings = { shop_name: 'Updated Cafe', announcement: 'New hours', about_text: 'Our updated story', address: '12 Cafe Street', hours: '8 AM–8 PM', phone: '09171234567', email: 'cafe@example.com', hero_image: 'https://example.com/hero.jpg', cafe_image: 'https://example.com/shop.jpg', gcash_qr_image: 'https://example.com/qr.png' }
  const fields = Object.keys(settings)
  await db.query(`update public.store_settings set ${fields.map((field, index) => `${field}=$${index + 1}`).join(',')} where id=true`, Object.values(settings))
  for (const [user, role] of [[alice, 'authenticated'], [null, 'anon']]) {
    await asUser(user, role)
    const { rows } = await db.query(`select ${fields.join(',')} from public.store_settings where id=true`)
    assert.deepEqual(rows[0], settings)
  }
})

test('published gallery uploads are visible to visitors while hidden images stay private', async () => {
  await asUser(admin)
  await db.query("insert into public.gallery_images(image_url,caption,published,sort_order) values ('https://example.com/gallery-one.jpg','First photo',true,1), ('https://example.com/gallery-two.png','Second photo',true,2), ('https://example.com/hidden.jpg','Hidden photo',false,3)")
  await asUser(null, 'anon')
  const { rows } = await db.query('select caption from public.gallery_images order by sort_order')
  assert.deepEqual(rows.map((row) => row.caption), ['First photo', 'Second photo'])
})

test('coffee menu seeds nine drinks with hot/cold and size prices', async () => {
  await db.exec('reset role')
  const seed = await readFile(new URL('../supabase/coffee-based-menu.sql', import.meta.url), 'utf8')
  await db.exec(seed)
  await db.exec(seed)
  const { rows } = await db.query("select name, price, category, image, customizations from public.products where id like 'coffee-%' order by sort_order")
  assert.deepEqual(rows.map(({ name }) => name), [
    'Cappuccino', 'Cafe Latte', 'White Chocolate Latte', 'Butterscotch Latte',
    'Salted Caramel Latte', 'Caramel Latte', 'Chocolate Latte', 'Hazelnut Latte',
    'French Vanilla Latte',
  ])
  for (const product of rows) {
    assert.equal(product.category, 'Drinks')
    assert.equal(Number(product.price), 130)
    assert.deepEqual(product.customizations.map(({ name, required }) => [name, required]), [['Temperature', true], ['Size', true]])
  }
  assert.equal(rows.at(-1).image, '/menu/french-vanilla-latte.png')
  await asUser(alice)
  const item = (temperature, size) => [{ product_id: 'coffee-cappuccino', quantity: 1, selections: { temperature: [temperature], size: [size] } }]
  assert.equal(Number((await order(pickup, item('hot', 'medium-16oz'))).total), 130)
  assert.equal(Number((await order(pickup, item('cold', 'large-22oz'))).total), 140)
})

test('bread and pastries menu seeds seven items at the listed prices', async () => {
  await db.exec('reset role')
  const seed = await readFile(new URL('../supabase/bread-and-pastries-menu.sql', import.meta.url), 'utf8')
  await db.exec(seed)
  await db.exec(seed)
  const { rows } = await db.query("select name, price, category, image from public.products where id like 'pastry-%' order by sort_order")
  assert.deepEqual(rows.map(({ name, price }) => [name, Number(price)]), [
    ['Ensay Mada', 100], ['Croissant', 120], ['Banana Loaf', 120],
    ['Brownies', 140], ['Muffin', 110], ['Cinnamon Roll', 120], ['Donuts', 180],
  ])
  assert.ok(rows.every(({ category }) => category === 'Foods'))
  assert.equal(rows.find(({ name }) => name === 'Croissant').image, '/menu/croissant.jpg')
  assert.ok(rows.every(({ image }) => image.startsWith('/menu/')))
  await asUser(alice)
  assert.equal(Number((await order(pickup, [{ product_id: 'pastry-brownies', quantity: 1 }])).total), 140)
})

test('combined menu script safely updates coffee and pastries together', async () => {
  await db.exec('reset role')
  const seed = await readFile(new URL('../supabase/coffee-and-pastries-menu.sql', import.meta.url), 'utf8')
  await db.exec(seed)
  await db.exec(seed)
  const { rows } = await db.query("select category, count(*)::int as total from public.products where id like 'coffee-%' or id like 'pastry-%' group by category order by category")
  assert.deepEqual(rows, [{ category: 'Drinks', total: 9 }, { category: 'Foods', total: 7 }])
})
