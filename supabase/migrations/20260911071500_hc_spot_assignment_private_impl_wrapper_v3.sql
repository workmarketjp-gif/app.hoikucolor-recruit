-- Keep the public Data API surface SECURITY INVOKER while isolating the privileged
-- HC -> Hoiku Office spot assignment implementation in the private schema.

alter function public.hc_confirm_spot_assignment(uuid,uuid,integer) set schema ho_private;
alter function ho_private.hc_confirm_spot_assignment(uuid,uuid,integer) rename to hc_confirm_spot_assignment_impl;

revoke all on function ho_private.hc_confirm_spot_assignment_impl(uuid,uuid,integer) from public;
revoke all on function ho_private.hc_confirm_spot_assignment_impl(uuid,uuid,integer) from anon;
grant execute on function ho_private.hc_confirm_spot_assignment_impl(uuid,uuid,integer) to authenticated;

create or replace function public.hc_confirm_spot_assignment(
  p_facility_id uuid,
  p_application_id uuid,
  p_break_minutes integer default 0
)
returns jsonb
language sql
security invoker
set search_path = public, ho_private, pg_temp
as $function$
  select ho_private.hc_confirm_spot_assignment_impl(p_facility_id,p_application_id,p_break_minutes);
$function$;

revoke all on function public.hc_confirm_spot_assignment(uuid,uuid,integer) from public;
revoke all on function public.hc_confirm_spot_assignment(uuid,uuid,integer) from anon;
grant execute on function public.hc_confirm_spot_assignment(uuid,uuid,integer) to authenticated;
