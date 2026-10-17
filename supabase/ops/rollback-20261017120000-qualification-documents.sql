-- Rollback for 20261017120000_hc_jobseeker_qualification_documents_v1.
-- Restores the production definitions captured on 2026-10-17 before the migration.
--
-- Safe only while no row uses one of the five new licence types: the narrow
-- CHECKs would reject them. The guard below stops the rollback instead of
-- deleting or rewriting any candidate data. Requirement rows ARE dropped with
-- their table (they are nursery settings, not candidate data); export them
-- first if they must be kept.

begin;

do $guard$
begin
  if exists (select 1 from public.hc_jobseeker_documents where document_type in ('registered_dietitian_license','dietitian_license','cook_license','nurse_license','assistant_nurse_license'))
     or exists (select 1 from public.hc_application_documents where document_type in ('registered_dietitian_license','dietitian_license','cook_license','nurse_license','assistant_nurse_license'))
     or exists (select 1 from public.hc_application_document_expectations where document_type in ('registered_dietitian_license','dietitian_license','cook_license','nurse_license','assistant_nurse_license')) then
    raise exception 'ROLLBACK_BLOCKED_NEW_DOCUMENT_TYPES_IN_USE';
  end if;
end;
$guard$;

drop function if exists public.hc_employer_set_market_job_document_requirements(uuid,jsonb);
drop function if exists public.hc_employer_get_market_job_document_requirements(uuid);
drop function if exists ho_private.hc_employer_market_job_document_requirements_impl(uuid,jsonb,boolean);
drop function if exists public.hc_jobseeker_get_job_document_requirements(uuid);
drop function if exists ho_private.hc_jobseeker_get_job_document_requirements_impl(uuid);

-- v1 implementation exactly as before the migration (defaults snapshot, no requirement check).
create or replace function ho_private.hc_jobseeker_submit_application_impl(
  p_job_id uuid,
  p_applicant_name text,
  p_applicant_name_kana text default null::text,
  p_email text default null::text,
  p_phone text default null::text,
  p_qualifications text default null::text,
  p_years_of_experience numeric default null::numeric,
  p_desired_start_date date default null::date,
  p_message text default null::text
)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'auth', 'pg_temp'
as $function$
declare
  v_user_id text := auth.jwt() ->> 'sub';
  v_org_id uuid;
  v_facility_id uuid;
  v_source_type text;
  v_source_id uuid;
  v_application_id uuid;
  v_spot public.ho_spot_job_drafts%rowtype;
  v_confirmed_count integer := 0;
  v_application_created boolean := false;
begin
  if v_user_id is null or btrim(v_user_id) = '' then
    raise exception 'authentication required';
  end if;
  if p_applicant_name is null or btrim(p_applicant_name) = '' then
    raise exception 'applicant name is required';
  end if;

  -- Idempotent duplicate submission: an existing candidate application wins,
  -- even when a spot later fills or closes. Expectations remain the immutable
  -- snapshot captured by the original application transaction.
  select a.id into v_application_id
  from public.hc_applications a
  where a.job_id = p_job_id
    and a.jobseeker_clerk_user_id = v_user_id
  order by a.applied_at asc
  limit 1;
  if v_application_id is not null then
    return v_application_id;
  end if;

  select j.organization_id, j.facility_id, j.source_type, j.source_id
    into v_org_id, v_facility_id, v_source_type, v_source_id
  from public.hc_jobs j
  join public.ho_facilities f
    on f.id = j.facility_id
   and f.organization_id = j.organization_id
  where j.id = p_job_id
    and j.status = 'published'
    and f.status = 'active'
    and (j.closing_at is null or j.closing_at >= now())
  limit 1;

  if v_facility_id is null then
    raise exception 'job is not available';
  end if;

  if v_source_type = 'spot_job' then
    select s.* into v_spot
    from public.ho_spot_job_drafts s
    where s.id = v_source_id
      and s.organization_id = v_org_id
      and s.facility_id = v_facility_id
    for share;

    if v_spot.id is null
       or v_spot.status <> 'published'
       or v_spot.work_date is null
       or v_spot.start_time is null
       or v_spot.end_time is null
       or v_spot.end_time <= v_spot.start_time
       or coalesce(v_spot.hourly_wage, v_spot.hourly_rate, 0) <= 0
       or (v_spot.work_date + v_spot.start_time) <= (now() at time zone 'Asia/Tokyo') then
      raise exception 'spot job is not available';
    end if;

    select count(*)::integer into v_confirmed_count
    from public.hc_spot_assignments x
    where x.spot_job_id = v_spot.id
      and x.status in ('confirmed', 'completed');

    if v_confirmed_count >= greatest(coalesce(v_spot.required_count, 1), 1) then
      raise exception 'spot job capacity is filled';
    end if;
  end if;

  begin
    insert into public.hc_applications (
      organization_id, facility_id, job_id, applicant_name, applicant_name_kana, email, phone,
      qualifications, years_of_experience, desired_start_date, message, status, source_type, jobseeker_clerk_user_id
    ) values (
      v_org_id, v_facility_id, p_job_id, btrim(p_applicant_name), nullif(btrim(p_applicant_name_kana), ''),
      nullif(btrim(p_email), ''), nullif(btrim(p_phone), ''), nullif(btrim(p_qualifications), ''),
      p_years_of_experience, p_desired_start_date, nullif(btrim(p_message), ''),
      'new', 'hoiku_color_jobseeker', v_user_id
    ) returning id into v_application_id;
    v_application_created := true;
  exception when unique_violation then
    select a.id into v_application_id
    from public.hc_applications a
    where a.job_id = p_job_id
      and a.jobseeker_clerk_user_id = v_user_id
    order by a.applied_at asc
    limit 1;
  end;

  if v_application_id is null then
    raise exception 'application could not be created';
  end if;

  if v_application_created then
    insert into public.hc_application_document_expectations (
      application_id,
      jobseeker_clerk_user_id,
      source_jobseeker_document_id_snapshot,
      document_type,
      title,
      destination_file_path
    )
    select
      v_application_id,
      v_user_id,
      d.id,
      d.document_type,
      d.title,
      v_org_id::text || '/' || v_facility_id::text || '/' || v_application_id::text || '/vault-' || d.id::text || '/' || regexp_replace(d.file_path, '^.*/', '')
    from public.hc_jobseeker_documents d
    where d.jobseeker_clerk_user_id = v_user_id
      and d.is_default
    on conflict do nothing;
  end if;

  return v_application_id;
end;
$function$;

drop function if exists public.hc_jobseeker_submit_application_v2(uuid,text,text,text,text,text,numeric,date,text,uuid[]);
drop function if exists ho_private.hc_jobseeker_submit_application_v2_impl(uuid,text,text,text,text,text,numeric,date,text,uuid[]);
drop table if exists public.hc_job_document_requirements;

-- Source registration exactly as before (literal type list).
create or replace function public.hc_register_jobseeker_document_source(
  p_document_id uuid,
  p_document_type text,
  p_title text,
  p_file_path text,
  p_mime_type text,
  p_file_size bigint
)
returns public.hc_jobseeker_documents
language plpgsql
security definer
set search_path to 'public', 'ho_private', 'pg_temp'
as $function$
declare
  v_user_id text := nullif((select auth.jwt())->>'sub','');
  v_parts text[];
  v_storage_object_id uuid;
  v_result public.hc_jobseeker_documents%rowtype;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  v_parts := string_to_array(coalesce(p_file_path,''), '/');
  if coalesce(array_length(v_parts,1),0) <> 4
     or v_parts[1] <> 'jobseekers'
     or v_parts[2] <> v_user_id
     or v_parts[3] <> p_document_id::text
     or btrim(coalesce(v_parts[4],'')) = '' then
    raise exception 'invalid source path' using errcode = '22023';
  end if;

  if p_document_type not in ('resume','work_history','nursery_teacher_license','kindergarten_license','other') then
    raise exception 'invalid document type' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_title,''))) < 1 or char_length(btrim(p_title)) > 200 then
    raise exception 'invalid title' using errcode = '22023';
  end if;
  if p_mime_type not in ('application/pdf','image/jpeg','image/png') then
    raise exception 'invalid mime type' using errcode = '22023';
  end if;
  if p_file_size is null or p_file_size < 1 or p_file_size > 10485760 then
    raise exception 'invalid file size' using errcode = '22023';
  end if;

  perform ho_private.color_document_object_xact_lock(p_file_path);

  select o.id into v_storage_object_id
  from storage.objects o
  where o.bucket_id = 'hc-application-documents'
    and o.name = p_file_path
  for update;

  if v_storage_object_id is null then
    raise exception 'storage object missing' using errcode = '55000';
  end if;

  insert into public.hc_jobseeker_documents(
    id, jobseeker_clerk_user_id, document_type, title, file_path, mime_type, file_size, is_default
  ) values (
    p_document_id, v_user_id, p_document_type, btrim(p_title), p_file_path, p_mime_type, p_file_size, false
  )
  on conflict (id) do nothing
  returning * into v_result;

  if not found then
    select * into v_result
    from public.hc_jobseeker_documents d
    where d.id = p_document_id
      and d.jobseeker_clerk_user_id = v_user_id;

    if not found
       or v_result.file_path is distinct from p_file_path
       or v_result.document_type is distinct from p_document_type then
      raise exception 'document already exists with different metadata' using errcode = '23505';
    end if;
  end if;

  return v_result;
end;
$function$;

alter table public.hc_jobseeker_documents drop constraint if exists hc_jobseeker_documents_document_type_check;
alter table public.hc_jobseeker_documents add constraint hc_jobseeker_documents_document_type_check
  check (document_type in ('resume','work_history','nursery_teacher_license','kindergarten_license','other'));
alter table public.hc_application_documents drop constraint if exists hc_application_documents_document_type_check;
alter table public.hc_application_documents add constraint hc_application_documents_document_type_check
  check (document_type in ('resume','work_history','nursery_teacher_license','kindergarten_license','other'));
alter table public.hc_application_document_expectations drop constraint if exists hc_application_document_expectations_document_type_check;
alter table public.hc_application_document_expectations add constraint hc_application_document_expectations_document_type_check
  check (document_type in ('resume','work_history','nursery_teacher_license','kindergarten_license','other'));

drop function if exists ho_private.hc_document_requirements_normalize(jsonb);
drop function if exists ho_private.hc_document_requirement_level_is_valid(text);
drop function if exists ho_private.hc_jobseeker_document_type_is_valid(text);

delete from supabase_migrations.schema_migrations where version = '20261017120000';

commit;
