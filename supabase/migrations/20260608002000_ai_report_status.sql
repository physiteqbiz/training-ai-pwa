alter table public.workout_sessions
  add column if not exists ai_report_status text not null default 'not_generated';

alter table public.workout_sessions
  drop constraint if exists workout_sessions_ai_report_status_check;

alter table public.workout_sessions
  add constraint workout_sessions_ai_report_status_check
  check (ai_report_status in ('not_generated', 'generated', 'stale'));

update public.workout_sessions ws
set ai_report_status = 'generated'
where exists (
  select 1
  from public.ai_reports ar
  where ar.session_id = ws.id
);
