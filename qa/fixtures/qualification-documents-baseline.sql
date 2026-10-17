-- Production-shaped baseline for the qualification-documents migration test.
-- Table DDL, constraints, indexes and the candidate RLS policies were read from
-- production (kcmmpjyngcysdfbumchk) on 2026-10-17 via pg_catalog. Helper
-- functions owned by other products (tenant/facility authority, Storage) are
-- replaced by small stubs driven by JWT claims so tests can choose the actor.
-- Foreign keys are omitted; every test row is inserted consistently.

create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create schema ho_private;
create schema hc_private;
create schema storage;
create schema supabase_migrations;
grant usage on schema public, auth, storage to anon, authenticated;

create function auth.jwt() returns jsonb language sql stable as
$$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
grant execute on function auth.jwt() to anon, authenticated;

create table supabase_migrations.schema_migrations (version text primary key, name text);

create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text not null,
  name text not null,
  metadata jsonb,
  updated_at timestamptz default now(),
  unique (bucket_id, name)
);

-- Stubs. "facility_admin_of" in the JWT lists facility ids the actor may manage.
create function ho_private.recruitment_can_read(p_facility_id uuid) returns boolean
language sql stable security definer set search_path to 'public', 'pg_temp' as
$$ select coalesce((auth.jwt() -> 'facility_admin_of') ? p_facility_id::text, false) $$;
create function ho_private.recruitment_can_write(p_facility_id uuid) returns boolean
language sql stable security definer set search_path to 'public', 'pg_temp' as
$$ select ho_private.recruitment_can_read(p_facility_id) and coalesce((auth.jwt() ->> 'read_only')::boolean, false) = false $$;
create function ho_private.tenant_writes_allowed(p_org uuid, p_facility uuid) returns boolean
language sql stable as $$ select true $$;
create function ho_private.current_clerk_user_id() returns text
language sql stable as $$ select nullif(auth.jwt() ->> 'sub', '') $$;
create function ho_private.color_document_object_xact_lock(p_path text) returns void
language sql as $$ select pg_advisory_xact_lock(hashtextextended('color-doc|' || p_path, 0)) $$;

-- ---------- Production tables ----------
create table public.ho_facilities (id uuid default gen_random_uuid() not null, organization_id uuid not null, name text not null, status text default 'active'::text not null);
alter table public.ho_facilities add constraint ho_facilities_pkey primary key (id);
alter table public.ho_facilities add constraint ho_facilities_status_check check ((status = any (array['active'::text, 'inactive'::text, 'archived'::text])));

create table public.ho_spot_job_drafts (id uuid default gen_random_uuid() not null, organization_id uuid not null, facility_id uuid not null, work_date date, start_time time without time zone, end_time time without time zone, required_count integer default 1 not null, hourly_rate integer, hourly_wage integer, status text default 'draft'::text not null);
alter table public.ho_spot_job_drafts add constraint ho_spot_job_drafts_pkey primary key (id);

create table public.hc_spot_assignments (id uuid default gen_random_uuid() not null, spot_job_id uuid not null, status text default 'confirmed'::text not null);

create table public.hc_jobs (id uuid default gen_random_uuid() not null, organization_id uuid not null, facility_id uuid not null, source_type text default 'manual'::text not null, source_id uuid, title text not null, description text default ''::text not null, employment_type text, salary_type text, salary_min integer, salary_max integer, salary_note text, working_hours text, holidays text, required_qualification text, benefits text, number_of_positions integer default 1 not null, status text default 'draft'::text not null, published_at timestamp with time zone, closing_at timestamp with time zone, created_by text, updated_by text, created_at timestamp with time zone default now() not null, updated_at timestamp with time zone default now() not null, spot_break_minutes integer);
alter table public.hc_jobs add constraint hc_jobs_facility_id_source_type_source_id_key unique (facility_id, source_type, source_id);
alter table public.hc_jobs add constraint hc_jobs_pkey primary key (id);
alter table public.hc_jobs add constraint hc_jobs_source_type_check check ((source_type = any (array['manual'::text, 'market'::text, 'spot_job'::text])));
alter table public.hc_jobs add constraint hc_jobs_status_check check ((status = any (array['draft'::text, 'published'::text, 'closed'::text, 'archived'::text])));
alter table public.hc_jobs enable row level security;
create policy hc_jobs_select on public.hc_jobs for select to authenticated using (ho_private.recruitment_can_read(facility_id));
create policy hc_jobs_write on public.hc_jobs for all to authenticated using (ho_private.recruitment_can_write(facility_id)) with check (ho_private.recruitment_can_write(facility_id));
grant select, insert, update, delete on public.hc_jobs to authenticated;

create table public.hc_applications (id uuid default gen_random_uuid() not null, organization_id uuid not null, facility_id uuid not null, job_id uuid not null, applicant_name text not null, applicant_name_kana text, email text, phone text, qualifications text, years_of_experience numeric, desired_start_date date, message text, status text default 'new'::text not null, admin_memo text, hired_staff_id uuid, applied_at timestamp with time zone default now() not null, created_at timestamp with time zone default now() not null, updated_at timestamp with time zone default now() not null, source_type text default 'manual'::text not null, source_id uuid, jobseeker_clerk_user_id text, candidate_offer_response text, candidate_offer_responded_at timestamp with time zone, candidate_offer_message text);
alter table public.hc_applications add constraint hc_applications_pkey primary key (id);
alter table public.hc_applications add constraint hc_applications_candidate_owner_required_check check (((source_type <> 'hoiku_color_jobseeker'::text) or (nullif(btrim(jobseeker_clerk_user_id), ''::text) is not null)));
alter table public.hc_applications add constraint hc_applications_source_type_check check ((source_type = any (array['manual'::text, 'market'::text, 'hoiku_color_jobseeker'::text])));
alter table public.hc_applications add constraint hc_applications_status_check check ((status = any (array['new'::text, 'reviewing'::text, 'interview'::text, 'offered'::text, 'hired'::text, 'rejected'::text, 'withdrawn'::text])));
create unique index hc_applications_jobseeker_job_unique on public.hc_applications using btree (job_id, jobseeker_clerk_user_id) where (jobseeker_clerk_user_id is not null);
alter table public.hc_applications enable row level security;
create policy hc_applications_jobseeker_select_own on public.hc_applications for select to authenticated using ((jobseeker_clerk_user_id = (( select auth.jwt() as jwt) ->> 'sub'::text)));
create policy hc_applications_select on public.hc_applications for select to authenticated using (ho_private.recruitment_can_read(facility_id));
grant select on public.hc_applications to authenticated;

create table public.hc_jobseeker_documents (id uuid default gen_random_uuid() not null, jobseeker_clerk_user_id text not null, document_type text not null, title text not null, file_path text not null, mime_type text, file_size bigint, is_default boolean default false not null, uploaded_at timestamp with time zone default now() not null, created_at timestamp with time zone default now() not null, updated_at timestamp with time zone default now() not null);
alter table public.hc_jobseeker_documents add constraint hc_jobseeker_documents_file_path_key unique (file_path);
alter table public.hc_jobseeker_documents add constraint hc_jobseeker_documents_pkey primary key (id);
alter table public.hc_jobseeker_documents add constraint hc_jobseeker_documents_canonical_path_check check (((file_path ~~ (((('jobseekers/'::text || jobseeker_clerk_user_id) || '/'::text) || (id)::text) || '/%'::text)) and (coalesce(array_length(string_to_array(file_path, '/'::text), 1), 0) = 4) and (btrim(split_part(file_path, '/'::text, 4)) <> ''::text)));
alter table public.hc_jobseeker_documents add constraint hc_jobseeker_documents_document_type_check check ((document_type = any (array['resume'::text, 'work_history'::text, 'nursery_teacher_license'::text, 'kindergarten_license'::text, 'other'::text])));
alter table public.hc_jobseeker_documents add constraint hc_jobseeker_documents_file_size_check check (((file_size is null) or ((file_size > 0) and (file_size <= 10485760))));
alter table public.hc_jobseeker_documents add constraint hc_jobseeker_documents_mime_type_handoff_check check (((mime_type is null) or (mime_type = any (array['application/pdf'::text, 'image/jpeg'::text, 'image/png'::text]))));
alter table public.hc_jobseeker_documents add constraint hc_jobseeker_documents_owner_path_check check ((file_path ~~ (('jobseekers/'::text || jobseeker_clerk_user_id) || '/%'::text)));
alter table public.hc_jobseeker_documents add constraint hc_jobseeker_documents_title_check check (((char_length(btrim(title)) >= 1) and (char_length(btrim(title)) <= 200)));
create index hc_jobseeker_documents_owner_idx on public.hc_jobseeker_documents using btree (jobseeker_clerk_user_id, uploaded_at desc);
create unique index hc_jobseeker_documents_one_default_per_type on public.hc_jobseeker_documents using btree (jobseeker_clerk_user_id, document_type) where is_default;
alter table public.hc_jobseeker_documents enable row level security;
create policy hc_jobseeker_documents_delete_own on public.hc_jobseeker_documents for delete to authenticated using ((jobseeker_clerk_user_id = nullif((( select auth.jwt() as jwt) ->> 'sub'::text), ''::text)));
create policy hc_jobseeker_documents_insert_own on public.hc_jobseeker_documents for insert to authenticated with check ((jobseeker_clerk_user_id = nullif((( select auth.jwt() as jwt) ->> 'sub'::text), ''::text)));
create policy hc_jobseeker_documents_select_own on public.hc_jobseeker_documents for select to authenticated using ((jobseeker_clerk_user_id = nullif((( select auth.jwt() as jwt) ->> 'sub'::text), ''::text)));
create policy hc_jobseeker_documents_update_own on public.hc_jobseeker_documents for update to authenticated using ((jobseeker_clerk_user_id = nullif((( select auth.jwt() as jwt) ->> 'sub'::text), ''::text))) with check ((jobseeker_clerk_user_id = nullif((( select auth.jwt() as jwt) ->> 'sub'::text), ''::text)));
grant select, insert, update, delete on public.hc_jobseeker_documents to authenticated;

create table public.hc_application_documents (id uuid default gen_random_uuid() not null, organization_id uuid not null, facility_id uuid not null, application_id uuid not null, document_type text not null, title text not null, file_path text not null, mime_type text, file_size bigint, transferred_staff_document_id uuid, uploaded_by_clerk_user_id text default ho_private.current_clerk_user_id(), uploaded_at timestamp with time zone default now() not null, created_at timestamp with time zone default now() not null, updated_at timestamp with time zone default now() not null, source_jobseeker_document_id uuid);
alter table public.hc_application_documents add constraint hc_application_documents_file_path_key unique (file_path);
alter table public.hc_application_documents add constraint hc_application_documents_pkey primary key (id);
alter table public.hc_application_documents add constraint hc_application_documents_document_type_check check ((document_type = any (array['resume'::text, 'work_history'::text, 'nursery_teacher_license'::text, 'kindergarten_license'::text, 'other'::text])));
alter table public.hc_application_documents add constraint hc_application_documents_path_scope_check check ((file_path ~~ ((((((organization_id)::text || '/'::text) || (facility_id)::text) || '/'::text) || (application_id)::text) || '/%'::text)));
create unique index hc_application_documents_source_once on public.hc_application_documents using btree (application_id, source_jobseeker_document_id) where (source_jobseeker_document_id is not null);
alter table public.hc_application_documents enable row level security;
create policy hc_application_documents_jobseeker_select_own on public.hc_application_documents for select to authenticated using (((file_path ~~ ((((((organization_id)::text || '/'::text) || (facility_id)::text) || '/'::text) || (application_id)::text) || '/vault-%/%'::text)) and (exists ( select 1 from public.hc_applications a where ((a.id = hc_application_documents.application_id) and (a.organization_id = hc_application_documents.organization_id) and (a.facility_id = hc_application_documents.facility_id) and (a.jobseeker_clerk_user_id = nullif((( select auth.jwt() as jwt) ->> 'sub'::text), ''::text)))))));
create policy hc_application_documents_select on public.hc_application_documents for select to authenticated using ((ho_private.recruitment_can_read(facility_id) and (exists ( select 1 from public.hc_applications a where ((a.id = hc_application_documents.application_id) and (a.organization_id = hc_application_documents.organization_id) and (a.facility_id = hc_application_documents.facility_id))))));
grant select on public.hc_application_documents to authenticated;

create table public.hc_application_document_expectations (id uuid default gen_random_uuid() not null, application_id uuid not null, jobseeker_clerk_user_id text not null, source_jobseeker_document_id_snapshot uuid not null, document_type text not null, title text not null, destination_file_path text not null, captured_at timestamp with time zone default now() not null);
alter table public.hc_application_document_expectations add constraint hc_application_document_expectations_application_source_key unique (application_id, source_jobseeker_document_id_snapshot);
alter table public.hc_application_document_expectations add constraint hc_application_document_expectations_application_type_key unique (application_id, document_type);
alter table public.hc_application_document_expectations add constraint hc_application_document_expectations_destination_key unique (destination_file_path);
alter table public.hc_application_document_expectations add constraint hc_application_document_expectations_pkey primary key (id);
alter table public.hc_application_document_expectations add constraint hc_application_document_expectations_document_type_check check ((document_type = any (array['resume'::text, 'work_history'::text, 'nursery_teacher_license'::text, 'kindergarten_license'::text, 'other'::text])));
alter table public.hc_application_document_expectations enable row level security;
create policy hc_application_document_expectations_select_own on public.hc_application_document_expectations for select to authenticated using ((jobseeker_clerk_user_id = (( select auth.jwt() as jwt) ->> 'sub'::text)));
grant select on public.hc_application_document_expectations to authenticated;

-- Public v1 wrapper exactly as in production.
-- (Its private implementation is created from the rollback file, which holds the production body.)
