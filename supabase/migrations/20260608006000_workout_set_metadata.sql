alter table public.workout_sets
  add column if not exists set_type text not null default 'normal',
  add column if not exists is_assisted boolean not null default false,
  add column if not exists set_memo text;

alter table public.workout_sets
  drop constraint if exists workout_sets_set_type_check;

alter table public.workout_sets
  add constraint workout_sets_set_type_check
  check (set_type in ('normal', 'warmup', 'main', 'backoff', 'drop'));
