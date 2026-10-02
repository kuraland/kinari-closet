-- 追加意図: 実物のみモードをスマホとPCで同じ状態に保つ設定列を追加。処理日時: 2026-10-01 22:48 JST

alter table public.user_settings
  add column if not exists actual_only boolean not null default true;
