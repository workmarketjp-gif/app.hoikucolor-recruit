-- Hoiku Color Native App — account-deletion Push quarantine v1.
-- Source only. Must run after Native Push pipeline v4 and account-deletion write freeze v1.
--
-- Once a candidate requests Hoiku Color account deletion, immediately remove every
-- routable HC jobseeker Push token in the SAME transaction as the request and
-- suppress outstanding unsent deliveries. Poppy / Hoiku Office Push identities
-- are untouched because every mutation is scoped to app_key='hoiku_color_jobseeker'.
--
-- The existing Push pipeline already fail-closes on revoked/unauthorized/tokenless
-- installations at enqueue/reconcile/claim/pre-send validation. This migration
-- verifies that contract before relying on it instead of duplicating Push logic.
-- Canonical public.hc_notifications rows remain unchanged.
begin;

do $$
declare
  v_request_def text;
  v_enqueue_def text;
  v_reconcile_def text;
  v_claim_def text;
  v_validate_def text;
begin
  if to_regclass('hc_private.mobile_installations') is null
     or to_regclass('hc_private.mobile_push_deliveries') is null
     or to_regclass('public.hc_jobseeker_account_deletion_requests') is null
     or to_regprocedure('hc_private.jobseeker_account_is_frozen_v1(text)') is null
     or to_regprocedure('hc_private.lock_jobseeker_account_deletion_v1(text)') is null
     or to_regprocedure('public.hc_jobseeker_request_account_deletion_v1()') is null
     or to_regprocedure('hc_private.enqueue_jobseeker_mobile_push_v1()') is null
     or to_regprocedure('public.hc_mobile_reconcile_push_queue_v1(integer)') is null
     or to_regprocedure('public.hc_mobile_claim_push_batch_v1(text,integer)') is null
     or to_regprocedure('public.hc_mobile_validate_push_claim_v1(uuid,text)') is null then
    raise exception 'HC_NATIVE_ACCOUNT_DELETION_PUSH_BASELINE_MISSING';
  end if;

  select pg_get_functiondef('public.hc_jobseeker_request_account_deletion_v1()'::regprocedure)
    into v_request_def;
  if position('hc-account-delete|' in v_request_def)=0 then
    raise exception 'HC_NATIVE_ACCOUNT_DELETION_REQUEST_LOCK_DRIFT';
  end if;

  select pg_get_functiondef('hc_private.enqueue_jobseeker_mobile_push_v1()'::regprocedure)
    into v_enqueue_def;
  select pg_get_functiondef('public.hc_mobile_reconcile_push_queue_v1(integer)'::regprocedure)
    into v_reconcile_def;
  select pg_get_functiondef('public.hc_mobile_claim_push_batch_v1(text,integer)'::regprocedure)
    into v_claim_def;
  select pg_get_functiondef('public.hc_mobile_validate_push_claim_v1(uuid,text)'::regprocedure)
    into v_validate_def;

  -- Every path that can create/expose a provider token must still depend on an
  -- active HC installation. If that canonical Push contract drifts, fail closed.
  if position('i.revoked_at is null' in lower(v_enqueue_def))=0
     or position('i.notifications_authorized' in lower(v_enqueue_def))=0
     or position('i.push_token is not null' in lower(v_enqueue_def))=0
     or position('i.revoked_at is null' in lower(v_reconcile_def))=0
     or position('i.notifications_authorized' in lower(v_reconcile_def))=0
     or position('i.push_token is not null' in lower(v_reconcile_def))=0
     or position('i.revoked_at is null' in lower(v_claim_def))=0
     or position('i.notifications_authorized' in lower(v_claim_def))=0
     or position('i.push_token is not null' in lower(v_claim_def))=0
     or position('i.revoked_at is null' in lower(v_validate_def))=0
     or position('i.notifications_authorized' in lower(v_validate_def))=0
     or position('i.push_token is not null' in lower(v_validate_def))=0 then
    raise exception 'HC_NATIVE_PUSH_ACTIVE_INSTALLATION_CONTRACT_DRIFT';
  end if;
end $$;

-- Recreate only the deletion request boundary. Business deletion state and the
-- existing per-principal advisory lock remain canonical; this adds Native delivery
-- quarantine atomically. Cancellation intentionally does NOT auto-reactivate Push:
-- a safe Native session must obtain permission/token again and re-register.
create or replace function public.hc_jobseeker_request_account_deletion_v1()
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  a text:=nullif(trim(coalesce(ho_private.current_clerk_user_id(),'')),'');
  h text;
  r public.hc_jobseeker_account_deletion_requests%rowtype;
begin
  if a is null then
    raise exception 'AUTH_REQUIRED' using errcode='42501';
  end if;

  h:=hc_private.jobseeker_principal_hash_v3(a);
  perform pg_advisory_xact_lock(hashtextextended('hc-account-delete|'||a,0));

  select * into r
    from public.hc_jobseeker_account_deletion_requests x
   where (x.clerk_user_id=a and x.status in ('requested','processing','failed'))
      or (x.principal_hash=h and x.status='completed')
   order by x.requested_at desc,x.id desc
   limit 1;

  if not found then
    insert into public.hc_jobseeker_account_deletion_requests(clerk_user_id,principal_hash)
    values(a,h)
    returning * into r;
  end if;

  -- Exact revoke shape is intentionally allowed by the write-freeze trigger.
  update hc_private.mobile_installations i
     set push_token=null,
         notifications_authorized=false,
         revoked_at=coalesce(i.revoked_at,now()),
         updated_at=now()
   where i.app_key='hoiku_color_jobseeker'
     and i.recipient_clerk_user_id=a
     and (i.push_token is not null or i.notifications_authorized or i.revoked_at is null);

  -- Suppress all provider work that has not reached a successful send ticket.
  -- If a worker already claimed a row, clearing claimed_by/status also makes the
  -- worker's normal pre-send validation fail after this transaction commits.
  update hc_private.mobile_push_deliveries d
     set status='suppressed',
         last_error_code='ACCOUNT_DELETION_REQUESTED',
         locked_at=null,
         claimed_by=null,
         updated_at=now()
   where d.app_key='hoiku_color_jobseeker'
     and d.status in ('queued','failed','processing')
     and exists (
       select 1
         from hc_private.mobile_installations i
        where i.id=d.installation_row_id
          and i.app_key='hoiku_color_jobseeker'
          and i.recipient_clerk_user_id=a
     );

  -- A provider ticket already accepted cannot be recalled. Do not resend it and
  -- stop receipt polling; this is bookkeeping quarantine, not a claim that an
  -- already-sent notification can be retracted from the OS/provider.
  update hc_private.mobile_push_deliveries d
     set receipt_state='error',
         receipt_available_at=null,
         receipt_locked_at=null,
         receipt_claimed_by=null,
         receipt_checked_at=now(),
         receipt_error_code='ACCOUNT_DELETION_REQUESTED',
         updated_at=now()
   where d.app_key='hoiku_color_jobseeker'
     and d.status='sent'
     and d.receipt_state in ('pending','checking')
     and exists (
       select 1
         from hc_private.mobile_installations i
        where i.id=d.installation_row_id
          and i.app_key='hoiku_color_jobseeker'
          and i.recipient_clerk_user_id=a
     );

  return jsonb_build_object(
    'id',r.id,
    'status',r.status,
    'processing_stage',r.processing_stage,
    'requested_at',r.requested_at,
    'updated_at',r.updated_at,
    'completed_at',r.completed_at,
    'cancelled_at',r.cancelled_at
  );
end $$;

revoke all on function public.hc_jobseeker_request_account_deletion_v1()
  from public,anon;
grant execute on function public.hc_jobseeker_request_account_deletion_v1()
  to authenticated;

-- If this migration is applied after a deletion request already exists, converge
-- the residual HC Native Push state immediately. Never touch other app keys.
update hc_private.mobile_installations i
   set push_token=null,
       notifications_authorized=false,
       revoked_at=coalesce(i.revoked_at,now()),
       updated_at=now()
 where i.app_key='hoiku_color_jobseeker'
   and hc_private.jobseeker_account_is_frozen_v1(i.recipient_clerk_user_id);

update hc_private.mobile_push_deliveries d
   set status='suppressed',
       last_error_code='ACCOUNT_DELETION_REQUESTED',
       locked_at=null,
       claimed_by=null,
       updated_at=now()
 where d.app_key='hoiku_color_jobseeker'
   and d.status in ('queued','failed','processing')
   and exists (
     select 1
       from hc_private.mobile_installations i
      where i.id=d.installation_row_id
        and i.app_key='hoiku_color_jobseeker'
        and hc_private.jobseeker_account_is_frozen_v1(i.recipient_clerk_user_id)
   );

update hc_private.mobile_push_deliveries d
   set receipt_state='error',
       receipt_available_at=null,
       receipt_locked_at=null,
       receipt_claimed_by=null,
       receipt_checked_at=now(),
       receipt_error_code='ACCOUNT_DELETION_REQUESTED',
       updated_at=now()
 where d.app_key='hoiku_color_jobseeker'
   and d.status='sent'
   and d.receipt_state in ('pending','checking')
   and exists (
     select 1
       from hc_private.mobile_installations i
      where i.id=d.installation_row_id
        and i.app_key='hoiku_color_jobseeker'
        and hc_private.jobseeker_account_is_frozen_v1(i.recipient_clerk_user_id)
   );

commit;
