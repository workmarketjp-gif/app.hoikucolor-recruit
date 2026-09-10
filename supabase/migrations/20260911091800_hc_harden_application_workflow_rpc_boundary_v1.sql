create or replace function ho_private.hc_update_application_status_impl(
  p_facility_id uuid,
  p_application_id uuid,
  p_status text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, ho_private, pg_temp
as $$
declare
  v_app public.hc_applications%rowtype;
  v_job_source_type text;
begin
  if not ho_private.recruitment_can_write(p_facility_id) then
    raise exception using errcode='42501',message='RECRUITMENT_FORBIDDEN';
  end if;
  if p_status not in ('new','reviewing','interview','offered','hired','rejected','withdrawn') then
    raise exception using errcode='22023',message='APPLICATION_STATUS_INVALID';
  end if;
  select * into v_app
  from public.hc_applications a
  where a.id=p_application_id and a.facility_id=p_facility_id
  for update;
  if v_app.id is null then
    raise exception using errcode='P0002',message='APPLICATION_NOT_FOUND';
  end if;
  select j.source_type into v_job_source_type
  from public.hc_jobs j
  where j.id=v_app.job_id
    and j.organization_id=v_app.organization_id
    and j.facility_id=v_app.facility_id;
  if v_job_source_type is null then
    raise exception using errcode='23514',message='APPLICATION_JOB_TENANT_MISMATCH';
  end if;
  if v_app.hired_staff_id is not null then
    if p_status <> 'hired' then
      raise exception using errcode='23514',message='HIRED_APPLICATION_STATUS_IMMUTABLE';
    end if;
    if not exists (
      select 1 from public.ho_staff_members s
      where s.id=v_app.hired_staff_id
        and s.organization_id=v_app.organization_id
        and s.facility_id=v_app.facility_id
    ) then
      raise exception using errcode='23514',message='APPLICATION_HIRED_STAFF_TENANT_MISMATCH';
    end if;
  elsif p_status='hired' and v_job_source_type <> 'spot_job' and v_app.source_type <> 'market' then
    raise exception using errcode='23514',message='STANDARD_HIRE_REQUIRES_HO_HANDOFF';
  end if;
  update public.hc_applications a
  set status=p_status,
      admin_memo=coalesce(p_note,a.admin_memo),
      updated_at=now()
  where a.id=p_application_id and a.facility_id=p_facility_id;
  if v_app.status is distinct from p_status or p_note is not null then
    insert into public.hc_application_events(
      organization_id,facility_id,application_id,event_type,
      from_status,to_status,note,actor_clerk_user_id
    ) values(
      v_app.organization_id,v_app.facility_id,v_app.id,'status_changed',
      v_app.status,p_status,p_note,ho_private.current_clerk_user_id()
    );
  end if;
  return (select to_jsonb(a) from public.hc_applications a where a.id=p_application_id);
end;
$$;
revoke all on function ho_private.hc_update_application_status_impl(uuid,uuid,text,text) from public, anon;
grant execute on function ho_private.hc_update_application_status_impl(uuid,uuid,text,text) to authenticated, service_role;

create or replace function public.hc_update_application_status(
  p_facility_id uuid,
  p_application_id uuid,
  p_status text,
  p_note text default null
)
returns jsonb
language sql
security invoker
set search_path = public, ho_private, pg_temp
as $$
  select ho_private.hc_update_application_status_impl(p_facility_id,p_application_id,p_status,p_note);
$$;
revoke all on function public.hc_update_application_status(uuid,uuid,text,text) from public, anon;
grant execute on function public.hc_update_application_status(uuid,uuid,text,text) to authenticated, service_role;

create or replace function ho_private.hc_schedule_interview_impl(
  p_facility_id uuid,
  p_application_id uuid,
  p_scheduled_at timestamptz,
  p_duration_minutes integer default 60,
  p_location text default null,
  p_meeting_url text default null,
  p_interviewer text default null,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, ho_private, pg_temp
as $$
declare
  v_org_id uuid;
  v_before text;
  v_interview_id uuid;
begin
  if not ho_private.recruitment_can_write(p_facility_id) then
    raise exception using errcode = '42501', message = 'RECRUITMENT_FORBIDDEN';
  end if;
  if p_scheduled_at is null then
    raise exception using errcode = '22023', message = 'INTERVIEW_DATE_REQUIRED';
  end if;
  if p_duration_minutes not between 15 and 480 then
    raise exception using errcode = '22023', message = 'INTERVIEW_DURATION_INVALID';
  end if;
  select a.organization_id, a.status into v_org_id, v_before
  from public.hc_applications a
  where a.id = p_application_id
    and a.facility_id = p_facility_id
    and a.status not in ('hired','rejected','withdrawn')
  for update;
  if v_org_id is null then
    raise exception using errcode = 'P0002', message = 'APPLICATION_NOT_FOUND';
  end if;
  insert into public.hc_interviews (
    organization_id, facility_id, application_id, scheduled_at,
    duration_minutes, location, meeting_url, interviewer, status, note, created_by
  ) values (
    v_org_id,p_facility_id,p_application_id,p_scheduled_at,p_duration_minutes,
    p_location,p_meeting_url,p_interviewer,'scheduled',p_note,
    ho_private.current_clerk_user_id()
  ) returning id into v_interview_id;
  update public.hc_applications a
  set status = 'interview', updated_at = now()
  where a.id = p_application_id;
  insert into public.hc_application_events (
    organization_id, facility_id, application_id, event_type,
    from_status, to_status, note, actor_clerk_user_id
  ) values (
    v_org_id,p_facility_id,p_application_id,'interview_scheduled',
    v_before,'interview',p_note,ho_private.current_clerk_user_id()
  );
  return (select to_jsonb(i) from public.hc_interviews i where i.id = v_interview_id);
end;
$$;
revoke all on function ho_private.hc_schedule_interview_impl(uuid,uuid,timestamptz,integer,text,text,text,text) from public, anon;
grant execute on function ho_private.hc_schedule_interview_impl(uuid,uuid,timestamptz,integer,text,text,text,text) to authenticated, service_role;

create or replace function public.hc_schedule_interview(
  p_facility_id uuid,
  p_application_id uuid,
  p_scheduled_at timestamptz,
  p_duration_minutes integer default 60,
  p_location text default null,
  p_meeting_url text default null,
  p_interviewer text default null,
  p_note text default null
)
returns jsonb
language sql
security invoker
set search_path = public, ho_private, pg_temp
as $$
  select ho_private.hc_schedule_interview_impl(
    p_facility_id,p_application_id,p_scheduled_at,p_duration_minutes,
    p_location,p_meeting_url,p_interviewer,p_note
  );
$$;
revoke all on function public.hc_schedule_interview(uuid,uuid,timestamptz,integer,text,text,text,text) from public, anon;
grant execute on function public.hc_schedule_interview(uuid,uuid,timestamptz,integer,text,text,text,text) to authenticated, service_role;
