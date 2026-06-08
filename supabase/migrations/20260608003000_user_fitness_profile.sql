create table if not exists public.user_fitness_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  height_cm numeric,
  training_experience text,
  primary_goal text,
  secondary_goal text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_fitness_profiles_training_experience_check
    check (
      training_experience is null
      or training_experience in ('beginner', 'intermediate', 'advanced')
    ),
  constraint user_fitness_profiles_primary_goal_check
    check (
      primary_goal is null
      or primary_goal in (
        'fat_loss',
        'hypertrophy',
        'strength',
        'body_make',
        'health',
        'contest',
        'maintenance'
      )
    ),
  constraint user_fitness_profiles_secondary_goal_check
    check (
      secondary_goal is null
      or secondary_goal in (
        'fat_loss',
        'hypertrophy',
        'strength',
        'body_make',
        'health',
        'contest',
        'maintenance'
      )
    )
);

create table if not exists public.body_measurements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  measured_at date not null default current_date,
  weight_kg numeric,
  body_fat_percent numeric,
  skeletal_muscle_mass_kg numeric,
  skeletal_muscle_rate_percent numeric,
  muscle_mass_kg numeric,
  measurement_device text,
  memo text,
  created_at timestamptz not null default now(),
  constraint body_measurements_measurement_device_check
    check (
      measurement_device is null
      or measurement_device in ('inbody', 'tanita', 'other', 'unknown')
    )
);

create index if not exists body_measurements_user_measured_idx
  on public.body_measurements(user_id, measured_at desc, created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_user_fitness_profiles_updated_at on public.user_fitness_profiles;

create trigger set_user_fitness_profiles_updated_at
  before update on public.user_fitness_profiles
  for each row execute procedure public.set_updated_at();

alter table public.user_fitness_profiles enable row level security;
alter table public.body_measurements enable row level security;

drop policy if exists "user_fitness_profiles_select_own" on public.user_fitness_profiles;
drop policy if exists "user_fitness_profiles_insert_own" on public.user_fitness_profiles;
drop policy if exists "user_fitness_profiles_update_own" on public.user_fitness_profiles;
drop policy if exists "user_fitness_profiles_delete_own" on public.user_fitness_profiles;

create policy "user_fitness_profiles_select_own"
  on public.user_fitness_profiles for select
  using (auth.uid() = user_id);

create policy "user_fitness_profiles_insert_own"
  on public.user_fitness_profiles for insert
  with check (auth.uid() = user_id);

create policy "user_fitness_profiles_update_own"
  on public.user_fitness_profiles for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "user_fitness_profiles_delete_own"
  on public.user_fitness_profiles for delete
  using (auth.uid() = user_id);

drop policy if exists "body_measurements_select_own" on public.body_measurements;
drop policy if exists "body_measurements_insert_own" on public.body_measurements;
drop policy if exists "body_measurements_update_own" on public.body_measurements;
drop policy if exists "body_measurements_delete_own" on public.body_measurements;

create policy "body_measurements_select_own"
  on public.body_measurements for select
  using (auth.uid() = user_id);

create policy "body_measurements_insert_own"
  on public.body_measurements for insert
  with check (auth.uid() = user_id);

create policy "body_measurements_update_own"
  on public.body_measurements for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "body_measurements_delete_own"
  on public.body_measurements for delete
  using (auth.uid() = user_id);

grant usage on schema public to authenticated;
grant select, insert, update, delete on table public.user_fitness_profiles to authenticated;
grant select, insert, update, delete on table public.body_measurements to authenticated;
