-- Hoiku Color Native App — account deletion execution v3.
-- Rebased against Production inspected 2026-09-19 after 20260919091418.
-- Source only: does not deploy the worker or delete any account until applied and invoked.
-- HC candidate data is erased/anonymized; durable Hoiku Office/Poppy workforce identity is preserved.
begin;

do $$
declare v_guard text;
begin
  if to_regclass('public.hc_jobseeker_account_deletion_requests') is not null
     or to_regprocedure('public.hc_jobseeker_request_account_deletion_v1()') is not null then
    raise exception 'HC_NATIVE_ACCOUNT_DELETION_FOUNDATION_ALREADY_EXISTS';
  end if;
  if to_regprocedure('ho_private.hc_candidate_application_identity_guard()') is null then
    raise exception 'HC_ACCOUNT_DELETION_OWNER_GUARD_MISSING';
  end if;
  select pg_get_functiondef('ho_private.hc_candidate_application_identity_guard()'::regprocedure) into v_guard;
  if strpos(v_guard,'HC_CANDIDATE_APPLICATION_OWNER_IMMUTABLE')=0
     or strpos(v_guard,'HC_CANDIDATE_APPLICATION_OWNER_REQUIRED')=0 then
    raise exception 'HC_ACCOUNT_DELETION_OWNER_GUARD_DRIFT';
  end if;
  if to_regclass('public.hc_spot_assignments') is null
     or not exists(select 1 from pg_constraint c where c.conrelid='public.hc_spot_assignments'::regclass and c.confrelid='public.hc_applications'::regclass and c.contype='f') then
    raise exception 'HC_ACCOUNT_DELETION_SPOT_RETENTION_CONTRACT_DRIFT';
  end if;
  if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='hc_applications' and column_name='candidate_offer_message') then
    raise exception 'HC_ACCOUNT_DELETION_OFFER_COLUMNS_MISSING';
  end if;
end $$;

create table public.hc_jobseeker_account_deletion_requests(
  id uuid primary key default gen_random_uuid(),
  clerk_user_id text,
  principal_hash text,
  status text not null default 'requested' check(status in ('requested','processing','completed','cancelled','failed')),
  processing_stage text not null default 'requested' check(processing_stage in ('requested','identity_freeze','storage_cleanup','database_cleanup','identity_delete','completed','cancelled','failed')),
  identity_action text check(identity_action is null or identity_action in ('delete_clerk','preserve_shared')),
  shared_identity boolean,
  requested_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  processing_started_at timestamptz, completed_at timestamptz, cancelled_at timestamptz, failed_at timestamptz,
  attempt_count integer not null default 0 check(attempt_count>=0), available_at timestamptz not null default now(),
  lease_owner text, lease_expires_at timestamptz, last_error_code text,
  check(clerk_user_id is not null or principal_hash is not null),
  check((status='completed')=(completed_at is not null)),
  check((status='cancelled')=(cancelled_at is not null)),
  check((status='failed')=(failed_at is not null))
);
create unique index hc_jobseeker_account_deletion_active_uidx on public.hc_jobseeker_account_deletion_requests(clerk_user_id)
  where clerk_user_id is not null and status in ('requested','processing','failed');
create index hc_jobseeker_account_deletion_worker_idx on public.hc_jobseeker_account_deletion_requests(status,available_at,requested_at)
  where status in ('requested','processing');
alter table public.hc_jobseeker_account_deletion_requests enable row level security;
revoke all on table public.hc_jobseeker_account_deletion_requests from public,anon,authenticated;

create or replace function hc_private.jobseeker_principal_hash_v3(p text) returns text
language sql immutable strict set search_path='' as $$select encode(extensions.digest(p,'sha256'),'hex')$$;
revoke all on function hc_private.jobseeker_principal_hash_v3(text) from public,anon,authenticated;

create or replace function hc_private.jobseeker_has_shared_identity_v3(p text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.ho_people x where x.clerk_user_id=p)
 or exists(select 1 from public.ho_profiles x where x.clerk_user_id=p)
 or exists(select 1 from public.ho_staff_members x where x.clerk_user_id=p)
 or exists(select 1 from public.ho_onboarding_states x where x.clerk_user_id=p)
$$;
revoke all on function hc_private.jobseeker_has_shared_identity_v3(text) from public,anon,authenticated;

create or replace function public.hc_jobseeker_get_account_deletion_request_v1() returns jsonb
language plpgsql security definer set search_path='' as $$
declare a text:=nullif(trim(coalesce(ho_private.current_clerk_user_id(),'')),''); h text; r public.hc_jobseeker_account_deletion_requests%rowtype;
begin
 if a is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if; h:=hc_private.jobseeker_principal_hash_v3(a);
 select * into r from public.hc_jobseeker_account_deletion_requests x where x.clerk_user_id=a or (x.principal_hash=h and x.status='completed') order by x.requested_at desc,x.id desc limit 1;
 if not found then return null; end if;
 return jsonb_build_object('id',r.id,'status',r.status,'processing_stage',r.processing_stage,'requested_at',r.requested_at,'updated_at',r.updated_at,'completed_at',r.completed_at,'cancelled_at',r.cancelled_at);
end $$;

create or replace function public.hc_jobseeker_request_account_deletion_v1() returns jsonb
language plpgsql security definer set search_path='' as $$
declare a text:=nullif(trim(coalesce(ho_private.current_clerk_user_id(),'')),''); h text; r public.hc_jobseeker_account_deletion_requests%rowtype;
begin
 if a is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if; h:=hc_private.jobseeker_principal_hash_v3(a);
 perform pg_advisory_xact_lock(hashtextextended('hc-account-delete|'||a,0));
 select * into r from public.hc_jobseeker_account_deletion_requests x where (x.clerk_user_id=a and x.status in ('requested','processing','failed')) or (x.principal_hash=h and x.status='completed') order by x.requested_at desc,x.id desc limit 1;
 if not found then insert into public.hc_jobseeker_account_deletion_requests(clerk_user_id,principal_hash) values(a,h) returning * into r; end if;
 return jsonb_build_object('id',r.id,'status',r.status,'processing_stage',r.processing_stage,'requested_at',r.requested_at,'updated_at',r.updated_at,'completed_at',r.completed_at,'cancelled_at',r.cancelled_at);
end $$;

create or replace function public.hc_jobseeker_cancel_account_deletion_v1() returns jsonb
language plpgsql security definer set search_path='' as $$
declare a text:=nullif(trim(coalesce(ho_private.current_clerk_user_id(),'')),''); r public.hc_jobseeker_account_deletion_requests%rowtype;
begin
 if a is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if; perform pg_advisory_xact_lock(hashtextextended('hc-account-delete|'||a,0));
 update public.hc_jobseeker_account_deletion_requests x set status='cancelled',processing_stage='cancelled',cancelled_at=now(),completed_at=null,failed_at=null,lease_owner=null,lease_expires_at=null,updated_at=now()
 where x.id=(select q.id from public.hc_jobseeker_account_deletion_requests q where q.clerk_user_id=a and q.status='requested' order by q.requested_at desc,q.id desc limit 1 for update) returning * into r;
 if not found then raise exception 'ACCOUNT_DELETION_REQUEST_NOT_CANCELLABLE' using errcode='P0002'; end if;
 return jsonb_build_object('id',r.id,'status',r.status,'processing_stage',r.processing_stage,'requested_at',r.requested_at,'updated_at',r.updated_at,'completed_at',r.completed_at,'cancelled_at',r.cancelled_at);
end $$;

revoke all on function public.hc_jobseeker_get_account_deletion_request_v1() from public,anon;
revoke all on function public.hc_jobseeker_request_account_deletion_v1() from public,anon;
revoke all on function public.hc_jobseeker_cancel_account_deletion_v1() from public,anon;
grant execute on function public.hc_jobseeker_get_account_deletion_request_v1() to authenticated;
grant execute on function public.hc_jobseeker_request_account_deletion_v1() to authenticated;
grant execute on function public.hc_jobseeker_cancel_account_deletion_v1() to authenticated;

-- Keep the 2026-09-18 owner-immutability rule. The only exception is a service-role
-- deletion worker replacing the exact old owner with deleted:<32 lowercase hex>.
create or replace function ho_private.hc_candidate_application_identity_guard() returns trigger
language plpgsql security definer set search_path='' as $$
declare actor text:=nullif((select auth.jwt()->>'sub'),''); role_name text:=nullif((select auth.jwt()->>'role'),'');
 deletion_actor text:=nullif(current_setting('hc.account_deletion_actor',true),''); deletion_rewrite boolean:=false;
begin
 deletion_rewrite:=tg_op='UPDATE' and old.source_type='hoiku_color_jobseeker' and new.source_type=old.source_type
  and new.jobseeker_clerk_user_id is distinct from old.jobseeker_clerk_user_id and role_name='service_role'
  and deletion_actor=old.jobseeker_clerk_user_id and coalesce(new.jobseeker_clerk_user_id,'') ~ '^deleted:[0-9a-f]{32}$';
 if new.source_type='hoiku_color_jobseeker' and nullif(btrim(new.jobseeker_clerk_user_id),'') is null then raise exception 'HC_CANDIDATE_APPLICATION_OWNER_REQUIRED' using errcode='23514'; end if;
 if tg_op='INSERT' and new.source_type='hoiku_color_jobseeker' and actor is not null then
  if new.jobseeker_clerk_user_id is distinct from actor then raise exception 'HC_CANDIDATE_APPLICATION_OWNER_MUST_MATCH_ACTOR' using errcode='42501'; end if;
  if ho_private.recruitment_can_write(new.facility_id) then raise exception 'HC_CANDIDATE_APPLICATION_RECRUITER_DIRECT_INSERT_FORBIDDEN' using errcode='42501'; end if;
 end if;
 if tg_op='UPDATE' then
  if old.source_type='hoiku_color_jobseeker' then
   if new.source_type is distinct from old.source_type then raise exception 'HC_CANDIDATE_APPLICATION_SOURCE_IMMUTABLE' using errcode='23514'; end if;
   if new.jobseeker_clerk_user_id is distinct from old.jobseeker_clerk_user_id and not deletion_rewrite then raise exception 'HC_CANDIDATE_APPLICATION_OWNER_IMMUTABLE' using errcode='23514'; end if;
  elsif new.source_type='hoiku_color_jobseeker' then raise exception 'HC_CANDIDATE_APPLICATION_SOURCE_TRANSITION_FORBIDDEN' using errcode='23514'; end if;
 end if; return new;
end $$;

create or replace function public.hc_jobseeker_claim_account_deletion_v2(p_worker_id text,p_limit integer default 5)
returns table(request_id uuid,clerk_user_id text,processing_stage text,identity_action text,shared_identity boolean,attempt_count integer)
language plpgsql security definer set search_path='' as $$
declare w text:=nullif(trim(coalesce(p_worker_id,'')),''); lim integer:=greatest(1,least(coalesce(p_limit,5),25));
begin
 if w is null or char_length(w)>160 then raise exception 'INVALID_WORKER_ID' using errcode='22023'; end if;
 return query with c as(select r.id from public.hc_jobseeker_account_deletion_requests r where r.status in ('requested','processing') and r.clerk_user_id is not null and r.available_at<=now() and (r.lease_expires_at is null or r.lease_expires_at<=now()) order by r.requested_at,r.id for update skip locked limit lim),
 u as(update public.hc_jobseeker_account_deletion_requests r set status='processing',processing_stage=case when r.status='requested' then 'identity_freeze' else r.processing_stage end,processing_started_at=coalesce(r.processing_started_at,now()),attempt_count=r.attempt_count+1,lease_owner=w,lease_expires_at=now()+interval '10 minutes',updated_at=now() from c where r.id=c.id returning r.*)
 select u.id,u.clerk_user_id,u.processing_stage,u.identity_action,u.shared_identity,u.attempt_count from u;
end $$;

create or replace function public.hc_jobseeker_prepare_account_deletion_v2(p_request_id uuid,p_worker_id text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.hc_jobseeker_account_deletion_requests%rowtype; shared boolean;
begin
 select * into r from public.hc_jobseeker_account_deletion_requests x where x.id=p_request_id and x.status='processing' and x.processing_stage='identity_freeze' and x.lease_owner=p_worker_id and x.lease_expires_at>now() for update;
 if not found then raise exception 'ACCOUNT_DELETION_CLAIM_NOT_OWNED' using errcode='42501'; end if;
 shared:=hc_private.jobseeker_has_shared_identity_v3(r.clerk_user_id);
 update public.hc_jobseeker_account_deletion_requests set shared_identity=shared,identity_action=case when shared then 'preserve_shared' else 'delete_clerk' end,updated_at=now() where id=p_request_id;
 return jsonb_build_object('request_id',p_request_id,'shared_identity',shared,'identity_action',case when shared then 'preserve_shared' else 'delete_clerk' end,'clerk_user_id',r.clerk_user_id);
end $$;

create or replace function public.hc_jobseeker_account_deletion_manifest_v2(p_request_id uuid,p_worker_id text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u text; paths jsonb;
begin
 select r.clerk_user_id into u from public.hc_jobseeker_account_deletion_requests r where r.id=p_request_id and r.status='processing' and r.processing_stage='storage_cleanup' and r.lease_owner=p_worker_id and r.lease_expires_at>now();
 if u is null then raise exception 'ACCOUNT_DELETION_CLAIM_NOT_OWNED' using errcode='42501'; end if;
 select coalesce(jsonb_agg(x.file_path order by x.file_path),'[]'::jsonb) into paths from(
  select d.file_path from public.hc_jobseeker_documents d where d.jobseeker_clerk_user_id=u
  union select d.file_path from public.hc_application_documents d join public.hc_applications a on a.id=d.application_id where a.jobseeker_clerk_user_id=u
  union select e.destination_file_path from public.hc_application_document_expectations e where e.jobseeker_clerk_user_id=u
 )x where nullif(trim(x.file_path),'') is not null;
 return jsonb_build_object('bucket','hc-application-documents','storage_paths',paths);
end $$;

create or replace function public.hc_jobseeker_advance_account_deletion_v2(p_request_id uuid,p_worker_id text,p_expected_stage text,p_next_stage text) returns boolean
language plpgsql security definer set search_path='' as $$
declare ok boolean:=(p_expected_stage='identity_freeze' and p_next_stage='storage_cleanup') or (p_expected_stage='storage_cleanup' and p_next_stage='database_cleanup') or (p_expected_stage='database_cleanup' and p_next_stage='identity_delete');
begin
 if not ok then raise exception 'INVALID_ACCOUNT_DELETION_STAGE_TRANSITION' using errcode='22023'; end if;
 update public.hc_jobseeker_account_deletion_requests r set processing_stage=p_next_stage,lease_expires_at=now()+interval '10 minutes',updated_at=now() where r.id=p_request_id and r.status='processing' and r.processing_stage=p_expected_stage and r.lease_owner=p_worker_id and r.lease_expires_at>now(); return found;
end $$;

create or replace function public.hc_jobseeker_apply_account_deletion_v2(p_request_id uuid,p_worker_id text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u text; h text; email text; apps uuid[]:='{}'; retained uuid[]:='{}'; pseudo text; deleted_count integer:=0; anonymized_count integer:=0;
begin
 select r.clerk_user_id,r.principal_hash into u,h from public.hc_jobseeker_account_deletion_requests r where r.id=p_request_id and r.status='processing' and r.processing_stage='database_cleanup' and r.lease_owner=p_worker_id and r.lease_expires_at>now() for update;
 if u is null then raise exception 'ACCOUNT_DELETION_CLAIM_NOT_OWNED' using errcode='42501'; end if;
 pseudo:='deleted:'||left(coalesce(h,hc_private.jobseeker_principal_hash_v3(u)),32);
 select p.email into email from public.hc_jobseeker_profiles p where p.clerk_user_id=u limit 1;
 select coalesce(array_agg(a.id),'{}'::uuid[]) into apps from public.hc_applications a where a.jobseeker_clerk_user_id=u;
 select coalesce(array_agg(a.id),'{}'::uuid[]) into retained from public.hc_applications a where a.jobseeker_clerk_user_id=u and exists(select 1 from public.hc_spot_assignments s where s.application_id=a.id);
 delete from public.hc_email_outbox e where e.application_id=any(apps) or (email is not null and lower(e.to_email)=lower(email));
 delete from public.hc_notifications n where n.recipient_clerk_user_id=u or n.application_id=any(apps);
 delete from public.hc_application_documents d where d.application_id=any(apps);
 delete from public.hc_application_document_expectations e where e.jobseeker_clerk_user_id=u or e.application_id=any(apps);
 delete from public.hc_interviews i where i.application_id=any(apps);
 delete from public.hc_message_threads t where t.application_id=any(apps);
 delete from public.hc_visit_reservations v where v.jobseeker_clerk_user_id=u;
 delete from public.hc_scout_invitations s where s.recipient_clerk_user_id=u;
 update public.hc_application_events e set note=null,actor_clerk_user_id=case when e.actor_clerk_user_id=u then null else e.actor_clerk_user_id end where e.application_id=any(retained);
 update public.hc_spot_assignments s set jobseeker_clerk_user_id=pseudo,confirmed_by=case when s.confirmed_by=u then pseudo else s.confirmed_by end,updated_at=now() where s.application_id=any(retained);
 perform set_config('hc.account_deletion_actor',u,true); perform set_config('hc.candidate_offer_actor',u,true);
 update public.hc_applications a set applicant_name='削除済み求職者',applicant_name_kana=null,email=null,phone=null,qualifications=null,years_of_experience=null,desired_start_date=null,message=null,admin_memo=null,hired_staff_id=null,source_id=null,jobseeker_clerk_user_id=pseudo,candidate_offer_response=null,candidate_offer_responded_at=null,candidate_offer_message=null,updated_at=now() where a.id=any(retained);
 get diagnostics anonymized_count=row_count;
 delete from public.hc_applications a where a.id=any(apps) and not(a.id=any(retained)); get diagnostics deleted_count=row_count;
 delete from public.hc_saved_jobs s where s.clerk_user_id=u;
 delete from public.hc_jobseeker_blocked_organizations b where b.jobseeker_clerk_user_id=u;
 delete from public.hc_jobseeker_privacy_settings p where p.jobseeker_clerk_user_id=u;
 delete from public.hc_jobseeker_documents d where d.jobseeker_clerk_user_id=u;
 delete from public.hc_jobseeker_profiles p where p.clerk_user_id=u;
 if to_regclass('hc_private.mobile_installations') is not null then execute 'delete from hc_private.mobile_installations where recipient_clerk_user_id=$1' using u; end if;
 return jsonb_build_object('deleted_applications',deleted_count,'anonymized_spot_applications',anonymized_count);
end $$;

create or replace function public.hc_jobseeker_retry_account_deletion_v2(p_request_id uuid,p_worker_id text,p_error_code text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare attempts integer; terminal boolean; delay_seconds integer; code text:=left(regexp_replace(coalesce(p_error_code,'WORKER_ERROR'),'[^A-Za-z0-9_.:-]','','g'),160);
begin
 select r.attempt_count into attempts from public.hc_jobseeker_account_deletion_requests r where r.id=p_request_id and r.status='processing' and r.lease_owner=p_worker_id for update;
 if not found then raise exception 'ACCOUNT_DELETION_CLAIM_NOT_OWNED' using errcode='42501'; end if;
 terminal:=attempts>=8; delay_seconds:=least(3600,30*(2^greatest(attempts-1,0))::integer);
 update public.hc_jobseeker_account_deletion_requests set status=case when terminal then 'failed' else 'processing' end,processing_stage=case when terminal then 'failed' else processing_stage end,failed_at=case when terminal then now() else null end,available_at=case when terminal then available_at else now()+make_interval(secs=>delay_seconds) end,lease_owner=null,lease_expires_at=null,last_error_code=nullif(code,''),updated_at=now() where id=p_request_id;
 return jsonb_build_object('failed',terminal,'retry_after_seconds',case when terminal then null else delay_seconds end);
end $$;

create or replace function public.hc_jobseeker_complete_account_deletion_v2(p_request_id uuid,p_worker_id text) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 update public.hc_jobseeker_account_deletion_requests r set status='completed',processing_stage='completed',completed_at=now(),failed_at=null,clerk_user_id=null,lease_owner=null,lease_expires_at=null,last_error_code=null,updated_at=now() where r.id=p_request_id and r.status='processing' and r.processing_stage='identity_delete' and r.lease_owner=p_worker_id and r.lease_expires_at>now(); return found;
end $$;

revoke all on function public.hc_jobseeker_claim_account_deletion_v2(text,integer) from public,anon,authenticated;
revoke all on function public.hc_jobseeker_prepare_account_deletion_v2(uuid,text) from public,anon,authenticated;
revoke all on function public.hc_jobseeker_account_deletion_manifest_v2(uuid,text) from public,anon,authenticated;
revoke all on function public.hc_jobseeker_advance_account_deletion_v2(uuid,text,text,text) from public,anon,authenticated;
revoke all on function public.hc_jobseeker_apply_account_deletion_v2(uuid,text) from public,anon,authenticated;
revoke all on function public.hc_jobseeker_retry_account_deletion_v2(uuid,text,text) from public,anon,authenticated;
revoke all on function public.hc_jobseeker_complete_account_deletion_v2(uuid,text) from public,anon,authenticated;
grant execute on function public.hc_jobseeker_claim_account_deletion_v2(text,integer) to service_role;
grant execute on function public.hc_jobseeker_prepare_account_deletion_v2(uuid,text) to service_role;
grant execute on function public.hc_jobseeker_account_deletion_manifest_v2(uuid,text) to service_role;
grant execute on function public.hc_jobseeker_advance_account_deletion_v2(uuid,text,text,text) to service_role;
grant execute on function public.hc_jobseeker_apply_account_deletion_v2(uuid,text) to service_role;
grant execute on function public.hc_jobseeker_retry_account_deletion_v2(uuid,text,text) to service_role;
grant execute on function public.hc_jobseeker_complete_account_deletion_v2(uuid,text) to service_role;
commit;
