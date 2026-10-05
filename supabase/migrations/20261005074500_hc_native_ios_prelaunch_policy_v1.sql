-- Hoiku Color Native App — iOS prelaunch release policy v1.
begin;

do $guard$
begin
  if to_regclass('hc_private.mobile_release_policy') is null
     or to_regprocedure('public.hc_mobile_bootstrap_v1(text,integer,integer)') is null
     or to_regprocedure('public.hc_mobile_set_prelaunch_test_builds_v1(text,integer[])') is null then
    raise exception 'HC_NATIVE_PRELAUNCH_POLICY_REQUIRED';
  end if;

  if not exists (
    select 1 from information_schema.columns
     where table_schema='hc_private' and table_name='mobile_release_policy'
       and column_name='release_state'
  ) or not exists (
    select 1 from information_schema.columns
     where table_schema='hc_private' and table_name='mobile_release_policy'
       and column_name='prelaunch_test_builds'
  ) then
    raise exception 'HC_NATIVE_PRELAUNCH_COLUMNS_REQUIRED';
  end if;

  if exists (
    select 1 from hc_private.mobile_release_policy
     where app_key='hoiku_color_jobseeker' and platform='ios'
  ) then
    raise exception 'HC_IOS_RELEASE_POLICY_ALREADY_CONFIGURED';
  end if;

  if not exists (
    select 1 from hc_private.mobile_release_policy
     where app_key='hoiku_color_jobseeker'
       and platform='android'
       and minimum_build_number=1
       and latest_build_number=1
       and minimum_client_contract_version=1
       and backend_contract_version=1
       and maintenance_mode=false
       and release_state='prelaunch'
       and prelaunch_test_builds=array[1]::integer[]
  ) then
    raise exception 'HC_ANDROID_PRELAUNCH_BASELINE_CHANGED';
  end if;
end
$guard$;

insert into hc_private.mobile_release_policy (
  app_key, platform, minimum_build_number, latest_build_number,
  minimum_client_contract_version, backend_contract_version,
  store_url, maintenance_mode, maintenance_message, updated_at,
  release_state, prelaunch_test_builds
)
values (
  'hoiku_color_jobseeker', 'ios', 1, 1, 1, 1,
  null, false, null, now(), 'prelaunch', array[1]::integer[]
);

do $verify$
begin
  if not exists (
    select 1 from hc_private.mobile_release_policy
     where app_key='hoiku_color_jobseeker'
       and platform='ios'
       and minimum_build_number=1
       and latest_build_number=1
       and minimum_client_contract_version=1
       and backend_contract_version=1
       and store_url is null
       and maintenance_mode=false
       and maintenance_message is null
       and release_state='prelaunch'
       and prelaunch_test_builds=array[1]::integer[]
  ) then
    raise exception 'HC_IOS_PRELAUNCH_POLICY_VERIFY_FAILED';
  end if;
end
$verify$;

commit;
