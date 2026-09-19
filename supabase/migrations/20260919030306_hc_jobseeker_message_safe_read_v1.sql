-- Hoiku Color Candidate Web — message safe-read boundary v1.
-- Production migration version: 20260919030306.
-- Production already has this migration. Repository sync must NOT re-apply it there.
--
-- Candidate message reads:
-- - derive Candidate identity only from JWT
-- - require an owned hoiku_color_jobseeker application
-- - do not create a message thread as a side effect of reading
-- - return only UI-required fields and omit sender_clerk_user_id

create or replace function public.hc_jobseeker_list_application_messages(
  p_application_id uuid
)
returns table(
  id uuid,
  thread_id uuid,
  sender_role text,
  body text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor text := nullif((select auth.jwt()) ->> 'sub', '');
  v_thread_id uuid;
begin
  if v_actor is null then
    raise exception 'HC_JOBSEEKER_AUTH_REQUIRED' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.hc_applications a
    where a.id = p_application_id
      and a.source_type = 'hoiku_color_jobseeker'
      and a.jobseeker_clerk_user_id = v_actor
  ) then
    raise exception 'APPLICATION_NOT_FOUND' using errcode = 'P0002';
  end if;

  select t.id into v_thread_id
  from public.hc_message_threads t
  where t.application_id = p_application_id;

  if v_thread_id is null then
    return;
  end if;

  return query
  select m.id, m.thread_id, m.sender_role, m.body, m.created_at
  from public.hc_messages m
  where m.thread_id = v_thread_id
  order by m.created_at asc, m.id asc;
end;
$$;

revoke all on function public.hc_jobseeker_list_application_messages(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.hc_jobseeker_list_application_messages(uuid)
  to authenticated;
