create or replace function ho_private.hc_confirm_spot_assignment_canonical(
  p_facility_id uuid,
  p_application_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'ho_private', 'pg_temp'
as $function$
declare
  v_actor text := ho_private.current_clerk_user_id();
  v_break_minutes integer;
begin
  -- Hoiku Poppy authenticates with Clerk subject IDs such as user_xxx.
  -- auth.uid() casts the JWT subject to uuid and fails for valid Clerk users.
  if v_actor is null or btrim(v_actor) = '' then
    raise exception using errcode = '42501', message = 'AUTH_REQUIRED';
  end if;

  if not ho_private.recruitment_can_write(p_facility_id) then
    raise exception using errcode = '42501', message = 'RECRUITMENT_FORBIDDEN';
  end if;

  select d.break_minutes
    into v_break_minutes
    from public.hc_applications a
    join public.hc_jobs j
      on j.id = a.job_id
     and j.facility_id = a.facility_id
     and j.organization_id = a.organization_id
    join public.ho_spot_job_drafts d
      on d.id = j.source_id
     and d.facility_id = j.facility_id
     and d.organization_id = j.organization_id
   where a.id = p_application_id
     and a.facility_id = p_facility_id
     and j.source_type = 'spot_job';

  if not found then
    raise exception using errcode = 'P0002', message = 'SPOT_JOB_SOURCE_NOT_FOUND';
  end if;

  return ho_private.hc_confirm_spot_assignment_impl(
    p_facility_id,
    p_application_id,
    coalesce(v_break_minutes, 0)
  );
end;
$function$;
