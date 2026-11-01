-- Private images: path prefix is the authenticated uploader's UUID.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('dog-images','dog-images',false,5242880,array['image/jpeg','image/png','image/webp']) on conflict(id) do nothing;
create policy dog_image_upload on storage.objects for insert to authenticated with check(bucket_id='dog-images' and (storage.foldername(name))[1]=auth.uid()::text and public.current_role()='owner');
create policy dog_image_read on storage.objects for select to authenticated using(bucket_id='dog-images' and public.is_active() and ((storage.foldername(name))[1]=auth.uid()::text or public.is_admin()));
create policy dog_image_delete on storage.objects for delete to authenticated using(bucket_id='dog-images' and (storage.foldername(name))[1]=auth.uid()::text and public.is_active());
