insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values
('shop-assets','shop-assets',true,5242880,array['image/jpeg','image/png','image/webp']),
('payment-proofs','payment-proofs',false,5242880,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
create policy "Public shop assets" on storage.objects for select to public using(bucket_id='shop-assets');
create policy "Admins manage shop assets" on storage.objects for all to authenticated using(bucket_id='shop-assets' and public.is_admin()) with check(bucket_id='shop-assets' and public.is_admin());
create policy "Customers upload payment proofs" on storage.objects for insert to authenticated with check(bucket_id='payment-proofs' and (storage.foldername(name))[1]=auth.uid()::text);
create policy "Owners and admins read payment proofs" on storage.objects for select to authenticated using(bucket_id='payment-proofs' and ((storage.foldername(name))[1]=auth.uid()::text or public.is_admin()));
