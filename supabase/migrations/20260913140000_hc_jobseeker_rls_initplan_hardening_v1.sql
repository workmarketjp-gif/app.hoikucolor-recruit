alter policy hc_jobseeker_profiles_select_own
on public.hc_jobseeker_profiles
using (clerk_user_id = ((select auth.jwt()) ->> 'sub'));

alter policy hc_jobseeker_profiles_insert_own
on public.hc_jobseeker_profiles
with check (clerk_user_id = ((select auth.jwt()) ->> 'sub'));

alter policy hc_jobseeker_profiles_update_own
on public.hc_jobseeker_profiles
using (clerk_user_id = ((select auth.jwt()) ->> 'sub'))
with check (clerk_user_id = ((select auth.jwt()) ->> 'sub'));

alter policy hc_saved_jobs_select_own
on public.hc_saved_jobs
using (clerk_user_id = ((select auth.jwt()) ->> 'sub'));

alter policy hc_saved_jobs_insert_own
on public.hc_saved_jobs
with check (clerk_user_id = ((select auth.jwt()) ->> 'sub'));

alter policy hc_saved_jobs_delete_own
on public.hc_saved_jobs
using (clerk_user_id = ((select auth.jwt()) ->> 'sub'));

alter policy hc_jobseeker_documents_select_own
on public.hc_jobseeker_documents
using (jobseeker_clerk_user_id = nullif(((select auth.jwt()) ->> 'sub'), ''));

alter policy hc_jobseeker_documents_insert_own
on public.hc_jobseeker_documents
with check (jobseeker_clerk_user_id = nullif(((select auth.jwt()) ->> 'sub'), ''));

alter policy hc_jobseeker_documents_update_own
on public.hc_jobseeker_documents
using (jobseeker_clerk_user_id = nullif(((select auth.jwt()) ->> 'sub'), ''))
with check (jobseeker_clerk_user_id = nullif(((select auth.jwt()) ->> 'sub'), ''));

alter policy hc_jobseeker_documents_delete_own
on public.hc_jobseeker_documents
using (jobseeker_clerk_user_id = nullif(((select auth.jwt()) ->> 'sub'), ''));

alter policy hc_application_documents_jobseeker_attach_own
on public.hc_application_documents
with check (
  source_jobseeker_document_id is not null
  and uploaded_by_clerk_user_id = nullif(((select auth.jwt()) ->> 'sub'), '')
  and file_path like (
    organization_id::text || '/' || facility_id::text || '/' || application_id::text ||
    '/vault-' || source_jobseeker_document_id::text || '/%'
  )
  and exists (
    select 1
    from public.hc_applications a
    join public.hc_jobseeker_documents d
      on d.id = hc_application_documents.source_jobseeker_document_id
    where a.id = hc_application_documents.application_id
      and a.organization_id = hc_application_documents.organization_id
      and a.facility_id = hc_application_documents.facility_id
      and a.jobseeker_clerk_user_id = nullif(((select auth.jwt()) ->> 'sub'), '')
      and d.jobseeker_clerk_user_id = nullif(((select auth.jwt()) ->> 'sub'), '')
      and d.document_type = hc_application_documents.document_type
      and d.title = hc_application_documents.title
      and not (d.mime_type is distinct from hc_application_documents.mime_type)
      and not (d.file_size is distinct from hc_application_documents.file_size)
  )
);

alter policy hc_application_documents_jobseeker_select_own
on public.hc_application_documents
using (
  file_path like (
    organization_id::text || '/' || facility_id::text || '/' || application_id::text || '/vault-%/%'
  )
  and exists (
    select 1
    from public.hc_applications a
    where a.id = hc_application_documents.application_id
      and a.organization_id = hc_application_documents.organization_id
      and a.facility_id = hc_application_documents.facility_id
      and a.jobseeker_clerk_user_id = nullif(((select auth.jwt()) ->> 'sub'), '')
  )
);

alter policy hc_applications_jobseeker_select_own
on public.hc_applications
using (jobseeker_clerk_user_id = ((select auth.jwt()) ->> 'sub'));

alter policy hc_message_threads_insert_participant
on public.hc_message_threads
with check (
  exists (
    select 1
    from public.hc_applications app
    where app.id = hc_message_threads.application_id
      and app.organization_id = hc_message_threads.organization_id
      and app.facility_id = hc_message_threads.facility_id
      and app.job_id = hc_message_threads.job_id
      and app.jobseeker_clerk_user_id = hc_message_threads.jobseeker_clerk_user_id
      and (
        app.jobseeker_clerk_user_id = ((select auth.jwt()) ->> 'sub')
        or ho_private.recruitment_can_write(app.facility_id)
      )
  )
);

alter policy hc_message_threads_select_participant
on public.hc_message_threads
using (
  jobseeker_clerk_user_id = ((select auth.jwt()) ->> 'sub')
  or ho_private.recruitment_can_read(facility_id)
);

alter policy hc_messages_insert_participant
on public.hc_messages
with check (
  sender_clerk_user_id = ((select auth.jwt()) ->> 'sub')
  and exists (
    select 1
    from public.hc_message_threads t
    where t.id = hc_messages.thread_id
      and (
        (
          hc_messages.sender_role = 'jobseeker'
          and t.jobseeker_clerk_user_id = ((select auth.jwt()) ->> 'sub')
        )
        or (
          hc_messages.sender_role = 'facility'
          and ho_private.recruitment_can_write(t.facility_id)
        )
      )
  )
);

alter policy hc_messages_select_participant
on public.hc_messages
using (
  exists (
    select 1
    from public.hc_message_threads t
    where t.id = hc_messages.thread_id
      and (
        t.jobseeker_clerk_user_id = ((select auth.jwt()) ->> 'sub')
        or ho_private.recruitment_can_read(t.facility_id)
      )
  )
);

alter policy hc_jobseeker_privacy_settings_own
on public.hc_jobseeker_privacy_settings
using (jobseeker_clerk_user_id = ((select auth.jwt()) ->> 'sub'))
with check (jobseeker_clerk_user_id = ((select auth.jwt()) ->> 'sub'));

alter policy hc_jobseeker_blocked_organizations_own
on public.hc_jobseeker_blocked_organizations
using (jobseeker_clerk_user_id = ((select auth.jwt()) ->> 'sub'))
with check (jobseeker_clerk_user_id = ((select auth.jwt()) ->> 'sub'));

alter policy hc_scout_invitations_candidate_own
on public.hc_scout_invitations
using (recipient_clerk_user_id = ((select auth.jwt()) ->> 'sub'));

alter policy hc_spot_assignments_jobseeker_select_own
on public.hc_spot_assignments
using (jobseeker_clerk_user_id = ((select auth.jwt()) ->> 'sub'));

-- Fail closed if any candidate-facing policy above regresses back to an unwrapped
-- auth.jwt() call. The wrapper keeps the Clerk subject constant per statement so
-- PostgreSQL can plan it as an initPlan rather than re-evaluating it per row.
do $$
declare
  bad_count integer;
begin
  select count(*)
  into bad_count
  from pg_policies
  where schemaname = 'public'
    and policyname in (
      'hc_jobseeker_profiles_select_own',
      'hc_jobseeker_profiles_insert_own',
      'hc_jobseeker_profiles_update_own',
      'hc_saved_jobs_select_own',
      'hc_saved_jobs_insert_own',
      'hc_saved_jobs_delete_own',
      'hc_jobseeker_documents_select_own',
      'hc_jobseeker_documents_insert_own',
      'hc_jobseeker_documents_update_own',
      'hc_jobseeker_documents_delete_own',
      'hc_application_documents_jobseeker_attach_own',
      'hc_application_documents_jobseeker_select_own',
      'hc_applications_jobseeker_select_own',
      'hc_message_threads_insert_participant',
      'hc_message_threads_select_participant',
      'hc_messages_insert_participant',
      'hc_messages_select_participant',
      'hc_jobseeker_privacy_settings_own',
      'hc_jobseeker_blocked_organizations_own',
      'hc_scout_invitations_candidate_own',
      'hc_spot_assignments_jobseeker_select_own'
    )
    and (
      (coalesce(qual, '') ~ 'auth\\.jwt\\(\\)' and coalesce(qual, '') !~ 'SELECT auth\\.jwt\\(\\)')
      or
      (coalesce(with_check, '') ~ 'auth\\.jwt\\(\\)' and coalesce(with_check, '') !~ 'SELECT auth\\.jwt\\(\\)')
    );

  if bad_count <> 0 then
    raise exception 'candidate RLS initPlan hardening incomplete: % policies still expose direct auth.jwt()', bad_count;
  end if;
end;
$$;
