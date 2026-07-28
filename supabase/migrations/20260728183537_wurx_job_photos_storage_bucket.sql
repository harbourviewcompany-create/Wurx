-- Storage bucket for booking_photos.storage_path, per the market-leading
-- migration handoff. Private bucket; objects are expected at
-- <booking_id>/<filename>, and RLS mirrors the booking_photos table policy
-- exactly (customer, assigned provider, or admin).

insert into storage.buckets (id, name, public)
values ('job-photos', 'job-photos', false)
on conflict (id) do nothing;

drop policy if exists job_photos_select on storage.objects;
create policy job_photos_select on storage.objects
  for select to authenticated using (
    bucket_id = 'job-photos'
    and (
      (storage.foldername(name))[1]::uuid in (
        select id from public.bookings
        where user_id = (select auth.uid())
           or provider_id in (select id from public.providers where user_id = (select auth.uid()))
      )
      or exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'admin')
    )
  );

drop policy if exists job_photos_insert on storage.objects;
create policy job_photos_insert on storage.objects
  for insert to authenticated with check (
    bucket_id = 'job-photos'
    and (storage.foldername(name))[1]::uuid in (
      select b.id from public.bookings b
      left join public.providers p on p.id = b.provider_id
      where b.user_id = (select auth.uid()) or p.user_id = (select auth.uid())
    )
  );
