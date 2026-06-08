create table if not exists public.exercise_categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  category_id uuid not null references public.exercise_categories(id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists exercise_categories_visible_idx
  on public.exercise_categories(is_default, user_id, sort_order);

create index if not exists exercises_visible_category_idx
  on public.exercises(category_id, is_default, user_id, sort_order);

alter table public.exercise_categories enable row level security;
alter table public.exercises enable row level security;

grant usage on schema public to authenticated;
grant select, insert, update, delete on table public.exercise_categories to authenticated;
grant select, insert, update, delete on table public.exercises to authenticated;

drop policy if exists "exercise_categories_select_visible" on public.exercise_categories;
drop policy if exists "exercise_categories_insert_own" on public.exercise_categories;
drop policy if exists "exercise_categories_update_own" on public.exercise_categories;
drop policy if exists "exercise_categories_delete_own" on public.exercise_categories;

create policy "exercise_categories_select_visible"
  on public.exercise_categories for select
  using (is_default = true or auth.uid() = user_id);

create policy "exercise_categories_insert_own"
  on public.exercise_categories for insert
  with check (auth.uid() = user_id and is_default = false);

create policy "exercise_categories_update_own"
  on public.exercise_categories for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id and is_default = false);

create policy "exercise_categories_delete_own"
  on public.exercise_categories for delete
  using (auth.uid() = user_id and is_default = false);

drop policy if exists "exercises_select_visible" on public.exercises;
drop policy if exists "exercises_insert_own" on public.exercises;
drop policy if exists "exercises_update_own" on public.exercises;
drop policy if exists "exercises_delete_own" on public.exercises;

create policy "exercises_select_visible"
  on public.exercises for select
  using (is_default = true or auth.uid() = user_id);

create policy "exercises_insert_own"
  on public.exercises for insert
  with check (auth.uid() = user_id and is_default = false);

create policy "exercises_update_own"
  on public.exercises for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id and is_default = false);

create policy "exercises_delete_own"
  on public.exercises for delete
  using (auth.uid() = user_id and is_default = false);

insert into public.exercise_categories (id, name, sort_order, is_default)
values
  ('10000000-0000-4000-8000-000000000001', '胸', 10, true),
  ('10000000-0000-4000-8000-000000000002', '背中', 20, true),
  ('10000000-0000-4000-8000-000000000003', '脚', 30, true),
  ('10000000-0000-4000-8000-000000000004', '肩', 40, true),
  ('10000000-0000-4000-8000-000000000005', '腕', 50, true),
  ('10000000-0000-4000-8000-000000000006', '腹', 60, true),
  ('10000000-0000-4000-8000-000000000007', '有酸素', 70, true),
  ('10000000-0000-4000-8000-000000000008', 'その他', 80, true)
on conflict (id) do update
set name = excluded.name,
    sort_order = excluded.sort_order,
    is_default = excluded.is_default;

insert into public.exercises (id, category_id, name, sort_order, is_default)
values
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'ベンチプレス', 10, true),
  ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 'インクラインベンチプレス', 20, true),
  ('20000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', 'ダンベルプレス', 30, true),
  ('20000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000001', 'インクラインダンベルプレス', 40, true),
  ('20000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000001', 'チェストプレス', 50, true),
  ('20000000-0000-4000-8000-000000000006', '10000000-0000-4000-8000-000000000001', 'ペックフライ', 60, true),
  ('20000000-0000-4000-8000-000000000007', '10000000-0000-4000-8000-000000000001', 'ケーブルフライ', 70, true),
  ('20000000-0000-4000-8000-000000000008', '10000000-0000-4000-8000-000000000001', 'ディップス', 80, true),
  ('20000000-0000-4000-8000-000000000009', '10000000-0000-4000-8000-000000000002', 'ラットプルダウン', 10, true),
  ('20000000-0000-4000-8000-000000000010', '10000000-0000-4000-8000-000000000002', 'チンニング', 20, true),
  ('20000000-0000-4000-8000-000000000011', '10000000-0000-4000-8000-000000000002', 'ベントオーバーロウ', 30, true),
  ('20000000-0000-4000-8000-000000000012', '10000000-0000-4000-8000-000000000002', 'シーテッドロウ', 40, true),
  ('20000000-0000-4000-8000-000000000013', '10000000-0000-4000-8000-000000000002', 'ワンハンドロウ', 50, true),
  ('20000000-0000-4000-8000-000000000014', '10000000-0000-4000-8000-000000000002', 'デッドリフト', 60, true),
  ('20000000-0000-4000-8000-000000000015', '10000000-0000-4000-8000-000000000003', 'スクワット', 10, true),
  ('20000000-0000-4000-8000-000000000016', '10000000-0000-4000-8000-000000000003', 'フルスクワット', 20, true),
  ('20000000-0000-4000-8000-000000000017', '10000000-0000-4000-8000-000000000003', 'レッグプレス', 30, true),
  ('20000000-0000-4000-8000-000000000018', '10000000-0000-4000-8000-000000000003', 'ハックスクワット', 40, true),
  ('20000000-0000-4000-8000-000000000019', '10000000-0000-4000-8000-000000000003', 'レッグエクステンション', 50, true),
  ('20000000-0000-4000-8000-000000000020', '10000000-0000-4000-8000-000000000003', 'レッグカール', 60, true),
  ('20000000-0000-4000-8000-000000000021', '10000000-0000-4000-8000-000000000003', 'カーフレイズ', 70, true),
  ('20000000-0000-4000-8000-000000000022', '10000000-0000-4000-8000-000000000004', 'ミリタリープレス', 10, true),
  ('20000000-0000-4000-8000-000000000023', '10000000-0000-4000-8000-000000000004', 'ショルダープレス', 20, true),
  ('20000000-0000-4000-8000-000000000024', '10000000-0000-4000-8000-000000000004', 'サイドレイズ', 30, true),
  ('20000000-0000-4000-8000-000000000025', '10000000-0000-4000-8000-000000000004', 'リアレイズ', 40, true),
  ('20000000-0000-4000-8000-000000000026', '10000000-0000-4000-8000-000000000004', 'フロントレイズ', 50, true),
  ('20000000-0000-4000-8000-000000000027', '10000000-0000-4000-8000-000000000004', 'フェイスプル', 60, true),
  ('20000000-0000-4000-8000-000000000028', '10000000-0000-4000-8000-000000000005', 'バーベルカール', 10, true),
  ('20000000-0000-4000-8000-000000000029', '10000000-0000-4000-8000-000000000005', 'ダンベルカール', 20, true),
  ('20000000-0000-4000-8000-000000000030', '10000000-0000-4000-8000-000000000005', 'ケーブルカール', 30, true),
  ('20000000-0000-4000-8000-000000000031', '10000000-0000-4000-8000-000000000005', 'トライセプスプレスダウン', 40, true),
  ('20000000-0000-4000-8000-000000000032', '10000000-0000-4000-8000-000000000005', 'スカルクラッシャー', 50, true),
  ('20000000-0000-4000-8000-000000000033', '10000000-0000-4000-8000-000000000005', 'ナローベンチプレス', 60, true),
  ('20000000-0000-4000-8000-000000000034', '10000000-0000-4000-8000-000000000006', 'クランチ', 10, true),
  ('20000000-0000-4000-8000-000000000035', '10000000-0000-4000-8000-000000000006', 'レッグレイズ', 20, true),
  ('20000000-0000-4000-8000-000000000036', '10000000-0000-4000-8000-000000000006', 'アブローラー', 30, true),
  ('20000000-0000-4000-8000-000000000037', '10000000-0000-4000-8000-000000000006', 'プランク', 40, true),
  ('20000000-0000-4000-8000-000000000038', '10000000-0000-4000-8000-000000000007', 'ランニング', 10, true),
  ('20000000-0000-4000-8000-000000000039', '10000000-0000-4000-8000-000000000007', 'バイク', 20, true),
  ('20000000-0000-4000-8000-000000000040', '10000000-0000-4000-8000-000000000007', 'クロストレーナー', 30, true),
  ('20000000-0000-4000-8000-000000000041', '10000000-0000-4000-8000-000000000007', 'ウォーキング', 40, true),
  ('20000000-0000-4000-8000-000000000042', '10000000-0000-4000-8000-000000000008', 'その他', 10, true)
on conflict (id) do update
set category_id = excluded.category_id,
    name = excluded.name,
    sort_order = excluded.sort_order,
    is_default = excluded.is_default;
