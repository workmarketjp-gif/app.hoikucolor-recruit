-- Hoiku Color Native App — candidate-safe push pipeline v4.
-- Rebased against the live HC production schema inspected 2026-09-19 after
-- 20260919072453_hc_effective_job_deadline_status_v1.
--
-- Owns only Native delivery mechanics: installation fan-out, unread badge count,
-- notification-id -> Native route composition, worker claims/retry, stale
-- suppression, and Expo ticket receipt reconciliation.
--
-- Canonical notification creation/read state remains public.hc_notifications and
-- the existing HC Web/API notification functions. No application/message/visit/
-- interview/offer business transition is reimplemented here.
--
-- Privacy rule: provider workers receive only push provider/token + opaque
-- notification UUID. Notification title/body, message body, profile/contact data,
-- application content and facility names are never returned to the worker. The
-- lock-screen payload is intentionally generic and the App resolves the target
-- after authenticating the candidate.

begin;

-- Foundation v3 must be applied first. Fail closed rather than creating a second
-- installation model that could mix Poppy/staff and Hoiku Color jobseeker tokens.
do $baseline$
declare
  v_list_def text;
  v_list_secdef boolean;
begin
  if to_regclass('hc_private.mobile_installations') is null
     or to_regclass('hc_private.mobile_release_policy') is null then
    raise exception 'HC_NATIVE_MOBILE_FOUNDATION_REQUIRED';
  end if;

  if to_regclass('hc_private.mobile_push_deliveries') is not null
     or to_regprocedure('public.hc_jobseeker_get_unread_notification_count_v1()') is not null
     or to_regprocedure('public.hc_jobseeker_resolve_notification_route_v1(uuid)') is not null
     or to_regprocedure('public.hc_mobile_claim_push_batch_v1(text,integer)') is not null
     or to_regprocedure('public.hc_mobile_complete_push_delivery_v1(uuid,text,text,text,text)') is not null
     or to_regprocedure('public.hc_mobile_claim_push_receipts_v1(text,integer)') is not null
     or to_regprocedure('public.hc_mobile_complete_push_receipt_v1(uuid,text,text,text)') is not null then
    raise exception 'HC_NATIVE_PUSH_PIPELINE_ALREADY_EXISTS';
  end if;

  -- Assert the current Web/API candidate notification boundary rather than
  -- replacing it. These markers match the production definition inspected on
  -- 2026-09-19 and protect this Native helper from silently drifting looser.
  select pg_get_functiondef(p.oid), p.prosecdef
    into v_list_def, v_list_secdef
    from pg_proc p
   where p.oid = to_regprocedure('public.hc_jobseeker_list_notifications(integer)');

  if v_list_def is null then
    raise exception 'HC_NATIVE_NOTIFICATION_BASELINE_MISSING';
  end if;
  v_list_def := lower(v_list_def);

  if not coalesce(v_list_secdef,false)
     or position('n.audience = ''jobseeker''' in v_list_def)=0
     or position('n.recipient_clerk_user_id = ho_private.current_clerk_user_id()' in v_list_def)=0
     or position('from public.hc_applications' in v_list_def)=0
     or position('a.jobseeker_clerk_user_id = ho_private.current_clerk_user_id()' in v_list_def)=0
     or position('from public.hc_scout_invitations' in v_list_def)=0
     or position('from public.hc_visit_reservations' in v_list_def)=0
     or position('from public.hc_spot_assignments' in v_list_def)=0 then
    raise exception 'HC_NATIVE_NOTIFICATION_BASELINE_DRIFT';
  end if;
end
$baseline$;

-- Internal visibility predicate with an explicit recipient is required because
-- the service-role dispatcher has no candidate JWT. It reproduces only the
-- existing Web/API ownership boundary, not workflow or ranking logic.
create or replace function hc_private.jobseeker_notification_visible_for_recipient_v1(
  p_recipient_clerk_user_id text,
  p_application_id uuid,
  p_notification_type text,
  p_event_key text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select nullif(p_recipient_clerk_user_id,'') is not null
    and (
      p_application_id is null
      or exists (
        select 1
          from public.hc_applications a
         where a.id=p_application_id
           and a.jobseeker_clerk_user_id=p_recipient_clerk_user_id
      )
    )
    and (
      coalesce(p_notification_type,'') <> 'scout_received'
      or exists (
        select 1
          from public.hc_scout_invitations s
         where s.recipient_clerk_user_id=p_recipient_clerk_user_id
           and p_event_key='jobseeker:scout:' || s.id::text || ':received'
      )
    )
    and (
      coalesce(p_notification_type,'') not in (
        'visit_confirmed','visit_declined','visit_cancelled','visit_completed','visit_no_show'
      )
      or exists (
        select 1
          from public.hc_visit_reservations v
         where v.jobseeker_clerk_user_id=p_recipient_clerk_user_id
           and p_event_key like 'jobseeker:visit:' || v.id::text || ':%'
      )
    )
    and (
      coalesce(p_notification_type,'') not in (
        'spot_confirmed','spot_cancelled','spot_completed','spot_no_show'
      )
      or exists (
        select 1
          from public.hc_spot_assignments s
         where s.jobseeker_clerk_user_id=p_recipient_clerk_user_id
           and p_event_key like 'jobseeker:spot:' || s.id::text || ':%'
      )
    );
$$;

revoke all on function hc_private.jobseeker_notification_visible_for_recipient_v1(text,uuid,text,text)
  from public, anon, authenticated, service_role;

create or replace function hc_private.jobseeker_notification_visible_v1(
  p_application_id uuid,
  p_notification_type text,
  p_event_key text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select hc_private.jobseeker_notification_visible_for_recipient_v1(
    nullif((select auth.jwt()) ->> 'sub',''),
    p_application_id,
    p_notification_type,
    p_event_key
  );
$$;

revoke all on function hc_private.jobseeker_notification_visible_v1(uuid,text,text)
  from public, anon, authenticated, service_role;

-- Exact canonical unread count for Native badge reconciliation.
create or replace function public.hc_jobseeker_get_unread_notification_count_v1()
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor text := nullif((select auth.jwt()) ->> 'sub','');
  v_count integer;
begin
  if v_actor is null then
    raise exception 'AUTH_REQUIRED' using errcode='42501';
  end if;

  select count(*)::integer
    into v_count
    from public.hc_notifications n
   where n.audience='jobseeker'
     and n.recipient_clerk_user_id=v_actor
     and n.read_at is null
     and hc_private.jobseeker_notification_visible_for_recipient_v1(
       v_actor,n.application_id,n.notification_type,n.event_key
     );

  return v_count;
end;
$$;

revoke all on function public.hc_jobseeker_get_unread_notification_count_v1()
  from public, anon, authenticated, service_role;
grant execute on function public.hc_jobseeker_get_unread_notification_count_v1()
  to authenticated;

-- Resolve only an opaque notification UUID after candidate authentication.
-- Native never trusts Web link_url as a client-side route. Server-side event_key
-- ownership is used for visit/spot/scout; interview identity is also re-proved
-- against the candidate-owned application before returning it.
create or replace function public.hc_jobseeker_resolve_notification_route_v1(
  p_notification_id uuid
)
returns table(
  route_key text,
  route_params jsonb,
  notification_type text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor text := nullif((select auth.jwt()) ->> 'sub','');
  v_notification public.hc_notifications%rowtype;
  v_visit_id uuid;
  v_visit_job_id uuid;
  v_spot_assignment_id uuid;
  v_scout_id uuid;
  v_scout_job_id uuid;
  v_interview_id uuid;
begin
  if v_actor is null then
    raise exception 'AUTH_REQUIRED' using errcode='42501';
  end if;
  if p_notification_id is null then
    raise exception 'NOTIFICATION_ID_REQUIRED' using errcode='22023';
  end if;

  select n.*
    into v_notification
    from public.hc_notifications n
   where n.id=p_notification_id
     and n.audience='jobseeker'
     and n.recipient_clerk_user_id=v_actor
     and hc_private.jobseeker_notification_visible_for_recipient_v1(
       v_actor,n.application_id,n.notification_type,n.event_key
     );

  if not found then
    raise exception 'NOTIFICATION_NOT_FOUND' using errcode='P0002';
  end if;

  if v_notification.notification_type in (
    'visit_confirmed','visit_declined','visit_cancelled','visit_completed','visit_no_show'
  ) then
    select v.id,v.job_id
      into v_visit_id,v_visit_job_id
      from public.hc_visit_reservations v
     where v.jobseeker_clerk_user_id=v_actor
       and v_notification.event_key like 'jobseeker:visit:' || v.id::text || ':%'
     limit 1;
    if v_visit_id is null then
      raise exception 'VISIT_ROUTE_NOT_FOUND' using errcode='P0002';
    end if;
  end if;

  if v_notification.notification_type in (
    'spot_confirmed','spot_cancelled','spot_completed','spot_no_show'
  ) then
    select s.id
      into v_spot_assignment_id
      from public.hc_spot_assignments s
     where s.jobseeker_clerk_user_id=v_actor
       and v_notification.event_key like 'jobseeker:spot:' || s.id::text || ':%'
     limit 1;
    if v_spot_assignment_id is null then
      raise exception 'SPOT_ROUTE_NOT_FOUND' using errcode='P0002';
    end if;
  end if;

  if v_notification.notification_type='scout_received' then
    select s.id,s.job_id
      into v_scout_id,v_scout_job_id
      from public.hc_scout_invitations s
     where s.recipient_clerk_user_id=v_actor
       and v_notification.event_key='jobseeker:scout:' || s.id::text || ':received'
     limit 1;
    if v_scout_id is null then
      raise exception 'SCOUT_ROUTE_NOT_FOUND' using errcode='P0002';
    end if;
  end if;

  if v_notification.notification_type like 'interview_%'
     and v_notification.application_id is not null then
    select i.id
      into v_interview_id
      from public.hc_interviews i
      join public.hc_applications a on a.id=i.application_id
     where i.application_id=v_notification.application_id
       and a.jobseeker_clerk_user_id=v_actor
       and v_notification.event_key like 'jobseeker:interview:' || i.id::text || ':%'
     limit 1;
    if v_interview_id is null then
      raise exception 'INTERVIEW_ROUTE_NOT_FOUND' using errcode='P0002';
    end if;
  end if;

  return query
  select
    case
      when v_notification.notification_type='message_received' then 'application_messages'
      when v_notification.notification_type in ('application_status_changed','application_hired') then 'application_detail'
      when v_notification.notification_type like 'interview_%' then 'application_interview'
      when v_notification.notification_type like 'visit_%' then 'visits'
      when v_notification.notification_type like 'spot_%' then 'spot_assignments'
      when v_notification.notification_type='scout_received' then 'scouts'
      else 'notifications'
    end,
    jsonb_strip_nulls(jsonb_build_object(
      'notificationId',v_notification.id,
      'applicationId',v_notification.application_id,
      'visitId',v_visit_id,
      'jobId',coalesce(v_visit_job_id,v_scout_job_id),
      'spotAssignmentId',v_spot_assignment_id,
      'scoutId',v_scout_id,
      'interviewId',v_interview_id
    )),
    v_notification.notification_type;
end;
$$;

revoke all on function public.hc_jobseeker_resolve_notification_route_v1(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.hc_jobseeker_resolve_notification_route_v1(uuid)
  to authenticated;

-- Private queue stores routing identity only; never duplicate canonical content.
create table hc_private.mobile_push_deliveries (
  id uuid primary key default gen_random_uuid(),
  app_key text not null default 'hoiku_color_jobseeker'
    check (app_key='hoiku_color_jobseeker'),
  notification_id uuid not null references public.hc_notifications(id) on delete cascade,
  installation_row_id uuid not null references hc_private.mobile_installations(id) on delete cascade,
  status text not null default 'queued'
    check (status in ('queued','processing','sent','failed','invalid_token','suppressed')),
  attempt_count integer not null default 0 check (attempt_count>=0),
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  claimed_by text,
  sent_at timestamptz,
  provider_message_id text,
  last_error_code text,
  receipt_state text not null default 'not_pending'
    check (receipt_state in ('not_pending','pending','checking','ok','error')),
  receipt_attempt_count integer not null default 0 check (receipt_attempt_count>=0),
  receipt_available_at timestamptz,
  receipt_locked_at timestamptz,
  receipt_claimed_by text,
  receipt_checked_at timestamptz,
  receipt_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (app_key,notification_id,installation_row_id)
);

create index hc_mobile_push_deliveries_queue_idx
  on hc_private.mobile_push_deliveries(app_key,status,available_at,created_at)
  where status in ('queued','failed');
create index hc_mobile_push_deliveries_processing_idx
  on hc_private.mobile_push_deliveries(app_key,locked_at)
  where status='processing';
create index hc_mobile_push_receipts_queue_idx
  on hc_private.mobile_push_deliveries(app_key,receipt_available_at,sent_at)
  where status='sent' and receipt_state='pending' and provider_message_id is not null;
create index hc_mobile_push_receipts_processing_idx
  on hc_private.mobile_push_deliveries(app_key,receipt_locked_at)
  where receipt_state='checking';

alter table hc_private.mobile_push_deliveries enable row level security;
revoke all on table hc_private.mobile_push_deliveries
  from public, anon, authenticated, service_role;

-- Fan out one canonical jobseeker notification to each currently authorized HC
-- jobseeker installation. Queue uniqueness prevents duplicate insertion.
create or replace function hc_private.enqueue_jobseeker_mobile_push_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.audience <> 'jobseeker'
     or new.read_at is not null
     or not hc_private.jobseeker_notification_visible_for_recipient_v1(
       new.recipient_clerk_user_id,new.application_id,new.notification_type,new.event_key
     ) then
    return new;
  end if;

  begin
    insert into hc_private.mobile_push_deliveries(
      app_key,notification_id,installation_row_id,status,available_at
    )
    select 'hoiku_color_jobseeker',new.id,i.id,'queued',now()
      from hc_private.mobile_installations i
     where i.app_key='hoiku_color_jobseeker'
       and i.recipient_clerk_user_id=new.recipient_clerk_user_id
       and i.notifications_authorized
       and i.push_token is not null
       and i.revoked_at is null
    on conflict (app_key,notification_id,installation_row_id) do nothing;
  exception when others then
    -- Push is secondary delivery. A queue fault must never roll back the canonical
    -- application/message/visit/interview transaction that created the notification.
    return new;
  end;

  return new;
end;
$$;

revoke all on function hc_private.enqueue_jobseeker_mobile_push_v1()
  from public, anon, authenticated, service_role;

drop trigger if exists hc_notifications_enqueue_jobseeker_mobile_push_v1
  on public.hc_notifications;
create trigger hc_notifications_enqueue_jobseeker_mobile_push_v1
after insert on public.hc_notifications
for each row
execute function hc_private.enqueue_jobseeker_mobile_push_v1();

-- Repair a transient enqueue-trigger failure without coupling Native delivery to
-- the Web transaction. The bounded 15-minute window prevents a fresh install from
-- receiving a historical flood; older unread state is reconciled through the badge.
create or replace function public.hc_mobile_reconcile_push_queue_v1(
  p_limit integer default 500
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare v_count integer;
begin
  if p_limit is null or p_limit<1 or p_limit>2000 then
    raise exception 'RECONCILE_LIMIT_INVALID' using errcode='22023';
  end if;

  with missing as (
    select n.id as notification_id,i.id as installation_row_id
      from public.hc_notifications n
      join hc_private.mobile_installations i
        on i.app_key='hoiku_color_jobseeker'
       and i.recipient_clerk_user_id=n.recipient_clerk_user_id
       and i.notifications_authorized
       and i.push_token is not null
       and i.revoked_at is null
      left join hc_private.mobile_push_deliveries d
        on d.app_key='hoiku_color_jobseeker'
       and d.notification_id=n.id
       and d.installation_row_id=i.id
     where n.audience='jobseeker'
       and n.read_at is null
       and n.created_at>=now()-interval '15 minutes'
       and d.id is null
       and hc_private.jobseeker_notification_visible_for_recipient_v1(
         i.recipient_clerk_user_id,n.application_id,n.notification_type,n.event_key
       )
     order by n.created_at
     limit p_limit
  ), inserted as (
    insert into hc_private.mobile_push_deliveries(
      app_key,notification_id,installation_row_id,status,available_at
    )
    select 'hoiku_color_jobseeker',m.notification_id,m.installation_row_id,'queued',now()
      from missing m
    on conflict (app_key,notification_id,installation_row_id) do nothing
    returning 1
  )
  select count(*)::integer into v_count from inserted;

  return v_count;
end;
$$;

revoke all on function public.hc_mobile_reconcile_push_queue_v1(integer)
  from public, anon, authenticated, service_role;
grant execute on function public.hc_mobile_reconcile_push_queue_v1(integer)
  to service_role;

-- Service-role dispatch boundary. No title/body or candidate data is returned.
create or replace function public.hc_mobile_claim_push_batch_v1(
  p_worker_id text,
  p_limit integer default 50
)
returns table(
  delivery_id uuid,
  notification_id uuid,
  push_provider text,
  push_token text,
  attempt_count integer
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(trim(p_worker_id),'')='' then
    raise exception 'WORKER_ID_REQUIRED' using errcode='22023';
  end if;
  if p_limit is null or p_limit<1 or p_limit>100 then
    raise exception 'BATCH_LIMIT_INVALID' using errcode='22023';
  end if;

  return query
  with candidates as (
    select d.id
      from hc_private.mobile_push_deliveries d
      join hc_private.mobile_installations i on i.id=d.installation_row_id
      join public.hc_notifications n on n.id=d.notification_id
     where d.app_key='hoiku_color_jobseeker'
       and d.status in ('queued','failed')
       and d.available_at<=now()
       and d.attempt_count<8
       and i.app_key='hoiku_color_jobseeker'
       and i.revoked_at is null
       and i.notifications_authorized
       and i.push_token is not null
       and n.audience='jobseeker'
       and n.recipient_clerk_user_id=i.recipient_clerk_user_id
       and n.read_at is null
       and hc_private.jobseeker_notification_visible_for_recipient_v1(
         i.recipient_clerk_user_id,n.application_id,n.notification_type,n.event_key
       )
     order by d.available_at,d.created_at
     for update of d skip locked
     limit p_limit
  ), claimed as (
    update hc_private.mobile_push_deliveries d
       set status='processing',
           attempt_count=d.attempt_count+1,
           locked_at=now(),
           claimed_by=p_worker_id,
           last_error_code=null,
           updated_at=now()
      from candidates c
     where d.id=c.id
     returning d.*
  )
  select d.id,d.notification_id,i.push_provider,i.push_token,d.attempt_count
    from claimed d
    join hc_private.mobile_installations i on i.id=d.installation_row_id;
end;
$$;

revoke all on function public.hc_mobile_claim_push_batch_v1(text,integer)
  from public, anon, authenticated, service_role;
grant execute on function public.hc_mobile_claim_push_batch_v1(text,integer)
  to service_role;

create or replace function public.hc_mobile_validate_push_claim_v1(
  p_delivery_id uuid,
  p_worker_id text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from hc_private.mobile_push_deliveries d
      join hc_private.mobile_installations i on i.id=d.installation_row_id
      join public.hc_notifications n on n.id=d.notification_id
     where d.id=p_delivery_id
       and d.app_key='hoiku_color_jobseeker'
       and d.status='processing'
       and d.claimed_by=p_worker_id
       and i.app_key='hoiku_color_jobseeker'
       and i.revoked_at is null
       and i.notifications_authorized
       and i.push_token is not null
       and n.audience='jobseeker'
       and n.recipient_clerk_user_id=i.recipient_clerk_user_id
       and n.read_at is null
       and hc_private.jobseeker_notification_visible_for_recipient_v1(
         i.recipient_clerk_user_id,n.application_id,n.notification_type,n.event_key
       )
  );
$$;

revoke all on function public.hc_mobile_validate_push_claim_v1(uuid,text)
  from public, anon, authenticated, service_role;
grant execute on function public.hc_mobile_validate_push_claim_v1(uuid,text)
  to service_role;

-- A successful Expo ticket is receipt-pending, not final device delivery.
create or replace function public.hc_mobile_complete_push_delivery_v1(
  p_delivery_id uuid,
  p_worker_id text,
  p_outcome text,
  p_provider_message_id text default null,
  p_error_code text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_delivery hc_private.mobile_push_deliveries%rowtype;
  v_provider_message_id text := nullif(left(trim(coalesce(p_provider_message_id,'')),500),'');
  v_retry_delay interval;
begin
  if coalesce(trim(p_worker_id),'')='' then
    raise exception 'WORKER_ID_REQUIRED' using errcode='22023';
  end if;
  if p_outcome not in ('sent','retry','invalid_token','suppressed') then
    raise exception 'PUSH_OUTCOME_INVALID' using errcode='22023';
  end if;

  select d.* into v_delivery
    from hc_private.mobile_push_deliveries d
   where d.id=p_delivery_id
     and d.status='processing'
     and d.claimed_by=p_worker_id
   for update;
  if not found then return false; end if;

  if p_outcome='sent' then
    if v_provider_message_id is null then
      raise exception 'PROVIDER_MESSAGE_ID_REQUIRED' using errcode='22023';
    end if;
    update hc_private.mobile_push_deliveries d
       set status='sent',sent_at=now(),provider_message_id=v_provider_message_id,
           last_error_code=null,locked_at=null,claimed_by=null,
           receipt_state='pending',receipt_attempt_count=0,
           receipt_available_at=now()+interval '15 minutes',
           receipt_locked_at=null,receipt_claimed_by=null,
           receipt_checked_at=null,receipt_error_code=null,updated_at=now()
     where d.id=v_delivery.id;
    return true;
  end if;

  if p_outcome='invalid_token' then
    update hc_private.mobile_installations i
       set push_token=null,notifications_authorized=false,
           revoked_at=coalesce(i.revoked_at,now()),updated_at=now()
     where i.id=v_delivery.installation_row_id;
    update hc_private.mobile_push_deliveries d
       set status='invalid_token',
           last_error_code=left(coalesce(nullif(p_error_code,''),'PUSH_TOKEN_INVALID'),200),
           locked_at=null,claimed_by=null,receipt_state='error',
           receipt_checked_at=now(),
           receipt_error_code=left(coalesce(nullif(p_error_code,''),'PUSH_TOKEN_INVALID'),200),
           receipt_available_at=null,receipt_locked_at=null,receipt_claimed_by=null,
           updated_at=now()
     where d.id=v_delivery.id;
    return true;
  end if;

  if p_outcome='suppressed' then
    update hc_private.mobile_push_deliveries d
       set status='suppressed',
           last_error_code=left(coalesce(nullif(p_error_code,''),'PUSH_SUPPRESSED'),200),
           locked_at=null,claimed_by=null,receipt_state='error',
           receipt_checked_at=now(),
           receipt_error_code=left(coalesce(nullif(p_error_code,''),'PUSH_SUPPRESSED'),200),
           receipt_available_at=null,receipt_locked_at=null,receipt_claimed_by=null,
           updated_at=now()
     where d.id=v_delivery.id;
    return true;
  end if;

  v_retry_delay := make_interval(
    secs=>least(3600,greatest(60,(power(2,least(v_delivery.attempt_count,6))::integer*30)))
  );
  update hc_private.mobile_push_deliveries d
     set status=case when v_delivery.attempt_count>=8 then 'suppressed' else 'failed' end,
         available_at=case when v_delivery.attempt_count>=8 then d.available_at else now()+v_retry_delay end,
         provider_message_id=null,sent_at=null,
         last_error_code=left(coalesce(nullif(p_error_code,''),case when v_delivery.attempt_count>=8 then 'MAX_ATTEMPTS_EXCEEDED' else 'PUSH_SEND_FAILED' end),200),
         locked_at=null,claimed_by=null,receipt_state='not_pending',receipt_attempt_count=0,
         receipt_available_at=null,receipt_locked_at=null,receipt_claimed_by=null,
         receipt_checked_at=null,receipt_error_code=null,updated_at=now()
   where d.id=v_delivery.id;
  return true;
end;
$$;

revoke all on function public.hc_mobile_complete_push_delivery_v1(uuid,text,text,text,text)
  from public, anon, authenticated, service_role;
grant execute on function public.hc_mobile_complete_push_delivery_v1(uuid,text,text,text,text)
  to service_role;

create or replace function public.hc_mobile_release_stale_push_claims_v1()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare v_count integer;
begin
  update hc_private.mobile_push_deliveries d
     set status=case when d.attempt_count>=8 then 'suppressed' else 'failed' end,
         available_at=case when d.attempt_count>=8 then d.available_at else now()+interval '5 minutes' end,
         locked_at=null,claimed_by=null,last_error_code='STALE_WORKER_CLAIM',updated_at=now()
   where d.app_key='hoiku_color_jobseeker'
     and d.status='processing'
     and d.locked_at<now()-interval '5 minutes';
  get diagnostics v_count=row_count;
  return v_count;
end;
$$;

revoke all on function public.hc_mobile_release_stale_push_claims_v1()
  from public, anon, authenticated, service_role;
grant execute on function public.hc_mobile_release_stale_push_claims_v1()
  to service_role;

create or replace function public.hc_mobile_suppress_unroutable_push_v1()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare v_count integer;
begin
  update hc_private.mobile_push_deliveries d
     set status='suppressed',last_error_code='PUSH_NO_LONGER_DELIVERABLE',
         locked_at=null,claimed_by=null,updated_at=now()
   where d.app_key='hoiku_color_jobseeker'
     and d.status in ('queued','failed')
     and not exists (
       select 1
         from hc_private.mobile_installations i
         join public.hc_notifications n on n.id=d.notification_id
        where i.id=d.installation_row_id
          and i.app_key='hoiku_color_jobseeker'
          and i.revoked_at is null
          and i.notifications_authorized
          and i.push_token is not null
          and n.audience='jobseeker'
          and n.recipient_clerk_user_id=i.recipient_clerk_user_id
          and n.read_at is null
          and hc_private.jobseeker_notification_visible_for_recipient_v1(
            i.recipient_clerk_user_id,n.application_id,n.notification_type,n.event_key
          )
     );
  get diagnostics v_count=row_count;
  return v_count;
end;
$$;

revoke all on function public.hc_mobile_suppress_unroutable_push_v1()
  from public, anon, authenticated, service_role;
grant execute on function public.hc_mobile_suppress_unroutable_push_v1()
  to service_role;

-- Expo receipt reconciliation. Missing receipts are retried as receipt lookups
-- only; they never cause an ambiguous push resend.
create or replace function public.hc_mobile_claim_push_receipts_v1(
  p_worker_id text,
  p_limit integer default 200
)
returns table(delivery_id uuid,provider_message_id text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(trim(p_worker_id),'')='' then
    raise exception 'WORKER_ID_REQUIRED' using errcode='22023';
  end if;
  if p_limit is null or p_limit<1 or p_limit>1000 then
    raise exception 'RECEIPT_BATCH_LIMIT_INVALID' using errcode='22023';
  end if;

  return query
  with candidates as (
    select d.id
      from hc_private.mobile_push_deliveries d
     where d.app_key='hoiku_color_jobseeker'
       and d.status='sent'
       and d.receipt_state='pending'
       and d.provider_message_id is not null
       and d.receipt_available_at<=now()
     order by d.receipt_available_at,d.sent_at
     for update of d skip locked
     limit p_limit
  ), claimed as (
    update hc_private.mobile_push_deliveries d
       set receipt_state='checking',receipt_attempt_count=d.receipt_attempt_count+1,
           receipt_locked_at=now(),receipt_claimed_by=p_worker_id,updated_at=now()
      from candidates c
     where d.id=c.id
     returning d.id,d.provider_message_id
  )
  select c.id,c.provider_message_id from claimed c;
end;
$$;

revoke all on function public.hc_mobile_claim_push_receipts_v1(text,integer)
  from public, anon, authenticated, service_role;
grant execute on function public.hc_mobile_claim_push_receipts_v1(text,integer)
  to service_role;

create or replace function public.hc_mobile_complete_push_receipt_v1(
  p_delivery_id uuid,
  p_worker_id text,
  p_outcome text,
  p_error_code text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_delivery hc_private.mobile_push_deliveries%rowtype;
  v_retry_delay interval;
  v_receipt_error text := left(coalesce(nullif(trim(coalesce(p_error_code,'')),''),'PUSH_RECEIPT_ERROR'),200);
begin
  if coalesce(trim(p_worker_id),'')='' then
    raise exception 'WORKER_ID_REQUIRED' using errcode='22023';
  end if;
  if p_outcome not in ('ok','invalid_token','retry_delivery','permanent_error','not_ready') then
    raise exception 'PUSH_RECEIPT_OUTCOME_INVALID' using errcode='22023';
  end if;

  select d.* into v_delivery
    from hc_private.mobile_push_deliveries d
   where d.id=p_delivery_id
     and d.status='sent'
     and d.receipt_state='checking'
     and d.receipt_claimed_by=p_worker_id
   for update;
  if not found then return false; end if;

  if p_outcome='ok' then
    update hc_private.mobile_push_deliveries d
       set receipt_state='ok',receipt_checked_at=now(),receipt_error_code=null,
           receipt_available_at=null,receipt_locked_at=null,receipt_claimed_by=null,
           updated_at=now()
     where d.id=v_delivery.id;
    return true;
  end if;

  if p_outcome='invalid_token' then
    update hc_private.mobile_installations i
       set push_token=null,notifications_authorized=false,
           revoked_at=coalesce(i.revoked_at,now()),updated_at=now()
     where i.id=v_delivery.installation_row_id;
    update hc_private.mobile_push_deliveries d
       set status='invalid_token',last_error_code=v_receipt_error,
           receipt_state='error',receipt_checked_at=now(),receipt_error_code=v_receipt_error,
           receipt_available_at=null,receipt_locked_at=null,receipt_claimed_by=null,
           updated_at=now()
     where d.id=v_delivery.id;
    return true;
  end if;

  if p_outcome='permanent_error' then
    update hc_private.mobile_push_deliveries d
       set status='suppressed',last_error_code=v_receipt_error,
           receipt_state='error',receipt_checked_at=now(),receipt_error_code=v_receipt_error,
           receipt_available_at=null,receipt_locked_at=null,receipt_claimed_by=null,
           updated_at=now()
     where d.id=v_delivery.id;
    return true;
  end if;

  if p_outcome='retry_delivery' then
    v_retry_delay := make_interval(
      secs=>least(3600,greatest(60,(power(2,least(v_delivery.attempt_count,6))::integer*30)))
    );
    update hc_private.mobile_push_deliveries d
       set status=case when v_delivery.attempt_count>=8 then 'suppressed' else 'failed' end,
           available_at=case when v_delivery.attempt_count>=8 then d.available_at else now()+v_retry_delay end,
           provider_message_id=null,sent_at=null,last_error_code=v_receipt_error,
           receipt_state=case when v_delivery.attempt_count>=8 then 'error' else 'not_pending' end,
           receipt_checked_at=case when v_delivery.attempt_count>=8 then now() else null end,
           receipt_error_code=case when v_delivery.attempt_count>=8 then v_receipt_error else null end,
           receipt_attempt_count=0,receipt_available_at=null,receipt_locked_at=null,
           receipt_claimed_by=null,updated_at=now()
     where d.id=v_delivery.id;
    return true;
  end if;

  if v_delivery.receipt_attempt_count>=6
     or v_delivery.sent_at<now()-interval '23 hours' then
    update hc_private.mobile_push_deliveries d
       set receipt_state='error',receipt_checked_at=now(),
           receipt_error_code='RECEIPT_UNAVAILABLE',receipt_available_at=null,
           receipt_locked_at=null,receipt_claimed_by=null,updated_at=now()
     where d.id=v_delivery.id;
  else
    update hc_private.mobile_push_deliveries d
       set receipt_state='pending',receipt_available_at=now()+interval '5 minutes',
           receipt_locked_at=null,receipt_claimed_by=null,updated_at=now()
     where d.id=v_delivery.id;
  end if;
  return true;
end;
$$;

revoke all on function public.hc_mobile_complete_push_receipt_v1(uuid,text,text,text)
  from public, anon, authenticated, service_role;
grant execute on function public.hc_mobile_complete_push_receipt_v1(uuid,text,text,text)
  to service_role;

create or replace function public.hc_mobile_release_stale_push_receipt_claims_v1()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare v_count integer;
begin
  update hc_private.mobile_push_deliveries d
     set receipt_state='pending',receipt_available_at=now()+interval '5 minutes',
         receipt_locked_at=null,receipt_claimed_by=null,
         receipt_error_code='STALE_RECEIPT_CLAIM',updated_at=now()
   where d.app_key='hoiku_color_jobseeker'
     and d.receipt_state='checking'
     and d.receipt_locked_at<now()-interval '5 minutes';
  get diagnostics v_count=row_count;
  return v_count;
end;
$$;

revoke all on function public.hc_mobile_release_stale_push_receipt_claims_v1()
  from public, anon, authenticated, service_role;
grant execute on function public.hc_mobile_release_stale_push_receipt_claims_v1()
  to service_role;

commit;
