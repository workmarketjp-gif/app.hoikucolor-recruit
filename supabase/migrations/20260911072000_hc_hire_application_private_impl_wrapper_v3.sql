-- Apply the same public SECURITY INVOKER / private privileged implementation pattern
-- to the standard HC hire -> Hoiku Office staff handoff.

alter function public.hc_hire_application(uuid,uuid,date,text,text,text,boolean) set schema ho_private;
alter function ho_private.hc_hire_application(uuid,uuid,date,text,text,text,boolean) rename to hc_hire_application_impl;

revoke all on function ho_private.hc_hire_application_impl(uuid,uuid,date,text,text,text,boolean) from public;
revoke all on function ho_private.hc_hire_application_impl(uuid,uuid,date,text,text,text,boolean) from anon;
grant execute on function ho_private.hc_hire_application_impl(uuid,uuid,date,text,text,text,boolean) to authenticated;

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
set search_path = public, ho_private, pg_temp
as $function$
  select ho_private.hc_hire_application_impl(
    p_facility_id,
    p_application_id,
    p_hire_date,
    p_employment_type,
    p_position_title,
    p_qualification,
    p_is_licensed
  );
$function$;

revoke all on function public.hc_hire_application(uuid,uuid,date,text,text,text,boolean) from public;
revoke all on function public.hc_hire_application(uuid,uuid,date,text,text,text,boolean) from anon;
grant execute on function public.hc_hire_application(uuid,uuid,date,text,text,text,boolean) to authenticated;
