-- Jobseeker candidate-safe RPC surface hardening.
--
-- Public browser entrypoints remain callable by authenticated users, but the
-- implementation helpers in ho_private / hc_private must not be directly
-- executable from a browser role. The public wrappers run as SECURITY DEFINER
-- and the inner helpers continue to enforce the current Clerk/JWT identity.

create or replace function public.hc_mark_notification_read(p_notification_id uuid)
returns boolean
language sql
security definer
set search_path = 'public', 'ho_private', 'pg_temp'
as $$
  select ho_private.hc_mark_notification_read_impl(p_notification_id);
$$;

create or replace function public.hc_mark_all_notifications_read()
returns integer
language sql
security definer
set search_path = 'public', 'ho_private', 'pg_temp'
as $$
  select ho_private.hc_mark_all_notifications_read_impl();
$$;

create or replace function public.hc_request_visit(
  p_job_id uuid,
  p_experience_type text,
  p_local_date date,
  p_local_time time without time zone,
  p_application_id uuid default null,
  p_candidate_message text default null
)
returns uuid
language sql
security definer
set search_path = ''
as $$
  select hc_private.request_visit(
    p_job_id, p_experience_type, p_local_date, p_local_time,
    p_application_id, p_candidate_message
  );
$$;

create or replace function public.hc_cancel_visit(p_reservation_id uuid)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select hc_private.cancel_visit(p_reservation_id);
$$;

-- The browser may call only the public candidate-safe wrappers.
grant execute on function public.hc_mark_notification_read(uuid) to authenticated;
grant execute on function public.hc_mark_all_notifications_read() to authenticated;
grant execute on function public.hc_request_visit(uuid,text,date,time without time zone,uuid,text) to authenticated;
grant execute on function public.hc_cancel_visit(uuid) to authenticated;

revoke execute on function public.hc_mark_notification_read(uuid) from anon;
revoke execute on function public.hc_mark_all_notifications_read() from anon;
revoke execute on function public.hc_request_visit(uuid,text,date,time without time zone,uuid,text) from anon;
revoke execute on function public.hc_cancel_visit(uuid) from anon;

revoke execute on function ho_private.hc_mark_notification_read_impl(uuid) from public, anon, authenticated;
revoke execute on function ho_private.hc_mark_all_notifications_read_impl() from public, anon, authenticated;
revoke execute on function hc_private.request_visit(uuid,text,date,time without time zone,uuid,text) from public, anon, authenticated;
revoke execute on function hc_private.cancel_visit(uuid) from public, anon, authenticated;

-- Fail closed if a later privilege default unexpectedly leaves a private helper
-- browser-callable or removes the intended public authenticated entrypoint.
do $$
begin
  if has_function_privilege('authenticated', 'ho_private.hc_mark_notification_read_impl(uuid)', 'EXECUTE')
     or has_function_privilege('authenticated', 'ho_private.hc_mark_all_notifications_read_impl()', 'EXECUTE')
     or has_function_privilege('authenticated', 'hc_private.request_visit(uuid,text,date,time without time zone,uuid,text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'hc_private.cancel_visit(uuid)', 'EXECUTE') then
    raise exception 'JOBSEEKER_PRIVATE_HELPER_EXECUTE_REMAINS';
  end if;

  if has_function_privilege('anon', 'public.hc_mark_notification_read(uuid)', 'EXECUTE')
     or has_function_privilege('anon', 'public.hc_mark_all_notifications_read()', 'EXECUTE')
     or has_function_privilege('anon', 'public.hc_request_visit(uuid,text,date,time without time zone,uuid,text)', 'EXECUTE')
     or has_function_privilege('anon', 'public.hc_cancel_visit(uuid)', 'EXECUTE') then
    raise exception 'JOBSEEKER_PUBLIC_WRAPPER_ANON_EXECUTE_REMAINS';
  end if;

  if not has_function_privilege('authenticated', 'public.hc_mark_notification_read(uuid)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.hc_mark_all_notifications_read()', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.hc_request_visit(uuid,text,date,time without time zone,uuid,text)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.hc_cancel_visit(uuid)', 'EXECUTE') then
    raise exception 'JOBSEEKER_PUBLIC_WRAPPER_AUTH_EXECUTE_MISSING';
  end if;
end
$$;
