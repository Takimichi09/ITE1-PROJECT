# Daily Cup — ITE1 Coffee Shop

React and Vite storefront plus admin workspace configured for the supplied Supabase project. The menu, accounts, profiles, orders, shop details, and gallery use Supabase once its database schema is installed. There is no demo account, local order store, or sample product fallback.

## Run locally

```sh
npm install
npm run dev
```

The project URL and publishable key are in `.env.local` (ignored by Git). For another environment, copy `.env.example` and set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. Use only a publishable key in browser code.

## Finish setup in the supplied Supabase project

The project URL and publishable key cannot install tables or change Auth settings. A read-only request returned `PGRST205` for `public.products`, confirming that the schema is not installed yet. A project owner must complete these steps in the [Supabase dashboard](https://supabase.com/dashboard):

1. In **SQL Editor**, run [`supabase/schema.sql`](supabase/schema.sql) on the empty project database. Review it before running against a project with existing tables. It creates `profiles`, `product_categories`, `products`, `orders`, `order_items`, `delivery_barangays`, `store_settings`, and `gallery_images`, plus policies and the checkout function.
2. In **Authentication → Providers → Email**, leave the Email provider enabled but turn **Confirm Email** off. This is required for username-only registration. The app checks the public Auth setting before creating an account, so it will show an error instead of creating an unusable account while confirmation is on.
3. Run [`supabase/admin-auth-migration.sql`](supabase/admin-auth-migration.sql) if this project already had the schema installed. Then create staff accounts in **Authentication → Users → Add user → Create new user** using a real email address and password, with **Auto confirm user** checked. In SQL Editor, promote the exact email address:

   ```sql
   update public.profiles p
   set role = 'admin'
   from auth.users u
   where p.id = u.id and lower(u.email) = lower('admin@yourbusiness.com')
   returning u.email, p.username, p.role;
   ```

   Confirm that exactly one row was updated, then sign in at `/admin/login`. The signup trigger always starts every profile as a `customer`; only trusted SQL can promote an administrator.
4. In `/admin`, add categories and menu items, or run the coffee menu script below. Add the shop address, hours, contact details, story, and gallery photos. The base schema does not seed products or gallery images. Admins can upload product and gallery photos.

## Coffee-based menu

After the schema is installed, run [`supabase/coffee-based-menu.sql`](supabase/coffee-based-menu.sql) in the Supabase SQL Editor to publish the nine coffee-based drinks. The script is safe to rerun and creates **Drinks → Coffee** if needed. Each drink requires Hot or Cold and a size: Medium 16 oz costs ₱130; Large 22 oz costs ₱140. Seven provided photos are served from `public/menu/`. Caramel and Chocolate Latte use the menu's coffee icon until photos are supplied. The products are stored in Supabase so checkout uses the same prices shown on the storefront.

The image paths in the script refer to files served by this site. Deploy the updated site files as well as running the SQL. If you ran an older version of the script, rerun the latest version to update existing product image paths.

## Bread and pastries menu

Run [`supabase/bread-and-pastries-menu.sql`](supabase/bread-and-pastries-menu.sql) in the Supabase SQL Editor to publish Ensay Mada (₱100), Croissant (₱120), Banana Loaf (₱120), Brownies (₱140), Muffin (₱110), Cinnamon Roll (₱120), and Donuts (₱180) under **Foods → Pastry**. The script is safe to rerun. Four supplied photos are served from `public/menu/`; Ensay Mada, Muffin, and Donuts use the menu placeholder until photos are supplied. Deploy the site files so the image paths resolve.

Customers register with a username, password, full name, and Philippine mobile number. Supabase Auth requires an email or phone identifier for password accounts, so the app maps each lowercase username to an internal address under `users.dailycup.ph`. Customers never enter an email or receive an email code. The database stores the real username in `public.profiles` and keeps it unique. Passwords are managed by Supabase Auth, not stored in the application database.

**Account recovery:** Without a real email address or phone verification, customers cannot use Supabase's self-service password reset. A shop administrator would need to verify the customer's identity and handle recovery through a trusted admin process. Usernames are not editable in the profile UI.

Checkout writes orders through the `place_order` database function, which sets prices and fees on the server. Each customer can read their own profile and orders.

## Admin and customer connection

- Admin menu edits update `products` and `product_categories`. The storefront reads the same products table and refreshes when revisited or every 30 seconds while visible. Mark an item unavailable to stop new orders while retaining old order history.
- Admin order status changes update `orders`. Customer order history reads the same order rows and refreshes every 20 seconds while visible. Order items keep the name and price captured at checkout.
- Admin shop details update `store_settings`; the header, home imagery, story, contact page, and pickup address read from it. Published `gallery_images` appear on the customer gallery page.
- Admins can view customer profiles for order support. Profile and order tables are protected by row-level security; customers can see their own records only. Admin roles can be assigned only through trusted SQL or another server-side admin process.

## Verify

```sh
npm run lint
npm test
npm run build
```

After dashboard setup, create a test username, promote it to admin, add one category and product, then use a separate customer account to place an order. Change its status in `/admin` and check the customer order page. No live account was created during development.

The shop name, business information, and reference photography are still project content. Replace them with the real shop's details before accepting customer orders.
