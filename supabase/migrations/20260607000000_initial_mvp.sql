create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  plan text not null default 'free',
  created_at timestamptz not null default now()
);

create table if not exists public.workout_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_date date not null,
  title text,
  memo text,
  created_at timestamptz not null default now()
);

create table if not exists public.workout_sets (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.workout_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  exercise_name text not null,
  weight numeric not null,
  reps integer not null,
  set_order integer not null,
  created_at timestamptz not null default now()
);

create table if not exists public.ai_reports (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.workout_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  summary text,
  comparison text,
  good_points text,
  cautions text,
  next_workout text,
  raw_json jsonb,
  created_at timestamptz not null default now(),
  constraint ai_reports_session_id_key unique (session_id)
);

create index if not exists workout_sessions_user_date_idx
  on public.workout_sessions(user_id, session_date desc, created_at desc);

create index if not exists workout_sets_user_exercise_created_idx
  on public.workout_sets(user_id, exercise_name, created_at desc);

create index if not exists workout_sets_session_order_idx
  on public.workout_sets(session_id, set_order);

create index if not exists ai_reports_user_created_idx
  on public.ai_reports(user_id, created_at desc);

alter table public.profiles enable row level security;
alter table public.workout_sessions enable row level security;
alter table public.workout_sets enable row level security;
alter table public.ai_reports enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
drop policy if exists "profiles_insert_own" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;
drop policy if exists "profiles_delete_own" on public.profiles;

create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = id);

create policy "profiles_insert_own"
  on public.profiles for insert
  with check (auth.uid() = id);

create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

create policy "profiles_delete_own"
  on public.profiles for delete
  using (auth.uid() = id);

drop policy if exists "workout_sessions_select_own" on public.workout_sessions;
drop policy if exists "workout_sessions_insert_own" on public.workout_sessions;
drop policy if exists "workout_sessions_update_own" on public.workout_sessions;
drop policy if exists "workout_sessions_delete_own" on public.workout_sessions;

create policy "workout_sessions_select_own"
  on public.workout_sessions for select
  using (auth.uid() = user_id);

create policy "workout_sessions_insert_own"
  on public.workout_sessions for insert
  with check (auth.uid() = user_id);

create policy "workout_sessions_update_own"
  on public.workout_sessions for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "workout_sessions_delete_own"
  on public.workout_sessions for delete
  using (auth.uid() = user_id);

drop policy if exists "workout_sets_select_own" on public.workout_sets;
drop policy if exists "workout_sets_insert_own" on public.workout_sets;
drop policy if exists "workout_sets_update_own" on public.workout_sets;
drop policy if exists "workout_sets_delete_own" on public.workout_sets;

create policy "workout_sets_select_own"
  on public.workout_sets for select
  using (auth.uid() = user_id);

create policy "workout_sets_insert_own"
  on public.workout_sets for insert
  with check (auth.uid() = user_id);

create policy "workout_sets_update_own"
  on public.workout_sets for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "workout_sets_delete_own"
  on public.workout_sets for delete
  using (auth.uid() = user_id);

drop policy if exists "ai_reports_select_own" on public.ai_reports;
drop policy if exists "ai_reports_insert_own" on public.ai_reports;
drop policy if exists "ai_reports_update_own" on public.ai_reports;
drop policy if exists "ai_reports_delete_own" on public.ai_reports;

create policy "ai_reports_select_own"
  on public.ai_reports for select
  using (auth.uid() = user_id);

create policy "ai_reports_insert_own"
  on public.ai_reports for insert
  with check (auth.uid() = user_id);

create policy "ai_reports_update_own"
  on public.ai_reports for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "ai_reports_delete_own"
  on public.ai_reports for delete
  using (auth.uid() = user_id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, plan)
  values (new.id, new.email, 'free')
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
