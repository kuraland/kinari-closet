-- 追加意図: KINARIの服・写真・評価・好み設定をユーザー単位で安全に同期する初期DBを構築。処理日時: 2026-09-29 JST

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.garments (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  name text not null check (char_length(name) between 1 and 120),
  category text not null check (category in ('tops', 'bottoms', 'onepiece', 'outer', 'shoes', 'accessory')),
  color text not null,
  season text not null check (season in ('all', 'spring', 'summer', 'autumn', 'winter')),
  warmth smallint not null check (warmth between 1 and 5),
  formality smallint not null check (formality between 1 and 5),
  pattern text not null default 'solid',
  material text not null default 'other',
  silhouette text not null default 'regular',
  style text not null default 'casual',
  statement smallint not null default 2 check (statement between 1 and 5),
  status text not null default 'ready' check (status in ('ready', 'laundry', 'cleaning', 'archived')),
  notes text not null default '' check (char_length(notes) <= 2000),
  photo_path text,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  last_worn_at timestamptz,
  archived_at timestamptz,
  restored_at timestamptz,
  primary key (user_id, id)
);

create index if not exists garments_user_updated_idx on public.garments (user_id, updated_at desc);
create index if not exists garments_user_status_idx on public.garments (user_id, status);

create table if not exists public.feedback (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  type text not null check (type in ('like', 'dislike', 'worn')),
  item_ids text[] not null default '{}',
  conditions jsonb not null default '{}'::jsonb,
  created_at timestamptz not null,
  primary key (user_id, id)
);

create index if not exists feedback_user_created_idx on public.feedback (user_id, created_at desc);

create table if not exists public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  preference_balance smallint not null default 67 check (preference_balance between 0 and 100),
  avoid_recent boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.trend_snapshots (
  id bigint generated always as identity primary key,
  season text not null,
  source_label text not null,
  source_url text not null,
  payload jsonb not null,
  collected_at timestamptz not null default now(),
  valid_until date
);

alter table public.profiles enable row level security;
alter table public.garments enable row level security;
alter table public.feedback enable row level security;
alter table public.user_settings enable row level security;
alter table public.trend_snapshots enable row level security;

create policy "profiles_select_own" on public.profiles for select using (auth.uid() = user_id);
create policy "profiles_update_own" on public.profiles for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "garments_select_own" on public.garments for select using (auth.uid() = user_id);
create policy "garments_insert_own" on public.garments for insert with check (auth.uid() = user_id);
create policy "garments_update_own" on public.garments for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "garments_delete_own" on public.garments for delete using (auth.uid() = user_id);
create policy "feedback_select_own" on public.feedback for select using (auth.uid() = user_id);
create policy "feedback_insert_own" on public.feedback for insert with check (auth.uid() = user_id);
create policy "feedback_update_own" on public.feedback for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "settings_select_own" on public.user_settings for select using (auth.uid() = user_id);
create policy "settings_insert_own" on public.user_settings for insert with check (auth.uid() = user_id);
create policy "settings_update_own" on public.user_settings for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "trends_read_authenticated" on public.trend_snapshots for select using (auth.role() = 'authenticated');

create or replace function public.create_profile_for_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (user_id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)))
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.create_profile_for_new_user();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('garment-images', 'garment-images', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "garment_images_select_own" on storage.objects for select
using (bucket_id = 'garment-images' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "garment_images_insert_own" on storage.objects for insert
with check (bucket_id = 'garment-images' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "garment_images_update_own" on storage.objects for update
using (bucket_id = 'garment-images' and (storage.foldername(name))[1] = auth.uid()::text)
with check (bucket_id = 'garment-images' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "garment_images_delete_own" on storage.objects for delete
using (bucket_id = 'garment-images' and (storage.foldername(name))[1] = auth.uid()::text);
