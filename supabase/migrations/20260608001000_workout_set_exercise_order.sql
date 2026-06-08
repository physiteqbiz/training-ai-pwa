alter table public.workout_sets
  add column if not exists exercise_order integer not null default 0;

create index if not exists workout_sets_session_exercise_order_idx
  on public.workout_sets(session_id, exercise_order, set_order);
