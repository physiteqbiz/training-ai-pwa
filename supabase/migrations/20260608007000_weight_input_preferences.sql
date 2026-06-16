alter table public.user_fitness_profiles
  add column if not exists weight_unit text not null default 'kg';

alter table public.user_fitness_profiles
  add column if not exists weight_increment numeric not null default 2.5;

update public.user_fitness_profiles
set
  weight_unit = coalesce(weight_unit, 'kg'),
  weight_increment = coalesce(weight_increment, 2.5);

alter table public.user_fitness_profiles
  drop constraint if exists user_fitness_profiles_weight_unit_check;

alter table public.user_fitness_profiles
  add constraint user_fitness_profiles_weight_unit_check
  check (weight_unit in ('kg', 'lb'));

alter table public.user_fitness_profiles
  drop constraint if exists user_fitness_profiles_weight_increment_check;

alter table public.user_fitness_profiles
  add constraint user_fitness_profiles_weight_increment_check
  check (weight_increment in (1, 1.25, 2.5, 5));

grant select, insert, update, delete on table public.user_fitness_profiles to authenticated;
