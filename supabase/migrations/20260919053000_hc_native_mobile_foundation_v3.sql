-- Hoiku Color Native App — mobile identity/release foundation v3.
-- Rebased on the live HC production schema inspected 2026-09-19 after
-- 20260919050337_hc_admin_spot_assignment_candidates_v1.
--
-- Scope is intentionally narrow:
-- - Hoiku Color jobseeker installation identity only (never Poppy/staff app rows)
-- - push-token ownership/rebind + revoke boundary
-- - app/backend compatibility policy + authenticated bootstrap RPC
--
-- Push delivery queue/worker, notification routing, message/visit idempotency and
-- account-deletion execution are separate migrations and are NOT introduced here.
--
-- IMPORTANT: hc_private is already shared by existing HC private functions.
-- This migration must not revoke schema-level privileges or replace unrelated
-- private objects. It only creates new mobile_* tables and public RPCs.

begin;

create schema if not exists hc_private;

-- Fail loudly if a previous/unreviewed Native foundation already created any of
-- these objects. We do not silently reinterpret an unknown mobile schema.
do $$
begin
  if to_regclass('hc_private.mobile_installations') is not null
     or to_regclass('hc_private.mobile_release_policy') is not null then
    raise exception 'HC_NATIVE_MOBILE_FOUNDATION_ALREADY_EXISTS';
  end if;

  if to_regprocedure('public.hc_mobile_register_installation_v1(uuid,text,text,text,text,integer,integer,boolean,text,text)') is not null
     or to_regprocedure('public.hc_mobile_revoke_installation_v1(uuid)') is not null
     or to_regprocedure('public.hc_mobile_bootstrap_v1(text,integer,integer)') is not null then
    raise exception 'HC_NATIVE_MOBILE_FOUNDATION_RPC_ALREADY_EXISTS';
  end if;
end $$;

create table hc_private.mobile_installations (
  id uuid primary key default gen_random_uuid(),
  app_key text not null default 'hoiku_color_jobseeker'
    check (app_key = 'hoiku_color_jobseeker'),
  recipient_clerk_user_id text not null,
  installation_id uuid not null,
  platform text not null check (platform in ('ios','android')),
  push_provider text not null check (push_provider in ('expo','apns','fcm')),
  push_token text,
  app_version text,
  build_number integer not null check (build_number >= 1),
  client_contract_version integer not null check (client_contract_version >= 1),
  notifications_authorized boolean not null default false,
  locale text,
  timezone text,
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (app_key, installation_id)
);

create index hc_mobile_installations_recipient_active_idx
  on hc_private.mobile_installations(app_key, recipient_clerk_user_id, last_seen_at desc)
  where revoked_at is null;

create unique index hc_mobile_installations_push_token_uidx
  on hc_private.mobile_installations(app_key, push_provider, push_token)
  where push_token is not null and revoked_at is null;

alter table hc_private.mobile_installations enable row level security;
revoke all on table hc_private.mobile_installations from public, anon, authenticated, service_role;

create table hc_private.mobile_release_policy (
  app_key text not null check (app_key = 'hoiku_color_jobseeker'),
  platform text not null check (platform in ('ios','android')),
  minimum_build_number integer not null check (minimum_build_number >= 1),
  latest_build_number integer not null check (latest_build_number >= minimum_build_number),
  minimum_client_contract_version integer not null check (minimum_client_contract_version >= 1),
  backend_contract_version integer not null check (backend_contract_version >= minimum_client_contract_version),
  store_url text,
  maintenance_mode boolean not null default false,
  maintenance_message text,
  updated_at timestamptz not null default now(),
  primary key (app_key, platform)
);

alter table hc_private.mobile_release_policy enable row level security;
revoke all on table hc_private.mobile_release_policy from public, anon, authenticated, service_role;

create or replace function public.hc_mobile_register_installation_v1(
  p_installation_id uuid,
  p_platform text,
  p_push_provider text,
  p_push_token text,
  p_app_version text,
  p_build_number integer,
  p_client_contract_version integer,
  p_notifications_authorized boolean,
  p_locale text default null,
  p_timezone text default null
)
returns table(
  installation_row_id uuid,
  notifications_authorized boolean,
  registered_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor text := nullif((select auth.jwt()) ->> 'sub', '');
  v_row hc_private.mobile_installations%rowtype;
  v_token text := nullif(trim(coalesce(p_push_token,'')), '');
begin
  if v_actor is null then
    raise exception 'AUTH_REQUIRED' using errcode='42501';
  end if;
  if p_installation_id is null then
    raise exception 'INSTALLATION_ID_REQUIRED' using errcode='22023';
  end if;
  if p_platform not in ('ios','android') then
    raise exception 'INVALID_PLATFORM' using errcode='22023';
  end if;
  if p_push_provider not in ('expo','apns','fcm') then
    raise exception 'INVALID_PUSH_PROVIDER' using errcode='22023';
  end if;
  if p_build_number is null or p_build_number < 1 then
    raise exception 'INVALID_BUILD_NUMBER' using errcode='22023';
  end if;
  if p_client_contract_version is null or p_client_contract_version < 1 then
    raise exception 'INVALID_CLIENT_CONTRACT_VERSION' using errcode='22023';
  end if;
  if coalesce(p_notifications_authorized,false) and v_token is null then
    raise exception 'PUSH_TOKEN_REQUIRED' using errcode='22023';
  end if;
  if v_token is not null and char_length(v_token) > 4096 then
    raise exception 'PUSH_TOKEN_TOO_LONG' using errcode='22023';
  end if;

  -- One active provider/token may route to exactly one HC jobseeker installation.
  -- Serialize token claims so reinstall/recovery cannot race the partial unique index.
  if coalesce(p_notifications_authorized,false) and v_token is not null then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'hc:push-token:hoiku_color_jobseeker:' || p_push_provider || ':' || v_token,
        0
      )
    );

    -- Retire an older installation UUID holding the same token before rebinding.
    -- Historical rows remain for audit, but become non-routable immediately.
    update hc_private.mobile_installations i
       set push_token = null,
           notifications_authorized = false,
           revoked_at = coalesce(i.revoked_at, now()),
           updated_at = now()
     where i.app_key = 'hoiku_color_jobseeker'
       and i.push_provider = p_push_provider
       and i.push_token = v_token
       and i.revoked_at is null
       and i.installation_id <> p_installation_id;
  end if;

  insert into hc_private.mobile_installations(
    app_key,
    recipient_clerk_user_id,
    installation_id,
    platform,
    push_provider,
    push_token,
    app_version,
    build_number,
    client_contract_version,
    notifications_authorized,
    locale,
    timezone,
    last_seen_at,
    revoked_at,
    updated_at
  )
  values (
    'hoiku_color_jobseeker',
    v_actor,
    p_installation_id,
    p_platform,
    p_push_provider,
    case when coalesce(p_notifications_authorized,false) then v_token else null end,
    nullif(trim(coalesce(p_app_version,'')), ''),
    p_build_number,
    p_client_contract_version,
    coalesce(p_notifications_authorized,false),
    nullif(trim(coalesce(p_locale,'')), ''),
    nullif(trim(coalesce(p_timezone,'')), ''),
    now(),
    null,
    now()
  )
  on conflict (app_key, installation_id)
  do update set
    recipient_clerk_user_id = excluded.recipient_clerk_user_id,
    platform = excluded.platform,
    push_provider = excluded.push_provider,
    push_token = excluded.push_token,
    app_version = excluded.app_version,
    build_number = excluded.build_number,
    client_contract_version = excluded.client_contract_version,
    notifications_authorized = excluded.notifications_authorized,
    locale = excluded.locale,
    timezone = excluded.timezone,
    last_seen_at = now(),
    revoked_at = null,
    updated_at = now()
  returning * into v_row;

  return query select v_row.id, v_row.notifications_authorized, v_row.updated_at;
end;
$$;

revoke all on function public.hc_mobile_register_installation_v1(
  uuid,text,text,text,text,integer,integer,boolean,text,text
) from public, anon, authenticated, service_role;
grant execute on function public.hc_mobile_register_installation_v1(
  uuid,text,text,text,text,integer,integer,boolean,text,text
) to authenticated;

create or replace function public.hc_mobile_revoke_installation_v1(
  p_installation_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor text := nullif((select auth.jwt()) ->> 'sub', '');
begin
  if v_actor is null then
    raise exception 'AUTH_REQUIRED' using errcode='42501';
  end if;

  update hc_private.mobile_installations i
     set revoked_at = coalesce(i.revoked_at, now()),
         push_token = null,
         notifications_authorized = false,
         updated_at = now()
   where i.app_key = 'hoiku_color_jobseeker'
     and i.installation_id = p_installation_id
     and i.recipient_clerk_user_id = v_actor
     and i.revoked_at is null;

  return found;
end;
$$;

revoke all on function public.hc_mobile_revoke_installation_v1(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.hc_mobile_revoke_installation_v1(uuid)
  to authenticated;

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

  return query
  select
    true,
    not v_policy.maintenance_mode
      and not v_build_too_old
      and not v_client_contract_too_old
      and not v_backend_contract_too_old,
    -- A backend that is too old cannot be fixed by sending the user to the store.
    -- force_update is only for a client/build that is itself too old.
    v_build_too_old or v_client_contract_too_old,
    p_build_number < v_policy.latest_build_number
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
      when p_build_number < v_policy.latest_build_number then 'APP_UPDATE_RECOMMENDED'
      else null
    end;
end;
$$;

revoke all on function public.hc_mobile_bootstrap_v1(text,integer,integer)
  from public, anon, authenticated, service_role;
grant execute on function public.hc_mobile_bootstrap_v1(text,integer,integer)
  to authenticated;

commit;
