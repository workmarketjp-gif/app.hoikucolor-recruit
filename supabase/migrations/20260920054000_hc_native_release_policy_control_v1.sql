-- Hoiku Color Native App — release policy control v1.
--
-- Operational control plane for the canonical mobile_release_policy introduced by
-- 20260919053000_hc_native_mobile_foundation_v3.sql.
--
-- This migration intentionally DOES NOT insert or activate a release policy.
-- The app therefore remains fail-closed until an explicitly approved release step
-- configures iOS/Android via the service-role-only RPC below. This keeps code/DB
-- rollout separate from Store publication and lets Release Gate put the app into
-- maintenance before a backend rollback.

begin;

do $baseline$
begin
  if to_regclass('hc_private.mobile_release_policy') is null
     or to_regprocedure('public.hc_mobile_bootstrap_v1(text,integer,integer)') is null then
    raise exception 'HC_NATIVE_RELEASE_POLICY_FOUNDATION_REQUIRED';
  end if;

  if to_regprocedure('public.hc_mobile_set_release_policy_v1(text,integer,integer,integer,integer,text,boolean,text)') is not null
     or to_regprocedure('public.hc_mobile_get_release_policy_admin_v1(text)') is not null then
    raise exception 'HC_NATIVE_RELEASE_POLICY_CONTROL_ALREADY_EXISTS';
  end if;
end
$baseline$;

create or replace function public.hc_mobile_set_release_policy_v1(
  p_platform text,
  p_minimum_build_number integer,
  p_latest_build_number integer,
  p_minimum_client_contract_version integer,
  p_backend_contract_version integer,
  p_store_url text default null,
  p_maintenance_mode boolean default true,
  p_maintenance_message text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_store_url text := nullif(btrim(coalesce(p_store_url,'')), '');
  v_message text := nullif(btrim(coalesce(p_maintenance_message,'')), '');
  v_host text;
  v_row hc_private.mobile_release_policy%rowtype;
begin
  if p_platform not in ('ios','android') then
    raise exception 'INVALID_PLATFORM' using errcode='22023';
  end if;
  if p_minimum_build_number is null or p_minimum_build_number < 1 then
    raise exception 'INVALID_MINIMUM_BUILD_NUMBER' using errcode='22023';
  end if;
  if p_latest_build_number is null or p_latest_build_number < p_minimum_build_number then
    raise exception 'INVALID_LATEST_BUILD_NUMBER' using errcode='22023';
  end if;
  if p_minimum_client_contract_version is null or p_minimum_client_contract_version < 1 then
    raise exception 'INVALID_MINIMUM_CLIENT_CONTRACT_VERSION' using errcode='22023';
  end if;
  if p_backend_contract_version is null
     or p_backend_contract_version < p_minimum_client_contract_version then
    raise exception 'INVALID_BACKEND_CONTRACT_VERSION' using errcode='22023';
  end if;
  if v_store_url is not null then
    v_host := split_part(substr(v_store_url, 9), '/', 1);
    if char_length(v_store_url) > 2048
       or v_store_url !~* '^https://'
       or v_store_url ~ '[[:space:]]'
       or nullif(v_host,'') is null
       or v_host like '%@%' then
      raise exception 'INVALID_STORE_URL' using errcode='22023';
    end if;
  end if;
  if v_message is not null and char_length(v_message) > 500 then
    raise exception 'MAINTENANCE_MESSAGE_TOO_LONG' using errcode='22023';
  end if;

  insert into hc_private.mobile_release_policy(
    app_key,
    platform,
    minimum_build_number,
    latest_build_number,
    minimum_client_contract_version,
    backend_contract_version,
    store_url,
    maintenance_mode,
    maintenance_message,
    updated_at
  ) values (
    'hoiku_color_jobseeker',
    p_platform,
    p_minimum_build_number,
    p_latest_build_number,
    p_minimum_client_contract_version,
    p_backend_contract_version,
    v_store_url,
    coalesce(p_maintenance_mode,true),
    v_message,
    now()
  )
  on conflict (app_key,platform)
  do update set
    minimum_build_number=excluded.minimum_build_number,
    latest_build_number=excluded.latest_build_number,
    minimum_client_contract_version=excluded.minimum_client_contract_version,
    backend_contract_version=excluded.backend_contract_version,
    store_url=excluded.store_url,
    maintenance_mode=excluded.maintenance_mode,
    maintenance_message=excluded.maintenance_message,
    updated_at=now()
  returning * into v_row;

  return jsonb_build_object(
    'appKey',v_row.app_key,
    'platform',v_row.platform,
    'minimumBuildNumber',v_row.minimum_build_number,
    'latestBuildNumber',v_row.latest_build_number,
    'minimumClientContractVersion',v_row.minimum_client_contract_version,
    'backendContractVersion',v_row.backend_contract_version,
    'storeUrl',v_row.store_url,
    'maintenanceMode',v_row.maintenance_mode,
    'maintenanceMessage',v_row.maintenance_message,
    'updatedAt',v_row.updated_at
  );
end;
$$;

revoke all on function public.hc_mobile_set_release_policy_v1(
  text,integer,integer,integer,integer,text,boolean,text
) from public, anon, authenticated, service_role;
grant execute on function public.hc_mobile_set_release_policy_v1(
  text,integer,integer,integer,integer,text,boolean,text
) to service_role;

create or replace function public.hc_mobile_get_release_policy_admin_v1(
  p_platform text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_row hc_private.mobile_release_policy%rowtype;
begin
  if p_platform not in ('ios','android') then
    raise exception 'INVALID_PLATFORM' using errcode='22023';
  end if;

  select p.* into v_row
    from hc_private.mobile_release_policy p
   where p.app_key='hoiku_color_jobseeker'
     and p.platform=p_platform;

  if not found then
    return null;
  end if;

  return jsonb_build_object(
    'appKey',v_row.app_key,
    'platform',v_row.platform,
    'minimumBuildNumber',v_row.minimum_build_number,
    'latestBuildNumber',v_row.latest_build_number,
    'minimumClientContractVersion',v_row.minimum_client_contract_version,
    'backendContractVersion',v_row.backend_contract_version,
    'storeUrl',v_row.store_url,
    'maintenanceMode',v_row.maintenance_mode,
    'maintenanceMessage',v_row.maintenance_message,
    'updatedAt',v_row.updated_at
  );
end;
$$;

revoke all on function public.hc_mobile_get_release_policy_admin_v1(text)
  from public, anon, authenticated, service_role;
grant execute on function public.hc_mobile_get_release_policy_admin_v1(text)
  to service_role;

commit;
