-- Hoiku Color Native App — mobile idempotency v5.
-- Rebased on the live HC production schema inspected 2026-09-19 after
-- 20260919060410_hc_admin_offer_response_state_safe_read_v2.
--
-- Scope is intentionally narrow: Native retry identity for candidate messages
-- and visit/trial requests. Business rules stay in the existing Web/API-owned
-- canonical RPCs. This migration does not apply itself; GitHub main is the source
-- prepared for the controlled backend release step.
--
-- Retry metadata lives in a private receipt table rather than modifying the
-- canonical hc_messages / hc_visit_reservations tables. This is deliberate:
-- authenticated currently has INSERT/SELECT (not UPDATE) on hc_messages and
-- SELECT (not UPDATE) on hc_visit_reservations, so a SECURITY INVOKER wrapper
-- must not depend on post-insert UPDATE privileges. The v2 wrappers use a narrow
-- SECURITY DEFINER boundary, authenticate from auth.jwt(), then delegate the
-- actual business mutation to the existing canonical Web/API RPCs.
--
-- Supersedes Prepared-only v1/v2/v3/v4 Native idempotency candidates and the
-- earlier un-applied v5 draft that attached retry columns to canonical tables.

begin;

create schema if not exists hc_private;

do $baseline$
begin
  if to_regprocedure('public.hc_send_message(uuid,text)') is null then
    raise exception 'HC_NATIVE_CANONICAL_SEND_MESSAGE_MISSING';
  end if;
  if to_regprocedure('public.hc_request_visit(uuid,text,date,time without time zone,uuid,text)') is null then
    raise exception 'HC_NATIVE_CANONICAL_REQUEST_VISIT_MISSING';
  end if;

  if to_regprocedure('public.hc_send_message_v2(uuid,text,uuid)') is not null
     or to_regprocedure('public.hc_request_visit_v2(uuid,text,date,time without time zone,uuid,text,uuid)') is not null
     or to_regprocedure('public.hc_jobseeker_get_mutation_receipt_v1(text,uuid)') is not null then
    raise exception 'HC_NATIVE_IDEMPOTENCY_RPC_ALREADY_EXISTS';
  end if;

  if to_regclass('hc_private.mobile_mutation_receipts') is not null then
    raise exception 'HC_NATIVE_IDEMPOTENCY_RECEIPT_TABLE_ALREADY_EXISTS';
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
end
$baseline$;

create table hc_private.mobile_mutation_receipts (
  app_key text not null default 'hoiku_color_jobseeker'
    check (app_key = 'hoiku_color_jobseeker'),
  recipient_clerk_user_id text not null,
  mutation_kind text not null check (mutation_kind in ('message','visit')),
  client_request_id uuid not null,
  payload_fingerprint text not null
    check (payload_fingerprint ~ '^[0-9a-f]{64}$'),
  resource_id uuid not null,
  application_id uuid,
  job_id uuid,
  created_at timestamptz not null default now(),
  primary key (app_key, recipient_clerk_user_id, mutation_kind, client_request_id)
);

alter table hc_private.mobile_mutation_receipts enable row level security;
revoke all on table hc_private.mobile_mutation_receipts
  from public, anon, authenticated, service_role;

create index hc_mobile_mutation_receipts_resource_idx
  on hc_private.mobile_mutation_receipts(app_key, mutation_kind, resource_id);

create or replace function public.hc_send_message_v2(
  p_application_id uuid,
  p_body text,
  p_client_request_id uuid
)
returns public.hc_messages
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor text := nullif((select auth.jwt()) ->> 'sub', '');
  v_receipt hc_private.mobile_mutation_receipts%rowtype;
  v_message public.hc_messages%rowtype;
  v_body text := trim(coalesce(p_body, ''));
  v_fingerprint text;
begin
  if v_actor is null then
    raise exception 'AUTH_REQUIRED' using errcode='42501';
  end if;
  if p_application_id is null then
    raise exception 'application_id is required' using errcode='22023';
  end if;
  if p_client_request_id is null then
    raise exception 'client_request_id is required' using errcode='22023';
  end if;

  v_fingerprint := pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(
        pg_catalog.jsonb_build_array(p_application_id::text, v_body)::text,
        'UTF8'
      ),
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

  select r.*
    into v_receipt
    from hc_private.mobile_mutation_receipts r
   where r.app_key='hoiku_color_jobseeker'
     and r.recipient_clerk_user_id=v_actor
     and r.mutation_kind='message'
     and r.client_request_id=p_client_request_id;

  if found then
    if v_receipt.payload_fingerprint is distinct from v_fingerprint
       or v_receipt.application_id is distinct from p_application_id then
      raise exception 'IDEMPOTENCY_KEY_CONFLICT';
    end if;

    select m.*
      into v_message
      from public.hc_messages m
     where m.id=v_receipt.resource_id
       and m.sender_clerk_user_id=v_actor;
    if not found then
      raise exception 'IDEMPOTENCY_RECEIPT_RESOURCE_MISSING';
    end if;
    return v_message;
  end if;

  v_message := public.hc_send_message(p_application_id, v_body);

  if v_message.id is null or v_message.sender_clerk_user_id is distinct from v_actor then
    raise exception 'CANONICAL_MESSAGE_RESULT_INVALID';
  end if;

  insert into hc_private.mobile_mutation_receipts(
    app_key,
    recipient_clerk_user_id,
    mutation_kind,
    client_request_id,
    payload_fingerprint,
    resource_id,
    application_id,
    job_id
  ) values (
    'hoiku_color_jobseeker',
    v_actor,
    'message',
    p_client_request_id,
    v_fingerprint,
    v_message.id,
    p_application_id,
    null
  );

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
security definer
set search_path = ''
as $$
declare
  v_actor text := nullif((select auth.jwt()) ->> 'sub', '');
  v_receipt hc_private.mobile_mutation_receipts%rowtype;
  v_id uuid;
  v_candidate_message text := nullif(btrim(coalesce(p_candidate_message,'')), '');
  v_fingerprint text;
begin
  if v_actor is null then
    raise exception 'AUTH_REQUIRED' using errcode='42501';
  end if;
  if p_client_request_id is null then
    raise exception 'client_request_id is required' using errcode='22023';
  end if;

  v_fingerprint := pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(
        pg_catalog.jsonb_build_array(
          p_job_id::text,
          p_experience_type,
          p_local_date::text,
          p_local_time::text,
          p_application_id::text,
          v_candidate_message
        )::text,
        'UTF8'
      ),
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
    into v_receipt
    from hc_private.mobile_mutation_receipts r
   where r.app_key='hoiku_color_jobseeker'
     and r.recipient_clerk_user_id=v_actor
     and r.mutation_kind='visit'
     and r.client_request_id=p_client_request_id;

  if found then
    if v_receipt.payload_fingerprint is distinct from v_fingerprint
       or v_receipt.application_id is distinct from p_application_id
       or v_receipt.job_id is distinct from p_job_id then
      raise exception 'IDEMPOTENCY_KEY_CONFLICT';
    end if;

    if not exists (
      select 1
        from public.hc_visit_reservations r
       where r.id=v_receipt.resource_id
         and r.jobseeker_clerk_user_id=v_actor
    ) then
      raise exception 'IDEMPOTENCY_RECEIPT_RESOURCE_MISSING';
    end if;
    return v_receipt.resource_id;
  end if;

  v_id := public.hc_request_visit(
    p_job_id,
    p_experience_type,
    p_local_date,
    p_local_time,
    p_application_id,
    v_candidate_message
  );

  if v_id is null or not exists (
    select 1
      from public.hc_visit_reservations r
     where r.id=v_id
       and r.jobseeker_clerk_user_id=v_actor
  ) then
    raise exception 'CANONICAL_VISIT_RESULT_INVALID';
  end if;

  insert into hc_private.mobile_mutation_receipts(
    app_key,
    recipient_clerk_user_id,
    mutation_kind,
    client_request_id,
    payload_fingerprint,
    resource_id,
    application_id,
    job_id
  ) values (
    'hoiku_color_jobseeker',
    v_actor,
    'visit',
    p_client_request_id,
    v_fingerprint,
    v_id,
    p_application_id,
    p_job_id
  );

  return v_id;
end;
$$;

revoke all on function public.hc_request_visit_v2(
  uuid,text,date,time without time zone,uuid,text,uuid
) from public, anon, authenticated, service_role;
grant execute on function public.hc_request_visit_v2(
  uuid,text,date,time without time zone,uuid,text,uuid
) to authenticated;

create or replace function public.hc_jobseeker_get_mutation_receipt_v1(
  p_kind text,
  p_client_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor text := nullif((select auth.jwt()) ->> 'sub', '');
  v_receipt hc_private.mobile_mutation_receipts%rowtype;
begin
  if v_actor is null then
    raise exception 'AUTH_REQUIRED' using errcode='42501';
  end if;
  if p_kind not in ('message','visit') then
    raise exception 'INVALID_MUTATION_KIND' using errcode='22023';
  end if;
  if p_client_request_id is null then
    raise exception 'client_request_id is required' using errcode='22023';
  end if;

  select r.*
    into v_receipt
    from hc_private.mobile_mutation_receipts r
   where r.app_key='hoiku_color_jobseeker'
     and r.recipient_clerk_user_id=v_actor
     and r.mutation_kind=p_kind
     and r.client_request_id=p_client_request_id;

  if not found then
    return pg_catalog.jsonb_build_object(
      'kind', p_kind,
      'committed', false,
      'resourceId', null,
      'applicationId', null,
      'jobId', null,
      'createdAt', null
    );
  end if;

  return pg_catalog.jsonb_build_object(
    'kind', v_receipt.mutation_kind,
    'committed', true,
    'resourceId', v_receipt.resource_id,
    'applicationId', v_receipt.application_id,
    'jobId', v_receipt.job_id,
    'createdAt', v_receipt.created_at
  );
end;
$$;

revoke all on function public.hc_jobseeker_get_mutation_receipt_v1(text,uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.hc_jobseeker_get_mutation_receipt_v1(text,uuid)
  to authenticated;

commit;
