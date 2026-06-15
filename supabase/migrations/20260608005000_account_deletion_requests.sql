create extension if not exists "pgcrypto";

create table if not exists public.account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  email text,
  reason text,
  status text not null default 'requested',
  requested_at timestamptz not null default now(),
  processed_at timestamptz,
  constraint account_deletion_requests_status_check
    check (status in ('requested', 'processing', 'completed', 'rejected'))
);

create index if not exists account_deletion_requests_user_requested_idx
  on public.account_deletion_requests(user_id, requested_at desc);

create index if not exists account_deletion_requests_status_idx
  on public.account_deletion_requests(status, requested_at desc);

alter table public.account_deletion_requests enable row level security;

drop policy if exists "account_deletion_requests_select_own"
  on public.account_deletion_requests;
drop policy if exists "account_deletion_requests_insert_own"
  on public.account_deletion_requests;

create policy "account_deletion_requests_select_own"
  on public.account_deletion_requests for select
  using (auth.uid() = user_id);

create policy "account_deletion_requests_insert_own"
  on public.account_deletion_requests for insert
  with check (auth.uid() = user_id);

grant usage on schema public to service_role;
grant select, insert, update, delete
  on table public.account_deletion_requests
  to service_role;

grant select, insert
  on table public.account_deletion_requests
  to authenticated;
revoke update, delete on table public.account_deletion_requests from authenticated;
