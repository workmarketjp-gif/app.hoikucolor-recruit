-- Hoiku Color Candidate Web — HC-W05 candidate-only RPC least privilege v1.
--
-- Scope: public RPCs called only by the signed-in candidate surfaces for Scout,
-- visit/trial and SPOT. These functions derive the candidate from auth.jwt()->>'sub';
-- they are not facility-side admin APIs and do not need service_role execution.
--
-- This migration narrows only function execution/search_path. It does not alter
-- candidate data, facility permissions, shared application/message ledgers, or RLS.

begin;

do $$
begin
  if to_regprocedure('public.hc_jobseeker_get_scout_privacy()') is null
     or to_regprocedure('public.hc_jobseeker_set_scout_opt_in(boolean)') is null
     or to_regprocedure('public.hc_jobseeker_search_blockable_organizations(text,integer)') is null
     or to_regprocedure('public.hc_jobseeker_add_blocked_organization(uuid)') is null
     or to_regprocedure('public.hc_jobseeker_remove_blocked_organization(uuid)') is null
     or to_regprocedure('public.hc_jobseeker_list_scouts()') is null
     or to_regprocedure('public.hc_jobseeker_respond_scout(uuid,text)') is null
     or to_regprocedure('public.hc_jobseeker_get_visit_settings(uuid)') is null
     or to_regprocedure('public.hc_request_visit(uuid,text,date,time without time zone,uuid,text)') is null
     or to_regprocedure('public.hc_cancel_visit(uuid)') is null
     or to_regprocedure('public.hc_jobseeker_list_spot_jobs()') is null
     or to_regprocedure('public.hc_jobseeker_list_my_spot_assignments()') is null then
    raise exception 'HC_W05_CANDIDATE_RPC_SURFACE_DRIFT';
  end if;
end $$;

-- Every referenced relation/function in these candidate wrappers is schema-qualified;
-- pg_catalog remains implicitly available, so no mutable public/auth schema is needed.
alter function public.hc_jobseeker_get_scout_privacy() set search_path = '';
alter function public.hc_jobseeker_set_scout_opt_in(boolean) set search_path = '';
alter function public.hc_jobseeker_search_blockable_organizations(text, integer) set search_path = '';
alter function public.hc_jobseeker_add_blocked_organization(uuid) set search_path = '';
alter function public.hc_jobseeker_remove_blocked_organization(uuid) set search_path = '';
alter function public.hc_jobseeker_list_scouts() set search_path = '';
alter function public.hc_jobseeker_respond_scout(uuid, text) set search_path = '';
alter function public.hc_jobseeker_get_visit_settings(uuid) set search_path = '';
alter function public.hc_request_visit(uuid, text, date, time without time zone, uuid, text) set search_path = '';
alter function public.hc_cancel_visit(uuid) set search_path = '';
alter function public.hc_jobseeker_list_spot_jobs() set search_path = '';
alter function public.hc_jobseeker_list_my_spot_assignments() set search_path = '';

-- Candidate browser RPCs are authenticated-user capabilities. Background/facility
-- processes use their own private/admin contracts and must not call these wrappers.
revoke all on function public.hc_jobseeker_get_scout_privacy() from public, anon, service_role;
revoke all on function public.hc_jobseeker_set_scout_opt_in(boolean) from public, anon, service_role;
revoke all on function public.hc_jobseeker_search_blockable_organizations(text, integer) from public, anon, service_role;
revoke all on function public.hc_jobseeker_add_blocked_organization(uuid) from public, anon, service_role;
revoke all on function public.hc_jobseeker_remove_blocked_organization(uuid) from public, anon, service_role;
revoke all on function public.hc_jobseeker_list_scouts() from public, anon, service_role;
revoke all on function public.hc_jobseeker_respond_scout(uuid, text) from public, anon, service_role;
revoke all on function public.hc_jobseeker_get_visit_settings(uuid) from public, anon, service_role;
revoke all on function public.hc_request_visit(uuid, text, date, time without time zone, uuid, text) from public, anon, service_role;
revoke all on function public.hc_cancel_visit(uuid) from public, anon, service_role;
revoke all on function public.hc_jobseeker_list_spot_jobs() from public, anon, service_role;
revoke all on function public.hc_jobseeker_list_my_spot_assignments() from public, anon, service_role;

grant execute on function public.hc_jobseeker_get_scout_privacy() to authenticated;
grant execute on function public.hc_jobseeker_set_scout_opt_in(boolean) to authenticated;
grant execute on function public.hc_jobseeker_search_blockable_organizations(text, integer) to authenticated;
grant execute on function public.hc_jobseeker_add_blocked_organization(uuid) to authenticated;
grant execute on function public.hc_jobseeker_remove_blocked_organization(uuid) to authenticated;
grant execute on function public.hc_jobseeker_list_scouts() to authenticated;
grant execute on function public.hc_jobseeker_respond_scout(uuid, text) to authenticated;
grant execute on function public.hc_jobseeker_get_visit_settings(uuid) to authenticated;
grant execute on function public.hc_request_visit(uuid, text, date, time without time zone, uuid, text) to authenticated;
grant execute on function public.hc_cancel_visit(uuid) to authenticated;
grant execute on function public.hc_jobseeker_list_spot_jobs() to authenticated;
grant execute on function public.hc_jobseeker_list_my_spot_assignments() to authenticated;

commit;
