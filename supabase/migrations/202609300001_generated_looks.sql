-- 追加意図: 匿名モデルのAI着用イメージをユーザー単位で記録し、非公開Storageへ安全に保存する。処理日時: 2026-09-30 JST

create table if not exists public.generated_looks (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  item_ids text[] not null default '{}',
  conditions jsonb not null default '{}'::jsonb,
  image_path text,
  status text not null default 'pending' check (status in ('pending', 'ready', 'failed')),
  model text not null,
  error_code text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists generated_looks_user_created_idx
  on public.generated_looks (user_id, created_at desc);

alter table public.generated_looks enable row level security;

create policy "generated_looks_select_own" on public.generated_looks
  for select using (auth.uid() = user_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('generated-looks', 'generated-looks', false, 10485760, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "generated_look_images_select_own" on storage.objects for select
using (bucket_id = 'generated-looks' and (storage.foldername(name))[1] = auth.uid()::text);
