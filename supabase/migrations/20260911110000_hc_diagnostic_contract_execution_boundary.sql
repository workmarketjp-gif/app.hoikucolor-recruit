-- Hoiku Color diagnostic integrity contracts are deployment/operations probes,
-- not browser-facing application APIs. Keep execution service-role only, matching
-- the existing application-document transfer integrity contract.

revoke all on function public.hc_hiring_handoff_integrity_contract()
  from public, anon, authenticated;
grant execute on function public.hc_hiring_handoff_integrity_contract()
  to service_role;

revoke all on function public.hc_tenant_reference_build_contract()
  from public, anon, authenticated;
grant execute on function public.hc_tenant_reference_build_contract()
  to service_role;
