-- 追加意図: 画像AIの推測値とユーザーの確定値を分けて保存し、精度検証と将来の補正に使える履歴を残す。処理日時: 2026-10-07 23:35 JST

create table if not exists public.garment_analysis_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  target_kind text not null check (target_kind in ('item', 'candidate', 'batch')),
  target_local_id text,
  model text not null,
  prompt_version text not null,
  predicted_attributes jsonb not null default '{}'::jsonb,
  field_confidences jsonb not null default '{}'::jsonb,
  image_quality jsonb not null default '{}'::jsonb,
  final_attributes jsonb,
  corrected_fields text[] not null default '{}',
  status text not null default 'predicted' check (status in ('predicted', 'confirmed', 'abandoned', 'error')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists garment_analysis_runs_user_created_idx
  on public.garment_analysis_runs (user_id, created_at desc);

create index if not exists garment_analysis_runs_user_target_idx
  on public.garment_analysis_runs (user_id, target_kind, target_local_id);

alter table public.garments
  add column if not exists subcategory text not null default '',
  add column if not exists secondary_colors text[] not null default '{}';

alter table public.garment_analysis_runs enable row level security;

drop policy if exists "garment_analysis_select_own" on public.garment_analysis_runs;
create policy "garment_analysis_select_own"
  on public.garment_analysis_runs for select
  using (auth.uid() = user_id);

drop policy if exists "garment_analysis_insert_own" on public.garment_analysis_runs;
create policy "garment_analysis_insert_own"
  on public.garment_analysis_runs for insert
  with check (auth.uid() = user_id);

drop policy if exists "garment_analysis_update_own" on public.garment_analysis_runs;
create policy "garment_analysis_update_own"
  on public.garment_analysis_runs for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
