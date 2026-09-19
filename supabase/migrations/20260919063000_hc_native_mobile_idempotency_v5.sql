-- Hoiku Color Native App — mobile idempotency v5.
-- Rebased on the live HC production schema inspected 2026-09-19 after
-- 20260919060410_hc_admin_offer_response_state_safe_read_v2.
--
-- Scope is intentionally narrow: Native retry identity for candidate messages
-- and visit/trial requests. Business rules stay in the existing Web/API-owned
-- canonical RPCs. This migration does not apply itself; GitHub main is the source
-- prepared for the controlled backend release step.
--
-- This migration adds only Native retry metadata. It DOES NOT duplicate
-- message or visit business rules. New commands delegate to the existing
-- Web/API-owned canonical mutations:
--   public.hc_send_message(uuid,text)
--   public.hc_request_visit(uuid,text,date,time without time zone,uuid,text)
--
-- Supersedes Prepared-only v1/v2/v3/v4 Native idempotency candidates.

begin;

-- Fail closed if the current canonical mutation surface is missing or an
-- unknown/partial Native idempotency candidate has already touched Production.
do $baseline$
begin
  if to_regprocedure('public.hc_send_message(uuid,text)') is null then
    raise exception 'HC_NATIVE_CANONICAL_SEND_MESSAGE_MISSING';
  end if;
  if to_regprocedure('public.hc_request_visit(uuid,text,date,time without time zone,uuid,text)') is null then
    raise exception 'HC_NATIVE_CANONICAL_REQUEST_VISIT_MISSING';
  end if;

  if to_regprocedure('public.hc_send_message_v2(uuid,text,uuid)') is not null
     or to_regprocedure('public.hc_request_visit_v2(uuid,text,date,time without time zone,uuid,text,uuid)') is not null then
    raise exception 'HC_NATIVE_IDEMPOTENCY_RPC_ALREADY_EXISTS';
  end if;

  if exists (
       select 1 from information_schema.columns
        where table_schema='public' and table_name='hc_messages'
          and column_name in ('client_request_id','client_request_fingerprint')
     )
     or exists (
       select 1 from information_schema.columns
        where table_schema='public' and table_name='hc_visit_reservations'
          and column_name in ('client_request_id','client_request_fingerprint')
     ) then
    raise exception 'HC_NATIVE_IDEMPOTENCY_PARTIAL_SCHEMA_EXISTS';
  end if;

  if to_regclass('public.hc_messages_sender_client_request_uidx') is not null
     or to_regclass('public.hc_visit_reservations_jobseeker_client_request_uidx') is not null then
    raise exception 'HC_NATIVE_IDEMPOTENCY_INDEX_ALREADY_EXISTS';
  end if;
end
$baseline$;

alter table public.hc_messages
  add column client_request_id uuid,
  add column client_request_fingerprint text;

alter table public.hc_messages
  add constraint hc_messages_client_request_fingerprint_check
  check (
    client_request_fingerprint is null
    or client_request_fingerprint ~ '^[0-9a-f]{64}$'
  );

create unique index hc_messages_sender_client_request_uidx
  on public.hc_messages(sender_clerk_user_id, client_request_id)
  where client_request_id is not null;

alter table public.hc_visit_reservations
  add column client_request_id uuid,
  add column client_request_fingerprint text;

alter table public.hc_visit_reservations
  add constraint hc_visit_reservations_client_request_fingerprint_check
  check (
    client_request_fingerprint is null
    or client_request_fingerprint ~ '^[0-9a-f]{64}$'
  );

create unique index hc_visit_reservations_jobseeker_client_request_uidx
  on public.hc_visit_reservations(jobseeker_clerk_user_id, client_request_id)
  where client_request_id is not null;

create or replace function public.hc_send_message_v2(
  p_application_id uuid,
  p_body text,
  p_client_request_id uuid
)
returns public.hc_messages
language plpgsql
security invoker
set search_path = public, ho_private, pg_temp
as $$
declare
  v_actor text := ho_private.current_clerk_user_id();
  v_existing public.hc_messages%rowtype;
  v_message public.hc_messages%rowtype;
  v_body text := trim(coalesce(p_body, ''));
  v_fingerprint text;
  v_existing_application_id uuid;
begin
  if v_actor is null then
    raise exception 'ログインが必要です。' using errcode='42501';
  end if;
  if p_application_id is null then
    raise exception 'application_id is required' using errcode='22023';
  end if;
  if p_client_request_id is null then
    raise exception 'client_request_id is required' using errcode='22023';
  end if;

  -- Normalize only for deterministic retry identity. Canonical mutation remains
  -- authoritative for business validation and authorization.
  v_fingerprint := pg_catalog.encode(
    extensions.digest(
      jsonb_build_array(p_application_id::text, v_body)::text,
      'sha256'
    ),
    'hex'
  );

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      v_actor || '|message|' || p_client_request_id::text,
      0
    )
  );

  select m.*
    into v_existing
    from public.hc_messages m
   where m.sender_clerk_user_id=v_actor
     and m.client_request_id=p_client_request_id
   limit 1;

  if found then
    select t.application_id
      into v_existing_application_id
      from public.hc_message_threads t
     where t.id=v_existing.thread_id;

    if v_existing_application_id is distinct from p_application_id
       or v_existing.body is distinct from v_body
       or (
         v_existing.client_request_fingerprint is not null
         and v_existing.client_request_fingerprint is distinct from v_fingerprint
       ) then
      raise exception 'IDEMPOTENCY_KEY_CONFLICT';
    end if;

    if v_existing.client_request_fingerprint is null then
      update public.hc_messages
         set client_request_fingerprint=v_fingerprint
       where id=v_existing.id
         and sender_clerk_user_id=v_actor;
      v_existing.client_request_fingerprint := v_fingerprint;
    end if;

    return v_existing;
  end if;

  -- IMPORTANT: delegate the actual command to the Web/API-owned canonical RPC.
  -- Do not repeat thread creation, actor-role, tenant, or message insert logic here.
  v_message := public.hc_send_message(p_application_id, v_body);

  update public.hc_messages
     set client_request_id=p_client_request_id,
         client_request_fingerprint=v_fingerprint
   where id=v_message.id
     and sender_clerk_user_id=v_actor
   returning * into v_message;

  if not found then
    raise exception 'メッセージの再送識別子を保存できませんでした。';
  end if;

  return v_message;
end;
$$;

revoke all on function public.hc_send_message_v2(uuid,text,uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.hc_send_message_v2(uuid,text,uuid)
  to authenticated;

create or replace function public.hc_request_visit_v2(
  p_job_id uuid,
  p_experience_type text,
  p_local_date date,
  p_local_time time without time zone,
  p_application_id uuid default null,
  p_candidate_message text default null,
  p_client_request_id uuid default null
)
returns uuid
language plpgsql
security invoker
set search_path = public, ho_private, pg_temp
as $$
declare
  v_actor text := ho_private.current_clerk_user_id();
  v_existing public.hc_visit_reservations%rowtype;
  v_id uuid;
  v_candidate_message text := nullif(btrim(coalesce(p_candidate_message,'')), '');
  v_fingerprint text;
begin
  if v_actor is null or v_actor='' then
    raise exception '認証が必要です。' using errcode='42501';
  end if;
  if p_client_request_id is null then
    raise exception 'client_request_id is required' using errcode='22023';
  end if;

  v_fingerprint := pg_catalog.encode(
    extensions.digest(
      jsonb_build_array(
        p_job_id::text,
        p_experience_type,
        p_local_date::text,
        p_local_time::text,
        p_application_id::text,
        v_candidate_message
      )::text,
      'sha256'
    ),
    'hex'
  );

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      v_actor || '|visit|' || p_client_request_id::text,
      0
    )
  );

  select r.*
    into v_existing
    from public.hc_visit_reservations r
   where r.jobseeker_clerk_user_id=v_actor
     and r.client_request_id=p_client_request_id
   limit 1;

  if found then
    if v_existing.client_request_fingerprint is null then
      raise exception 'IDEMPOTENCY_LEGACY_ROW_UNVERIFIABLE';
    end if;
    if v_existing.client_request_fingerprint is distinct from v_fingerprint then
      raise exception 'IDEMPOTENCY_KEY_CONFLICT';
    end if;
    return v_existing.id;
  end if;

  -- IMPORTANT: delegate visit availability, ownership, schedule, and insertion
  -- semantics to the existing Web/API-owned public canonical RPC.
  v_id := public.hc_request_visit(
    p_job_id,
    p_experience_type,
    p_local_date,
    p_local_time,
    p_application_id,
    v_candidate_message
  );

  update public.hc_visit_reservations
     set client_request_id=p_client_request_id,
         client_request_fingerprint=v_fingerprint
   where id=v_id
     and jobseeker_clerk_user_id=v_actor;

  if not found then
    raise exception '予約の再送識別子を保存できませんでした。';
  end if;

  return v_id;
end;
$$;

revoke all on function public.hc_request_visit_v2(
  uuid,text,date,time without time zone,uuid,text,uuid
) from public, anon, authenticated, service_role;
grant execute on function public.hc_request_visit_v2(
  uuid,text,date,time without time zone,uuid,text,uuid
) to authenticated;

commit;
