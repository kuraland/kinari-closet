-- 追加意図: Claudeで定期分析した好みプロフィールを再利用し、毎回の長い履歴送信とAPI費用を抑える。処理日時: 2026-10-03 19:08 JST
create table if not exists public.ai_preference_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  profile jsonb not null default '{}'::jsonb,
  feedback_count integer not null default 0 check (feedback_count >= 0),
  model text,
  updated_at timestamptz not null default now()
);

alter table public.ai_preference_profiles enable row level security;

drop policy if exists "Users can read own AI preference profile" on public.ai_preference_profiles;
create policy "Users can read own AI preference profile"
on public.ai_preference_profiles for select
using (auth.uid() = user_id);

