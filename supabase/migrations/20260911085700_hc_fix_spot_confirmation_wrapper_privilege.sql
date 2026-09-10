grant execute on function ho_private.hc_confirm_spot_assignment_canonical(uuid, uuid) to authenticated;

create or replace function public.hc_confirm_spot_assignment(
  p_facility_id uuid,
  p_application_id uuid,
  p_break_minutes integer default null
)
returns jsonb
language sql
security invoker
set search_path = public, ho_private, pg_temp
as $$
  -- Backwards-compatible parameter only. The private implementation re-reads
  -- canonical break_minutes from Hoiku Office and never trusts this client value.
  select ho_private.hc_confirm_spot_assignment_canonical(p_facility_id, p_application_id);
$$;

revoke all on function public.hc_confirm_spot_assignment(uuid, uuid, integer) from public, anon;
grant execute on function public.hc_confirm_spot_assignment(uuid, uuid, integer) to authenticated;
