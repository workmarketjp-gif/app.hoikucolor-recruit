-- Keep the browser-facing hire RPC SECURITY INVOKER while preventing app roles
-- from calling the privileged raw hire implementation directly.
--
-- The canonical private gateway is the only authenticated entry into the
-- SECURITY DEFINER implementation. It binds the caller to the Clerk subject
-- and re-checks facility recruitment write permission before performing the
-- normal-hire -> Hoiku Office staff handoff.

create or replace function ho_private.hc_hire_application_canonical(
  p_facility_id uuid,
  p_application_id uuid,
  p_hire_date date,
  p_employment_type text default null,
  p_position_title text default null,
  p_qualification text default null,
  p_is_licensed boolean default null
)
returns jsonb
language plpgsql
security definer
set search_path = 'public', 'ho_private', 'pg_temp'
as $$
declare
  v_actor text := ho_private.current_clerk_user_id();
begin
  if v_actor is null or btrim(v_actor) = '' then
    raise exception using errcode = '42501', message = 'AUTH_REQUIRED';
  end if;

  if not ho_private.recruitment_can_write(p_facility_id) then
    raise exception using errcode = '42501', message = 'RECRUITMENT_FORBIDDEN';
  end if;

  return ho_private.hc_hire_application_impl(
    p_facility_id,
    p_application_id,
    p_hire_date,
    p_employment_type,
    p_position_title,
    p_qualification,
    p_is_licensed
  );
end;
$$;

revoke all on function ho_private.hc_hire_application_impl(uuid, uuid, date, text, text, text, boolean)
  from public, anon, authenticated, service_role;
grant execute on function ho_private.hc_hire_application_impl(uuid, uuid, date, text, text, text, boolean)
  to postgres;

revoke all on function ho_private.hc_hire_application_canonical(uuid, uuid, date, text, text, text, boolean)
  from public, anon, authenticated, service_role;
grant execute on function ho_private.hc_hire_application_canonical(uuid, uuid, date, text, text, text, boolean)
  to postgres, authenticated;

create or replace function public.hc_hire_application(
  p_facility_id uuid,
  p_application_id uuid,
  p_hire_date date,
  p_employment_type text default null,
  p_position_title text default null,
  p_qualification text default null,
  p_is_licensed boolean default null
)
returns jsonb
language sql
security invoker
set search_path = 'public', 'ho_private', 'pg_temp'
as $$
  select ho_private.hc_hire_application_canonical(
    p_facility_id,
    p_application_id,
    p_hire_date,
    p_employment_type,
    p_position_title,
    p_qualification,
    p_is_licensed
  );
$$;

revoke all on function public.hc_hire_application(uuid, uuid, date, text, text, text, boolean)
  from public, anon, authenticated, service_role;
grant execute on function public.hc_hire_application(uuid, uuid, date, text, text, text, boolean)
  to postgres, authenticated;
