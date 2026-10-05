-- Hoiku Color Native App — prelaunch internal test-build allowlist v1.
--
-- The jobseeker release policy is platform-wide. Before Store release we need to
-- admit specific internal QA builds (EAS development/preview) without opening the
-- platform to every binary. Mirrors the Hoiku Office native_prelaunch_test_builds
-- design:
--
-- - release_state defaults to 'prelaunch'; creating/updating a policy row never
--   makes the platform public by itself.
-- - while prelaunch, bootstrap allows a build only if its exact build number is in
--   prelaunch_test_builds AND every other policy check still passes.
-- - switching to 'active' is a separate service-role step and clears the allowlist.
--
-- Applying this migration changes nothing at runtime while no policy row exists
-- (bootstrap keeps returning APP_RELEASE_POLICY_NOT_CONFIGURED).

begin;

do $baseline$
begin
  if to_regclass('hc_private.mobile_release_policy') is null
     or to_regprocedure('public.hc_mobile_bootstrap_v1(text,integer,integer)') is null
     or to_regprocedure('public.hc_mobile_set_release_policy_v1(text,integer,integer,integer,integer,text,boolean,text)') is null then
    raise exception 'HC_NATIVE_RELEASE_POLICY_CONTROL_REQUIRED';
  end if;
  if exists (
    select 1 from information_schema.columns
     where table_schema='hc_private' and table_name='mobile_release_policy'
       and column_name in ('release_state','prelaunch_test_builds')
  ) then
    raise exception 'HC_NATIVE_RELEASE_PRELAUNCH_ALREADY_EXISTS';
  end if;
end
$baseline$;

alter table hc_private.mobile_release_policy
  add column release_state text not null default 'prelaunch'
    check (release_state in ('prelaunch','active')),
  add column prelaunch_test_builds integer[] not null default '{}'::integer[];

alter table hc_private.mobile_release_policy
  add constraint hc_mobile_release_policy_prelaunch_builds_check check (
    cardinality(prelaunch_test_builds) <= 20
    and array_position(prelaunch_test_builds, null) is null
    and 1 <= all(prelaunch_test_builds)
    and (cardinality(prelaunch_test_builds) = 0 or release_state = 'prelaunch')
  );

create or replace function public.hc_mobile_bootstrap_v1(
  p_platform text,
  p_build_number integer,
  p_client_contract_version integer
)
returns table(
  configured boolean,
  allowed boolean,
  force_update boolean,
  recommended_update boolean,
  maintenance_mode boolean,
  backend_contract_version integer,
  minimum_client_contract_version integer,
  minimum_build_number integer,
  latest_build_number integer,
  store_url text,
  message text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor text := nullif((select auth.jwt()) ->> 'sub', '');
  v_policy hc_private.mobile_release_policy%rowtype;
  v_build_too_old boolean;
  v_client_contract_too_old boolean;
  v_backend_contract_too_old boolean;
  v_prelaunch_blocked boolean;
begin
  if v_actor is null then
    raise exception 'AUTH_REQUIRED' using errcode='42501';
  end if;
  if p_platform not in ('ios','android') then
    raise exception 'INVALID_PLATFORM' using errcode='22023';
  end if;
  if p_build_number is null or p_build_number < 1 then
    raise exception 'INVALID_BUILD_NUMBER' using errcode='22023';
  end if;
  if p_client_contract_version is null or p_client_contract_version < 1 then
    raise exception 'INVALID_CLIENT_CONTRACT_VERSION' using errcode='22023';
  end if;

  select p.*
    into v_policy
    from hc_private.mobile_release_policy p
   where p.app_key = 'hoiku_color_jobseeker'
     and p.platform = p_platform;

  if not found then
    return query
    select false,false,false,false,false,
           null::integer,null::integer,null::integer,null::integer,null::text,
           'APP_RELEASE_POLICY_NOT_CONFIGURED'::text;
    return;
  end if;

  v_build_too_old := p_build_number < v_policy.minimum_build_number;
  v_client_contract_too_old :=
    p_client_contract_version < v_policy.minimum_client_contract_version;
  v_backend_contract_too_old :=
    p_client_contract_version > v_policy.backend_contract_version;
  v_prelaunch_blocked :=
    v_policy.release_state = 'prelaunch'
    and not (p_build_number = any(v_policy.prelaunch_test_builds));

  return query
  select
    true,
    not v_policy.maintenance_mode
      and not v_prelaunch_blocked
      and not v_build_too_old
      and not v_client_contract_too_old
      and not v_backend_contract_too_old,
    -- A backend that is too old cannot be fixed by sending the user to the store.
    -- force_update is only for a client/build that is itself too old.
    v_build_too_old or v_client_contract_too_old,
    v_policy.release_state = 'active'
      and p_build_number < v_policy.latest_build_number
      and not v_policy.maintenance_mode
      and not v_build_too_old
      and not v_client_contract_too_old
      and not v_backend_contract_too_old,
    v_policy.maintenance_mode,
    v_policy.backend_contract_version,
    v_policy.minimum_client_contract_version,
    v_policy.minimum_build_number,
    v_policy.latest_build_number,
    v_policy.store_url,
    case
      when v_policy.maintenance_mode then coalesce(v_policy.maintenance_message,'メンテナンス中です。')
      when v_backend_contract_too_old then 'APP_BACKEND_CONTRACT_TOO_OLD'
      when v_client_contract_too_old then 'APP_CLIENT_CONTRACT_TOO_OLD'
      when v_build_too_old then 'APP_UPDATE_REQUIRED'
      when v_prelaunch_blocked then 'APP_PRELAUNCH_BUILD_NOT_ALLOWED'
      when v_policy.release_state = 'active' and p_build_number < v_policy.latest_build_number then 'APP_UPDATE_RECOMMENDED'
      else null
    end;
end;
$$;

revoke all on function public.hc_mobile_bootstrap_v1(text,integer,integer)
  from public, anon, authenticated, service_role;
grant execute on function public.hc_mobile_bootstrap_v1(text,integer,integer)
  to authenticated;

-- Service-role only: replace the exact internal QA build allowlist for a platform.
create or replace function public.hc_mobile_set_prelaunch_test_builds_v1(
  p_platform text,
  p_build_numbers integer[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_builds integer[] := coalesce(
    (select array_agg(distinct b order by b) from unnest(coalesce(p_build_numbers,'{}'::integer[])) b),
    '{}'::integer[]
  );
  v_row hc_private.mobile_release_policy%rowtype;
begin
  if p_platform not in ('ios','android') then
    raise exception 'INVALID_PLATFORM' using errcode='22023';
  end if;
  if array_position(v_builds, null) is not null or not (1 <= all(v_builds)) or cardinality(v_builds) > 20 then
    raise exception 'INVALID_PRELAUNCH_TEST_BUILDS' using errcode='22023';
  end if;

  update hc_private.mobile_release_policy p
     set prelaunch_test_builds = v_builds, updated_at = now()
   where p.app_key = 'hoiku_color_jobseeker'
     and p.platform = p_platform
     and p.release_state = 'prelaunch'
  returning * into v_row;

  if not found then
    raise exception 'PRELAUNCH_POLICY_NOT_FOUND' using errcode='P0002';
  end if;

  return jsonb_build_object(
    'platform', v_row.platform,
    'releaseState', v_row.release_state,
    'prelaunchTestBuilds', to_jsonb(v_row.prelaunch_test_builds),
    'maintenanceMode', v_row.maintenance_mode,
    'updatedAt', v_row.updated_at
  );
end;
$$;

revoke all on function public.hc_mobile_set_prelaunch_test_builds_v1(text,integer[])
  from public, anon, authenticated, service_role;
grant execute on function public.hc_mobile_set_prelaunch_test_builds_v1(text,integer[])
  to service_role;

-- Service-role only: the explicit public-release switch. Leaving prelaunch clears
-- the allowlist; returning to prelaunch admits nothing until builds are listed again.
create or replace function public.hc_mobile_set_release_state_v1(
  p_platform text,
  p_release_state text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row hc_private.mobile_release_policy%rowtype;
begin
  if p_platform not in ('ios','android') then
    raise exception 'INVALID_PLATFORM' using errcode='22023';
  end if;
  if p_release_state not in ('prelaunch','active') then
    raise exception 'INVALID_RELEASE_STATE' using errcode='22023';
  end if;

  update hc_private.mobile_release_policy p
     set release_state = p_release_state,
         prelaunch_test_builds = '{}'::integer[],
         updated_at = now()
   where p.app_key = 'hoiku_color_jobseeker'
     and p.platform = p_platform
  returning * into v_row;

  if not found then
    raise exception 'RELEASE_POLICY_NOT_FOUND' using errcode='P0002';
  end if;

  return jsonb_build_object(
    'platform', v_row.platform,
    'releaseState', v_row.release_state,
    'prelaunchTestBuilds', to_jsonb(v_row.prelaunch_test_builds),
    'maintenanceMode', v_row.maintenance_mode,
    'updatedAt', v_row.updated_at
  );
end;
$$;

revoke all on function public.hc_mobile_set_release_state_v1(text,text)
  from public, anon, authenticated, service_role;
grant execute on function public.hc_mobile_set_release_state_v1(text,text)
  to service_role;

commit;
