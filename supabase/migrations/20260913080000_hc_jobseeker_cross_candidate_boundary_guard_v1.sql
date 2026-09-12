-- Hoiku Color jobseeker cross-candidate isolation guard.
--
-- This migration intentionally changes no product data. It fails closed when the
-- production security contract needed by the jobseeker application is weakened.
-- Facility-side app code is not changed by this migration.

do $$
declare
  v_missing text[] := '{}';
  v_policy_ok boolean;
  v_def text;
begin
  -- RLS must remain enabled on every candidate-sensitive shared table.
  if exists (
    select 1
    from (values
      ('hc_applications'),
      ('hc_message_threads'),
      ('hc_messages'),
      ('hc_notifications'),
      ('hc_interviews'),
      ('hc_visit_reservations'),
      ('hc_scout_invitations'),
      ('hc_jobseeker_blocked_organizations'),
      ('hc_jobseeker_profiles')
    ) as required(table_name)
    left join pg_class c on c.relname = required.table_name
    left join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
    where n.oid is null or not c.relrowsecurity
  ) then
    v_missing := array_append(v_missing, 'JOBSEEKER_RLS_DISABLED');
  end if;

  -- The candidate must only see their own application rows directly.
  select exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'hc_applications'
      and policyname = 'hc_applications_jobseeker_select_own'
      and cmd = 'SELECT'
      and coalesce(qual, '') ilike '%jobseeker_clerk_user_id%'
      and coalesce(qual, '') ilike '%auth.jwt()%sub%'
  ) into v_policy_ok;
  if not v_policy_ok then
    v_missing := array_append(v_missing, 'APPLICATION_OWNER_SELECT_POLICY_MISSING');
  end if;

  -- These read-only gates must remain RESTRICTIVE. Making them PERMISSIVE would
  -- OR tenant_writes_allowed() with recruitment_can_write() and allow a generic
  -- authenticated candidate to mutate facility-owned rows.
  if exists (
    select 1
    from (values
      ('hc_applications','hc_applications_deny_readonly_write'),
      ('hc_applications','hc_applications_deny_readonly_write_u'),
      ('hc_applications','hc_applications_deny_readonly_write_d'),
      ('hc_interviews','hc_interviews_deny_readonly_write'),
      ('hc_interviews','hc_interviews_deny_readonly_write_u'),
      ('hc_interviews','hc_interviews_deny_readonly_write_d'),
      ('hc_notifications','hc_notifications_deny_readonly_write'),
      ('hc_notifications','hc_notifications_deny_readonly_write_u'),
      ('hc_notifications','hc_notifications_deny_readonly_write_d')
    ) as required(table_name, policy_name)
    left join pg_policies p
      on p.schemaname = 'public'
     and p.tablename = required.table_name
     and p.policyname = required.policy_name
    where p.policyname is null or p.permissive <> 'RESTRICTIVE'
  ) then
    v_missing := array_append(v_missing, 'TENANT_WRITE_GATES_NOT_RESTRICTIVE');
  end if;

  select exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='hc_applications'
      and policyname='hc_applications_write'
      and coalesce(qual,'') ilike '%recruitment_can_write%'
      and coalesce(with_check,'') ilike '%recruitment_can_write%'
  ) into v_policy_ok;
  if not v_policy_ok then
    v_missing := array_append(v_missing, 'APPLICATION_FACILITY_WRITE_POLICY_MISSING');
  end if;

  select exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='hc_interviews'
      and policyname='hc_interviews_write'
      and coalesce(qual,'') ilike '%recruitment_can_write%'
      and coalesce(with_check,'') ilike '%recruitment_can_write%'
  ) into v_policy_ok;
  if not v_policy_ok then
    v_missing := array_append(v_missing, 'INTERVIEW_FACILITY_WRITE_POLICY_MISSING');
  end if;

  -- Participant/owner policies for communication, notifications and visits.
  select exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='hc_message_threads'
      and policyname='hc_message_threads_select_participant'
      and coalesce(qual,'') ilike '%jobseeker_clerk_user_id%'
      and coalesce(qual,'') ilike '%recruitment_can_read%'
  ) into v_policy_ok;
  if not v_policy_ok then v_missing := array_append(v_missing, 'THREAD_PARTICIPANT_POLICY_MISSING'); end if;

  select exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='hc_messages'
      and policyname='hc_messages_select_participant'
      and coalesce(qual,'') ilike '%jobseeker_clerk_user_id%'
      and coalesce(qual,'') ilike '%recruitment_can_read%'
  ) into v_policy_ok;
  if not v_policy_ok then v_missing := array_append(v_missing, 'MESSAGE_PARTICIPANT_POLICY_MISSING'); end if;

  select exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='hc_notifications'
      and policyname='hc_notifications_select_own'
      and coalesce(qual,'') ilike '%recipient_clerk_user_id%'
      and coalesce(qual,'') ilike '%current_clerk_user_id%'
  ) into v_policy_ok;
  if not v_policy_ok then v_missing := array_append(v_missing, 'NOTIFICATION_OWNER_POLICY_MISSING'); end if;

  select exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='hc_visit_reservations'
      and policyname='hc_visit_reservations_read_participants'
      and coalesce(qual,'') ilike '%jobseeker_clerk_user_id%'
      and coalesce(qual,'') ilike '%current_clerk_user_id%'
  ) into v_policy_ok;
  if not v_policy_ok then v_missing := array_append(v_missing, 'VISIT_OWNER_POLICY_MISSING'); end if;

  -- Candidate-only scout/block surfaces must not expose their backing tables to
  -- the generic authenticated browser role. Access is through owner-bound RPCs.
  if has_table_privilege('authenticated','public.hc_scout_invitations','SELECT')
     or has_table_privilege('authenticated','public.hc_scout_invitations','INSERT')
     or has_table_privilege('authenticated','public.hc_scout_invitations','UPDATE')
     or has_table_privilege('authenticated','public.hc_scout_invitations','DELETE') then
    v_missing := array_append(v_missing, 'SCOUT_TABLE_DIRECT_AUTH_GRANT');
  end if;
  if has_table_privilege('authenticated','public.hc_jobseeker_blocked_organizations','SELECT')
     or has_table_privilege('authenticated','public.hc_jobseeker_blocked_organizations','INSERT')
     or has_table_privilege('authenticated','public.hc_jobseeker_blocked_organizations','UPDATE')
     or has_table_privilege('authenticated','public.hc_jobseeker_blocked_organizations','DELETE') then
    v_missing := array_append(v_missing, 'BLOCK_TABLE_DIRECT_AUTH_GRANT');
  end if;

  -- Communication tables expose only the operations the current candidate UI
  -- needs; ownership is enforced by the policies above.
  if has_table_privilege('authenticated','public.hc_message_threads','UPDATE')
     or has_table_privilege('authenticated','public.hc_message_threads','DELETE') then
    v_missing := array_append(v_missing, 'THREAD_EXCESS_AUTH_DML_GRANT');
  end if;
  if has_table_privilege('authenticated','public.hc_messages','UPDATE')
     or has_table_privilege('authenticated','public.hc_messages','DELETE') then
    v_missing := array_append(v_missing, 'MESSAGE_EXCESS_AUTH_DML_GRANT');
  end if;
  if has_table_privilege('authenticated','public.hc_notifications','INSERT')
     or has_table_privilege('authenticated','public.hc_notifications','UPDATE')
     or has_table_privilege('authenticated','public.hc_notifications','DELETE') then
    v_missing := array_append(v_missing, 'NOTIFICATION_EXCESS_AUTH_DML_GRANT');
  end if;
  if has_table_privilege('authenticated','public.hc_visit_reservations','INSERT')
     or has_table_privilege('authenticated','public.hc_visit_reservations','UPDATE')
     or has_table_privilege('authenticated','public.hc_visit_reservations','DELETE') then
    v_missing := array_append(v_missing, 'VISIT_EXCESS_AUTH_DML_GRANT');
  end if;

  -- Public candidate-safe mutation/read RPCs must remain authenticated-only.
  if not has_function_privilege('authenticated','public.hc_jobseeker_get_application_detail(uuid)','EXECUTE')
     or not has_function_privilege('authenticated','public.hc_jobseeker_respond_interview(uuid,text,text)','EXECUTE')
     or not has_function_privilege('authenticated','public.hc_jobseeker_list_scouts()','EXECUTE')
     or not has_function_privilege('authenticated','public.hc_jobseeker_respond_scout(uuid,text)','EXECUTE')
     or not has_function_privilege('authenticated','public.hc_mark_notification_read(uuid)','EXECUTE')
     or not has_function_privilege('authenticated','public.hc_cancel_visit(uuid)','EXECUTE') then
    v_missing := array_append(v_missing, 'JOBSEEKER_PUBLIC_RPC_AUTH_EXECUTE_MISSING');
  end if;
  if has_function_privilege('anon','public.hc_jobseeker_get_application_detail(uuid)','EXECUTE')
     or has_function_privilege('anon','public.hc_jobseeker_respond_interview(uuid,text,text)','EXECUTE')
     or has_function_privilege('anon','public.hc_jobseeker_list_scouts()','EXECUTE')
     or has_function_privilege('anon','public.hc_jobseeker_respond_scout(uuid,text)','EXECUTE')
     or has_function_privilege('anon','public.hc_mark_notification_read(uuid)','EXECUTE')
     or has_function_privilege('anon','public.hc_cancel_visit(uuid)','EXECUTE') then
    v_missing := array_append(v_missing, 'JOBSEEKER_PUBLIC_RPC_ANON_EXECUTE');
  end if;

  -- Facility mutation wrappers remain shared authenticated APIs for app.hoikupoppy.ai,
  -- so we do not revoke them here. Instead require their private implementations to
  -- keep an explicit facility permission gate.
  select pg_get_functiondef('ho_private.hc_schedule_interview_impl(uuid,uuid,timestamptz,integer,text,text,text,text)'::regprocedure) into v_def;
  if v_def not ilike '%recruitment_can_write%' then
    v_missing := array_append(v_missing, 'INTERVIEW_SCHEDULE_PERMISSION_GATE_MISSING');
  end if;
  select pg_get_functiondef('hc_private.manage_visit_reservation(uuid,text,text)'::regprocedure) into v_def;
  if v_def not ilike '%recruitment_can_write%' then
    v_missing := array_append(v_missing, 'VISIT_MANAGE_PERMISSION_GATE_MISSING');
  end if;
  select pg_get_functiondef('hc_private.upsert_visit_settings(uuid,boolean,boolean,boolean,smallint[],time,time,integer,integer,integer,integer,integer,integer,integer,text,text,text)'::regprocedure) into v_def;
  if v_def not ilike '%recruitment_can_write%' then
    v_missing := array_append(v_missing, 'VISIT_SETTINGS_PERMISSION_GATE_MISSING');
  end if;

  -- Verified evidence remains read-only to the candidate browser role.
  if has_table_privilege('authenticated','public.hc_verified_workplace_snapshots','INSERT')
     or has_table_privilege('authenticated','public.hc_verified_workplace_snapshots','UPDATE')
     or has_table_privilege('authenticated','public.hc_verified_workplace_snapshots','DELETE')
     or has_table_privilege('authenticated','public.hc_verified_finance_snapshots','INSERT')
     or has_table_privilege('authenticated','public.hc_verified_finance_snapshots','UPDATE')
     or has_table_privilege('authenticated','public.hc_verified_finance_snapshots','DELETE') then
    v_missing := array_append(v_missing, 'VERIFIED_SNAPSHOT_CANDIDATE_WRITE_GRANT');
  end if;

  if cardinality(v_missing) > 0 then
    raise exception 'HC_JOBSEEKER_CROSS_CANDIDATE_BOUNDARY_GUARD_FAILED: %', array_to_string(v_missing, ',');
  end if;
end
$$;
