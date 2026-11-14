-- عالم الشراء — database schema for Supabase.
-- Run once in the Supabase SQL Editor. Safe to run again.

-- 1) Private profile: only the owner can read or change it (phone, age, consent).
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  phone       text not null check (char_length(phone) between 7 and 20),
  age         int  not null check (age between 13 and 110),
  guardian    boolean not null default false,
  consent_at  timestamptz not null,
  created_at  timestamptz not null default now()
);
alter table public.profiles enable row level security;
drop policy if exists "own profile" on public.profiles;
create policy "own profile" on public.profiles
  for all to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- 2) Public avatar: everyone can see your name + avatar, nothing else.
create table if not exists public.avatars (
  id          uuid primary key references auth.users(id) on delete cascade,
  name        text not null check (char_length(name) between 2 and 40),
  avatar      jsonb not null check (octet_length(avatar::text) < 4000),
  updated_at  timestamptz not null default now()
);
alter table public.avatars enable row level security;
drop policy if exists "avatars readable" on public.avatars;
drop policy if exists "own avatar insert" on public.avatars;
drop policy if exists "own avatar update" on public.avatars;
drop policy if exists "own avatar delete" on public.avatars;
create policy "avatars readable"  on public.avatars for select to anon, authenticated using (true);
create policy "own avatar insert" on public.avatars for insert to authenticated with check (id = auth.uid());
create policy "own avatar update" on public.avatars for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy "own avatar delete" on public.avatars for delete to authenticated using (id = auth.uid());

-- 3) Plots: one owner per plot (the primary key stops two people taking the same plot).
create table if not exists public.plots (
  plot_id     int primary key check (plot_id between 0 and 9999),
  owner       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  owner_name  text check (char_length(owner_name) <= 40),
  store       jsonb check (store is null or octet_length(store::text) < 200000),
  updated_at  timestamptz not null default now()
);
alter table public.plots enable row level security;
drop policy if exists "plots readable" on public.plots;
drop policy if exists "own plot insert" on public.plots;
drop policy if exists "own plot update" on public.plots;
drop policy if exists "own plot delete" on public.plots;
create policy "plots readable"  on public.plots for select to anon, authenticated using (true);
create policy "own plot insert" on public.plots for insert to authenticated with check (owner = auth.uid());
create policy "own plot update" on public.plots for update to authenticated using (owner = auth.uid()) with check (owner = auth.uid());
create policy "own plot delete" on public.plots for delete to authenticated using (owner = auth.uid());

-- live updates: everyone sees new shops appear without reloading
do $$ begin
  alter publication supabase_realtime add table public.plots;
exception when duplicate_object then null; end $$;

-- 4) "Delete my account and all my data" (removes the user; the tables above cascade).
create or replace function public.delete_me() returns void
language sql security definer set search_path = '' as $$
  delete from auth.users where id = auth.uid();
$$;
revoke all on function public.delete_me() from public, anon;
grant execute on function public.delete_me() to authenticated;

-- 5) Shop media: product photos, logos and uploaded 3D buildings (.glb).
--    Anyone can view a file by its link; each merchant can only write inside their own folder (<user id>/...).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('shop-media', 'shop-media', true, 31457280,
        array['image/jpeg','image/png','image/webp','model/gltf-binary','application/octet-stream'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
drop policy if exists "media own read" on storage.objects;
drop policy if exists "media own insert" on storage.objects;
drop policy if exists "media own update" on storage.objects;
drop policy if exists "media own delete" on storage.objects;
-- listing is limited to your own folder (so "delete my account" can find and remove your files)
create policy "media own read" on storage.objects for select to authenticated
  using (bucket_id = 'shop-media' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "media own insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'shop-media' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "media own update" on storage.objects for update to authenticated
  using (bucket_id = 'shop-media' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "media own delete" on storage.objects for delete to authenticated
  using (bucket_id = 'shop-media' and (storage.foldername(name))[1] = auth.uid()::text);

-- 6) "Build it for me": merchants ask us to design their building (paid service).
--    Merchants see only their own requests; you see all of them in the Table Editor.
create table if not exists public.build_requests (
  id          bigint generated always as identity primary key,
  owner       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  plot_id     int  not null,
  shop_name   text check (char_length(shop_name) <= 60),
  notes       text check (char_length(notes) <= 2000),
  contact     text check (char_length(contact) <= 60),
  status      text not null default 'new',
  created_at  timestamptz not null default now()
);
alter table public.build_requests enable row level security;
drop policy if exists "own requests read" on public.build_requests;
drop policy if exists "own requests insert" on public.build_requests;
create policy "own requests read"   on public.build_requests for select to authenticated using (owner = auth.uid());
create policy "own requests insert" on public.build_requests for insert to authenticated
  with check (owner = auth.uid() and status = 'new');

-- 7) Reports about other people (abuse in chat/voice). Only you (in the dashboard) can read them.
create table if not exists public.reports (
  id          bigint generated always as identity primary key,
  reporter    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  reported    uuid not null,
  reason      text not null check (char_length(reason) <= 200),
  context     text check (char_length(context) <= 4000),
  created_at  timestamptz not null default now()
);
alter table public.reports enable row level security;
drop policy if exists "file a report" on public.reports;
create policy "file a report" on public.reports for insert to authenticated with check (reporter = auth.uid());
