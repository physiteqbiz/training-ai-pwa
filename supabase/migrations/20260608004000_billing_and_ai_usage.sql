alter table public.profiles
  add column if not exists stripe_customer_id text,
  add column if not exists plan text not null default 'free',
  add column if not exists subscription_status text,
  add column if not exists stripe_subscription_id text,
  add column if not exists current_period_end timestamptz,
  add column if not exists ai_quota_monthly integer not null default 3,
  add column if not exists ai_quota_used integer not null default 0,
  add column if not exists ai_quota_period text;

alter table public.profiles
  drop constraint if exists profiles_plan_check;

alter table public.profiles
  add constraint profiles_plan_check
  check (plan in ('free', 'pro'));

alter table public.profiles
  drop constraint if exists profiles_ai_quota_monthly_check;

alter table public.profiles
  add constraint profiles_ai_quota_monthly_check
  check (ai_quota_monthly >= 0);

alter table public.profiles
  drop constraint if exists profiles_ai_quota_used_check;

alter table public.profiles
  add constraint profiles_ai_quota_used_check
  check (ai_quota_used >= 0);

alter table public.profiles
  drop constraint if exists profiles_ai_quota_period_check;

alter table public.profiles
  add constraint profiles_ai_quota_period_check
  check (ai_quota_period is null or ai_quota_period ~ '^[0-9]{4}-[0-9]{2}$');

update public.profiles
set
  plan = coalesce(plan, 'free'),
  ai_quota_monthly = case
    when plan = 'pro' and subscription_status in ('active', 'trialing') then 30
    else 3
  end,
  ai_quota_used = coalesce(ai_quota_used, 0),
  ai_quota_period = coalesce(ai_quota_period, to_char(now() at time zone 'Asia/Tokyo', 'YYYY-MM'));

create table if not exists public.ai_usage_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid references public.workout_sessions(id) on delete set null,
  usage_type text not null default 'ai_report',
  plan text,
  period text not null,
  created_at timestamptz not null default now(),
  constraint ai_usage_logs_plan_check
    check (plan is null or plan in ('free', 'pro')),
  constraint ai_usage_logs_period_check
    check (period ~ '^[0-9]{4}-[0-9]{2}$')
);

create index if not exists profiles_stripe_customer_id_idx
  on public.profiles(stripe_customer_id);

create index if not exists ai_usage_logs_user_created_idx
  on public.ai_usage_logs(user_id, created_at desc);

create index if not exists ai_usage_logs_user_period_idx
  on public.ai_usage_logs(user_id, period, created_at desc);

alter table public.ai_usage_logs enable row level security;

drop policy if exists "ai_usage_logs_select_own" on public.ai_usage_logs;

create policy "ai_usage_logs_select_own"
  on public.ai_usage_logs for select
  using (auth.uid() = user_id);

revoke insert, update, delete on table public.profiles from authenticated;
grant select on table public.profiles to authenticated;

grant select on table public.ai_usage_logs to authenticated;
revoke insert, update, delete on table public.ai_usage_logs from authenticated;

create or replace function public.record_ai_usage(
  p_user_id uuid,
  p_session_id uuid default null,
  p_usage_type text default 'ai_report',
  p_period text default null,
  p_plan text default 'free',
  p_ai_quota_monthly integer default 3
)
returns table (
  plan text,
  ai_quota_used integer,
  ai_quota_monthly integer,
  ai_quota_period text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_period text := coalesce(p_period, to_char(now() at time zone 'Asia/Tokyo', 'YYYY-MM'));
  v_plan text := case when p_plan = 'pro' then 'pro' else 'free' end;
  v_monthly integer := case when p_plan = 'pro' then 30 else 3 end;
  v_used integer;
begin
  if p_ai_quota_monthly is not null and p_ai_quota_monthly > 0 then
    v_monthly := p_ai_quota_monthly;
  end if;

  perform 1
  from public.profiles
  where id = p_user_id
  for update;

  if not found then
    raise exception 'profile_not_found';
  end if;

  update public.profiles
  set
    ai_quota_period = v_period,
    ai_quota_monthly = v_monthly,
    ai_quota_used = case
      when ai_quota_period is distinct from v_period then 0
      else ai_quota_used
    end
  where id = p_user_id
  returning public.profiles.ai_quota_used
  into v_used;

  if v_used >= v_monthly then
    raise exception 'ai_quota_exceeded';
  end if;

  update public.profiles
  set ai_quota_used = ai_quota_used + 1
  where id = p_user_id
  returning public.profiles.ai_quota_used,
    public.profiles.ai_quota_monthly,
    public.profiles.ai_quota_period
  into ai_quota_used, ai_quota_monthly, ai_quota_period;

  insert into public.ai_usage_logs (user_id, session_id, usage_type, plan, period)
  values (p_user_id, p_session_id, coalesce(nullif(p_usage_type, ''), 'ai_report'), v_plan, v_period);

  plan := v_plan;
  return next;
end;
$$;

revoke all on function public.record_ai_usage(uuid, uuid, text, text, text, integer) from public;
grant execute on function public.record_ai_usage(uuid, uuid, text, text, text, integer) to service_role;
