-- Hoiku Color Native App — shared Clerk identity HC candidate write freeze v1.
-- Source only. This migration must run after 20260919093000_hc_native_account_deletion_v3.sql.
-- A shared Clerk principal may remain usable by Hoiku Office/Poppy while its Hoiku Color
-- candidate account is being erased. Freeze only candidate-owned HC mutations; never freeze
-- unrelated Hoiku Office/Poppy or facility-side records.
begin;

do $$
begin
  if to_regclass('public.hc_jobseeker_account_deletion_requests') is null
     or to_regprocedure('hc_private.jobseeker_principal_hash_v3(text)') is null
     or to_regprocedure('public.hc_jobseeker_request_account_deletion_v1()') is null then
    raise exception 'HC_ACCOUNT_DELETION_V3_REQUIRED';
  end if;

  if to_regprocedure('ho_private.color_application_document_object_can_write(text)') is null
     or to_regprocedure('ho_private.color_application_document_object_can_delete(text)') is null then
    raise exception 'HC_DOCUMENT_STORAGE_CANONICAL_GUARD_MISSING';
  end if;

  if to_regclass('public.hc_saved_jobs') is null
     or to_regclass('public.hc_jobseeker_profiles') is null
     or to_regclass('public.hc_jobseeker_privacy_settings') is null
     or to_regclass('public.hc_jobseeker_blocked_organizations') is null
     or to_regclass('public.hc_jobseeker_documents') is null
     or to_regclass('public.hc_application_document_expectations') is null
     or to_regclass('public.hc_application_documents') is null
     or to_regclass('public.hc_applications') is null
     or to_regclass('public.hc_interview_candidate_responses') is null
     or to_regclass('public.hc_message_threads') is null
     or to_regclass('public.hc_messages') is null
     or to_regclass('public.hc_visit_reservations') is null
     or to_regclass('public.hc_scout_invitations') is null
     or to_regclass('public.hc_notifications') is null
     or to_regclass('ho_private.hc_jobseeker_document_delete_intents') is null
     or to_regclass('hc_private.mobile_installations') is null
     or to_regprocedure('public.hc_mobile_register_installation_v1(uuid,text,text,text,text,integer,integer,boolean,text,text)') is null
     or to_regprocedure('public.hc_mobile_revoke_installation_v1(uuid)') is null then
    raise exception 'HC_ACCOUNT_DELETION_FREEZE_SCHEMA_DRIFT';
  end if;
end $$;

create or replace function hc_private.jobseeker_account_is_frozen_v1(p_actor text)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select case
    when nullif(btrim(coalesce(p_actor,'')),'') is null then false
    else exists (
      select 1
      from public.hc_jobseeker_account_deletion_requests r
      where (
        r.clerk_user_id = p_actor
        and r.status in ('requested','processing','failed')
      ) or (
        r.status = 'completed'
        and r.principal_hash = hc_private.jobseeker_principal_hash_v3(p_actor)
      )
    )
  end
$$;

revoke all on function hc_private.jobseeker_account_is_frozen_v1(text)
  from public, anon, authenticated;

create or replace function hc_private.assert_jobseeker_mutation_allowed_v1(p_actor text)
returns void
language plpgsql
stable
security definer
set search_path=''
as $$
begin
  if hc_private.jobseeker_account_is_frozen_v1(p_actor) then
    raise exception 'HC_ACCOUNT_DELETION_IN_PROGRESS'
      using errcode='42501',
            detail='Hoiku Color candidate writes are frozen while account deletion is active or completed.';
  end if;
end $$;

revoke all on function hc_private.assert_jobseeker_mutation_allowed_v1(text)
  from public, anon, authenticated;

-- Generic candidate-owner trigger.
-- TG_ARGV[0] = owner column.
-- TG_ARGV[1] = optional discriminator:
--   jobseeker_sender   -> only rows whose sender_role is jobseeker
--   jobseeker_audience -> only rows whose audience is jobseeker
create or replace function hc_private.hc_candidate_owned_row_account_freeze_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_role text := nullif((select auth.jwt()->>'role'),'');
  v_actor text := nullif((select auth.jwt()->>'sub'),'');
  v_owner_key text := nullif(coalesce(tg_argv[0],''),'');
  v_mode text := coalesce(tg_argv[1],'');
  v_old jsonb := '{}'::jsonb;
  v_new jsonb := '{}'::jsonb;
  v_old_owner text;
  v_new_owner text;
  v_old_relevant boolean := false;
  v_new_relevant boolean := false;
begin
  -- Account-deletion workers use service_role. Do not block their cleanup.
  if v_role='service_role' or v_actor is null then
    if tg_op='DELETE' then return old; else return new; end if;
  end if;

  if v_owner_key is null then
    raise exception 'HC_ACCOUNT_DELETION_FREEZE_TRIGGER_MISCONFIGURED';
  end if;

  if tg_op in ('UPDATE','DELETE') then
    v_old := to_jsonb(old);
    v_old_owner := nullif(v_old->>v_owner_key,'');
    v_old_relevant := case
      when v_mode='jobseeker_sender' then coalesce(v_old->>'sender_role','')='jobseeker'
      when v_mode='jobseeker_audience' then coalesce(v_old->>'audience','')='jobseeker'
      else true
    end;
  end if;

  if tg_op in ('INSERT','UPDATE') then
    v_new := to_jsonb(new);
    v_new_owner := nullif(v_new->>v_owner_key,'');
    v_new_relevant := case
      when v_mode='jobseeker_sender' then coalesce(v_new->>'sender_role','')='jobseeker'
      when v_mode='jobseeker_audience' then coalesce(v_new->>'audience','')='jobseeker'
      else true
    end;
  end if;

  if ((v_old_relevant and v_old_owner=v_actor) or (v_new_relevant and v_new_owner=v_actor))
     and hc_private.jobseeker_account_is_frozen_v1(v_actor) then
    raise exception 'HC_ACCOUNT_DELETION_IN_PROGRESS'
      using errcode='42501',
            detail='Candidate-owned Hoiku Color data is frozen during account deletion.';
  end if;

  if tg_op='DELETE' then return old; else return new; end if;
end $$;

revoke all on function hc_private.hc_candidate_owned_row_account_freeze_v1()
  from public, anon, authenticated;

drop trigger if exists hc_account_deletion_freeze_saved_jobs on public.hc_saved_jobs;
create trigger hc_account_deletion_freeze_saved_jobs
before insert or update or delete on public.hc_saved_jobs
for each row execute function hc_private.hc_candidate_owned_row_account_freeze_v1('clerk_user_id');

drop trigger if exists hc_account_deletion_freeze_jobseeker_profiles on public.hc_jobseeker_profiles;
create trigger hc_account_deletion_freeze_jobseeker_profiles
before insert or update or delete on public.hc_jobseeker_profiles
for each row execute function hc_private.hc_candidate_owned_row_account_freeze_v1('clerk_user_id');

drop trigger if exists hc_account_deletion_freeze_privacy_settings on public.hc_jobseeker_privacy_settings;
create trigger hc_account_deletion_freeze_privacy_settings
before insert or update or delete on public.hc_jobseeker_privacy_settings
for each row execute function hc_private.hc_candidate_owned_row_account_freeze_v1('jobseeker_clerk_user_id');

drop trigger if exists hc_account_deletion_freeze_blocked_orgs on public.hc_jobseeker_blocked_organizations;
create trigger hc_account_deletion_freeze_blocked_orgs
before insert or update or delete on public.hc_jobseeker_blocked_organizations
for each row execute function hc_private.hc_candidate_owned_row_account_freeze_v1('jobseeker_clerk_user_id');

drop trigger if exists hc_account_deletion_freeze_jobseeker_documents on public.hc_jobseeker_documents;
create trigger hc_account_deletion_freeze_jobseeker_documents
before insert or update or delete on public.hc_jobseeker_documents
for each row execute function hc_private.hc_candidate_owned_row_account_freeze_v1('jobseeker_clerk_user_id');

drop trigger if exists hc_account_deletion_freeze_document_expectations on public.hc_application_document_expectations;
create trigger hc_account_deletion_freeze_document_expectations
before insert or update or delete on public.hc_application_document_expectations
for each row execute function hc_private.hc_candidate_owned_row_account_freeze_v1('jobseeker_clerk_user_id');

drop trigger if exists hc_account_deletion_freeze_applications on public.hc_applications;
create trigger hc_account_deletion_freeze_applications
before insert or update or delete on public.hc_applications
for each row execute function hc_private.hc_candidate_owned_row_account_freeze_v1('jobseeker_clerk_user_id');

drop trigger if exists hc_account_deletion_freeze_interview_responses on public.hc_interview_candidate_responses;
create trigger hc_account_deletion_freeze_interview_responses
before insert or update or delete on public.hc_interview_candidate_responses
for each row execute function hc_private.hc_candidate_owned_row_account_freeze_v1('jobseeker_clerk_user_id');

drop trigger if exists hc_account_deletion_freeze_message_threads on public.hc_message_threads;
create trigger hc_account_deletion_freeze_message_threads
before insert or update or delete on public.hc_message_threads
for each row execute function hc_private.hc_candidate_owned_row_account_freeze_v1('jobseeker_clerk_user_id');

drop trigger if exists hc_account_deletion_freeze_messages on public.hc_messages;
create trigger hc_account_deletion_freeze_messages
before insert or update or delete on public.hc_messages
for each row execute function hc_private.hc_candidate_owned_row_account_freeze_v1('sender_clerk_user_id','jobseeker_sender');

drop trigger if exists hc_account_deletion_freeze_visits on public.hc_visit_reservations;
create trigger hc_account_deletion_freeze_visits
before insert or update or delete on public.hc_visit_reservations
for each row execute function hc_private.hc_candidate_owned_row_account_freeze_v1('jobseeker_clerk_user_id');

drop trigger if exists hc_account_deletion_freeze_scouts on public.hc_scout_invitations;
create trigger hc_account_deletion_freeze_scouts
before insert or update or delete on public.hc_scout_invitations
for each row execute function hc_private.hc_candidate_owned_row_account_freeze_v1('recipient_clerk_user_id');

drop trigger if exists hc_account_deletion_freeze_notifications on public.hc_notifications;
create trigger hc_account_deletion_freeze_notifications
before insert or update or delete on public.hc_notifications
for each row execute function hc_private.hc_candidate_owned_row_account_freeze_v1('recipient_clerk_user_id','jobseeker_audience');

drop trigger if exists hc_account_deletion_freeze_document_delete_intents on ho_private.hc_jobseeker_document_delete_intents;
create trigger hc_account_deletion_freeze_document_delete_intents
before insert or update or delete on ho_private.hc_jobseeker_document_delete_intents
for each row execute function hc_private.hc_candidate_owned_row_account_freeze_v1('jobseeker_clerk_user_id');

-- Push registration is a candidate mutation too. A shared principal remains signed into
-- Clerk for Hoiku Office/Poppy, so Native startup must not be able to re-register a new
-- HC push route after deletion begins. Explicit revocation remains allowed.
create or replace function hc_private.hc_mobile_installation_account_freeze_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_role text := nullif((select auth.jwt()->>'role'),'');
  v_actor text := nullif((select auth.jwt()->>'sub'),'');
  v_is_explicit_revoke boolean := false;
begin
  if v_role='service_role' or v_actor is null then
    if tg_op='DELETE' then return old; else return new; end if;
  end if;

  if tg_op='UPDATE' then
    v_is_explicit_revoke :=
      new.revoked_at is not null
      and new.push_token is null
      and new.notifications_authorized=false;
  end if;

  if hc_private.jobseeker_account_is_frozen_v1(v_actor)
     and not v_is_explicit_revoke then
    raise exception 'HC_ACCOUNT_DELETION_IN_PROGRESS'
      using errcode='42501',
            detail='Hoiku Color push registration is frozen during account deletion.';
  end if;

  if tg_op='DELETE' then return old; else return new; end if;
end $$;

revoke all on function hc_private.hc_mobile_installation_account_freeze_v1()
  from public, anon, authenticated;

drop trigger if exists hc_account_deletion_freeze_mobile_installations on hc_private.mobile_installations;
create trigger hc_account_deletion_freeze_mobile_installations
before insert or update or delete on hc_private.mobile_installations
for each row execute function hc_private.hc_mobile_installation_account_freeze_v1();

-- Application document rows do not carry a direct candidate owner column. Resolve through
-- the application, but only block the current candidate's own application. Facility-side
-- actions for unrelated candidates remain untouched.
create or replace function hc_private.hc_candidate_application_document_account_freeze_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_role text := nullif((select auth.jwt()->>'role'),'');
  v_actor text := nullif((select auth.jwt()->>'sub'),'');
  v_old_application uuid;
  v_new_application uuid;
begin
  if v_role='service_role' or v_actor is null then
    if tg_op='DELETE' then return old; else return new; end if;
  end if;

  if tg_op in ('UPDATE','DELETE') then
    v_old_application := old.application_id;
  end if;
  if tg_op in ('INSERT','UPDATE') then
    v_new_application := new.application_id;
  end if;

  if hc_private.jobseeker_account_is_frozen_v1(v_actor)
     and exists (
       select 1
       from public.hc_applications a
       where a.jobseeker_clerk_user_id=v_actor
         and a.id in (v_old_application,v_new_application)
     ) then
    raise exception 'HC_ACCOUNT_DELETION_IN_PROGRESS'
      using errcode='42501',
            detail='Candidate application documents are frozen during account deletion.';
  end if;

  if tg_op='DELETE' then return old; else return new; end if;
end $$;

revoke all on function hc_private.hc_candidate_application_document_account_freeze_v1()
  from public, anon, authenticated;

drop trigger if exists hc_account_deletion_freeze_application_documents on public.hc_application_documents;
create trigger hc_account_deletion_freeze_application_documents
before insert or update or delete on public.hc_application_documents
for each row execute function hc_private.hc_candidate_application_document_account_freeze_v1();

-- Preserve the canonical storage authorization helpers and add only the account-deletion
-- candidate freeze. This intentionally does not alter SELECT/read policy or facility-side paths.
create or replace function hc_private.color_application_document_object_can_write_with_deletion_freeze_v1(object_name text)
returns boolean
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_actor text := nullif((select auth.jwt()->>'sub'),'');
  v_parts text[] := string_to_array(coalesce(object_name,''),'/');
  v_application uuid;
begin
  if not ho_private.color_application_document_object_can_write(object_name) then
    return false;
  end if;

  if v_actor is null or not hc_private.jobseeker_account_is_frozen_v1(v_actor) then
    return true;
  end if;

  if coalesce(array_length(v_parts,1),0)=4
     and v_parts[1]='jobseekers'
     and v_parts[2]=v_actor then
    return false;
  end if;

  if coalesce(array_length(v_parts,1),0)>=5 and v_parts[4] like 'vault-%' then
    begin
      v_application := v_parts[3]::uuid;
    exception when invalid_text_representation then
      v_application := null;
    end;
    if v_application is not null and exists (
      select 1 from public.hc_applications a
      where a.id=v_application and a.jobseeker_clerk_user_id=v_actor
    ) then
      return false;
    end if;
  end if;

  return true;
end $$;

create or replace function hc_private.color_application_document_object_can_delete_with_deletion_freeze_v1(object_name text)
returns boolean
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_actor text := nullif((select auth.jwt()->>'sub'),'');
  v_parts text[] := string_to_array(coalesce(object_name,''),'/');
  v_application uuid;
begin
  if not ho_private.color_application_document_object_can_delete(object_name) then
    return false;
  end if;

  if v_actor is null or not hc_private.jobseeker_account_is_frozen_v1(v_actor) then
    return true;
  end if;

  if coalesce(array_length(v_parts,1),0)=4
     and v_parts[1]='jobseekers'
     and v_parts[2]=v_actor then
    return false;
  end if;

  if coalesce(array_length(v_parts,1),0)>=5 and v_parts[4] like 'vault-%' then
    begin
      v_application := v_parts[3]::uuid;
    exception when invalid_text_representation then
      v_application := null;
    end;
    if v_application is not null and exists (
      select 1 from public.hc_applications a
      where a.id=v_application and a.jobseeker_clerk_user_id=v_actor
    ) then
      return false;
    end if;
  end if;

  return true;
end $$;

revoke all on function hc_private.color_application_document_object_can_write_with_deletion_freeze_v1(text)
  from public, anon, authenticated;
revoke all on function hc_private.color_application_document_object_can_delete_with_deletion_freeze_v1(text)
  from public, anon, authenticated;

drop policy if exists hc_application_documents_storage_insert on storage.objects;
create policy hc_application_documents_storage_insert
on storage.objects for insert to authenticated
with check (
  bucket_id='hc-application-documents'
  and hc_private.color_application_document_object_can_write_with_deletion_freeze_v1(name)
);

drop policy if exists hc_application_documents_storage_update on storage.objects;
create policy hc_application_documents_storage_update
on storage.objects for update to authenticated
using (
  bucket_id='hc-application-documents'
  and hc_private.color_application_document_object_can_write_with_deletion_freeze_v1(name)
)
with check (
  bucket_id='hc-application-documents'
  and hc_private.color_application_document_object_can_write_with_deletion_freeze_v1(name)
);

drop policy if exists hc_application_documents_storage_delete on storage.objects;
create policy hc_application_documents_storage_delete
on storage.objects for delete to authenticated
using (
  bucket_id='hc-application-documents'
  and hc_private.color_application_document_object_can_delete_with_deletion_freeze_v1(name)
);

comment on function hc_private.jobseeker_account_is_frozen_v1(text) is
  'HC candidate mutation freeze. Completed shared Clerk principals remain HC-frozen by principal hash; HO/Poppy identity remains usable.';
comment on function hc_private.hc_candidate_owned_row_account_freeze_v1() is
  'Blocks candidate-owned HC writes for account-deletion principals without freezing unrelated HO/Poppy or facility records.';
comment on function hc_private.color_application_document_object_can_write_with_deletion_freeze_v1(text) is
  'Wraps canonical HC document storage authorization and blocks only frozen candidate-owned write paths.';
comment on function hc_private.color_application_document_object_can_delete_with_deletion_freeze_v1(text) is
  'Wraps canonical HC document storage authorization and blocks only frozen candidate-owned delete paths.';

commit;
