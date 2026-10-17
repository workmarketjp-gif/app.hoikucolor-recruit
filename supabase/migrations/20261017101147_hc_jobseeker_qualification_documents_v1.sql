-- Qualification evidence document types + per-job application document requirements.
--
-- Backward compatible by construction:
--   * Document type CHECKs are only widened (strict superset of the old list).
--     No existing row is updated; VALIDATE only scans.
--   * The public hc_jobseeker_submit_application (v1) signature is unchanged.
--     Its private implementation now delegates to the v2 implementation with
--     "my 応募時に使う documents" as the selection, so the required-document
--     rule is enforced identically for every client (old Native builds too).
--     With no requirement rows the behaviour is exactly the previous one.
--   * The requirement table starts empty. A job without rows means
--     "not configured" and the jobseeker apply flow behaves as before.
--   * Nurseries set requirements from Poppy job management through
--     hc_employer_set_market_job_document_requirements, authorised by the
--     existing ho_private.recruitment_can_write facility check. Browsers have
--     no direct table access.

-- 1. Canonical list of jobseeker document types ------------------------------

create or replace function ho_private.hc_jobseeker_document_type_is_valid(p_document_type text)
returns boolean
language sql
immutable
set search_path to ''
as $function$
  select p_document_type in (
    'resume',
    'work_history',
    'nursery_teacher_license',
    'kindergarten_license',
    'registered_dietitian_license',
    'dietitian_license',
    'cook_license',
    'nurse_license',
    'assistant_nurse_license',
    'other'
  );
$function$;

revoke all on function ho_private.hc_jobseeker_document_type_is_valid(text) from public, anon, authenticated;

-- Shared with the private recruitment test lane (Poppy repository migration).
create or replace function ho_private.hc_document_requirement_level_is_valid(p_requirement text)
returns boolean
language sql
immutable
set search_path to ''
as $function$
  select p_requirement in ('required', 'optional', 'requested_later', 'not_applicable');
$function$;

revoke all on function ho_private.hc_document_requirement_level_is_valid(text) from public, anon, authenticated;

-- Validates and normalises a requirement list:
--   [{"document_type": "...", "requirement": "...", "note": "..."}, ...]
-- Returns the cleaned array; raises 22023 on anything else.
create or replace function ho_private.hc_document_requirements_normalize(p_items jsonb)
returns jsonb
language plpgsql
immutable
set search_path to ''
as $function$
declare
  v_item jsonb;
  v_type text;
  v_level text;
  v_note text;
  v_seen text[] := '{}';
  v_result jsonb := '[]'::jsonb;
begin
  if p_items is null then
    return '[]'::jsonb;
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 10 then
    raise exception 'invalid document requirements' using errcode = '22023';
  end if;
  for v_item in select value from jsonb_array_elements(p_items) loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception 'invalid document requirements' using errcode = '22023';
    end if;
    v_type := v_item ->> 'document_type';
    v_level := v_item ->> 'requirement';
    v_note := nullif(btrim(coalesce(v_item ->> 'note', '')), '');
    if not coalesce(ho_private.hc_jobseeker_document_type_is_valid(v_type), false)
       or not coalesce(ho_private.hc_document_requirement_level_is_valid(v_level), false)
       or v_type = any(v_seen)
       or (v_note is not null and char_length(v_note) > 200) then
      raise exception 'invalid document requirements' using errcode = '22023';
    end if;
    v_seen := v_seen || v_type;
    v_result := v_result || jsonb_build_array(jsonb_build_object('document_type', v_type, 'requirement', v_level, 'note', v_note));
  end loop;
  return v_result;
end;
$function$;

revoke all on function ho_private.hc_document_requirements_normalize(jsonb) from public, anon, authenticated;

-- 2. Widen the three document_type CHECK constraints --------------------------

alter table public.hc_jobseeker_documents
  drop constraint if exists hc_jobseeker_documents_document_type_check;
alter table public.hc_jobseeker_documents
  add constraint hc_jobseeker_documents_document_type_check
  check (document_type in ('resume','work_history','nursery_teacher_license','kindergarten_license','registered_dietitian_license','dietitian_license','cook_license','nurse_license','assistant_nurse_license','other'))
  not valid;
alter table public.hc_jobseeker_documents
  validate constraint hc_jobseeker_documents_document_type_check;

alter table public.hc_application_documents
  drop constraint if exists hc_application_documents_document_type_check;
alter table public.hc_application_documents
  add constraint hc_application_documents_document_type_check
  check (document_type in ('resume','work_history','nursery_teacher_license','kindergarten_license','registered_dietitian_license','dietitian_license','cook_license','nurse_license','assistant_nurse_license','other'))
  not valid;
alter table public.hc_application_documents
  validate constraint hc_application_documents_document_type_check;

alter table public.hc_application_document_expectations
  drop constraint if exists hc_application_document_expectations_document_type_check;
alter table public.hc_application_document_expectations
  add constraint hc_application_document_expectations_document_type_check
  check (document_type in ('resume','work_history','nursery_teacher_license','kindergarten_license','registered_dietitian_license','dietitian_license','cook_license','nurse_license','assistant_nurse_license','other'))
  not valid;
alter table public.hc_application_document_expectations
  validate constraint hc_application_document_expectations_document_type_check;

-- 3. Source registration accepts the widened list ----------------------------
-- Body is the live production definition (20260914120000) with only the
-- document type check delegated to the canonical helper.

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

  if not coalesce(ho_private.hc_jobseeker_document_type_is_valid(p_document_type), false) then
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

revoke all on function public.hc_register_jobseeker_document_source(uuid,text,text,text,text,bigint) from public, anon;
grant execute on function public.hc_register_jobseeker_document_source(uuid,text,text,text,text,bigint) to authenticated;

-- 4. Per-job document requirements --------------------------------------------
-- requirement:
--   required         応募時に必須。v2 submission is rejected without it.
--   optional         あれば一緒に送れる。
--   requested_later  応募後に園から依頼する。応募時は不要。
--   not_applicable   この求人では不要（表示しない）。
-- A job with no rows is "not configured".

create table if not exists public.hc_job_document_requirements (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.hc_jobs(id) on delete cascade,
  document_type text not null
    check (document_type in ('resume','work_history','nursery_teacher_license','kindergarten_license','registered_dietitian_license','dietitian_license','cook_license','nurse_license','assistant_nurse_license','other')),
  requirement text not null
    check (requirement in ('required','optional','requested_later','not_applicable')),
  note text check (note is null or char_length(btrim(note)) between 1 and 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by text,
  updated_by text,
  constraint hc_job_document_requirements_job_type_key unique (job_id, document_type)
);

alter table public.hc_job_document_requirements enable row level security;
-- No browser role may read or write the table directly. Jobseekers read
-- through the RPC below; employer configuration is a separate follow-up.
revoke all on table public.hc_job_document_requirements from public, anon, authenticated;

-- 5. Jobseeker read: requirements of one currently-applicable job ------------

create or replace function ho_private.hc_jobseeker_get_job_document_requirements_impl(p_job_id uuid)
returns table (document_type text, requirement text, note text)
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_user_id text := nullif((select auth.jwt()) ->> 'sub', '');
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  return query
  select r.document_type, r.requirement, r.note
  from public.hc_job_document_requirements r
  join public.hc_jobs j on j.id = r.job_id
  join public.ho_facilities f
    on f.id = j.facility_id
   and f.organization_id = j.organization_id
  where r.job_id = p_job_id
    and j.status = 'published'
    and f.status = 'active'
    and (j.closing_at is null or j.closing_at >= now())
  order by r.document_type;
end;
$function$;

revoke all on function ho_private.hc_jobseeker_get_job_document_requirements_impl(uuid) from public, anon, authenticated;

create or replace function public.hc_jobseeker_get_job_document_requirements(p_job_id uuid)
returns table (document_type text, requirement text, note text)
language sql
stable
security definer
set search_path to ''
as $function$
  select * from ho_private.hc_jobseeker_get_job_document_requirements_impl(p_job_id);
$function$;

revoke all on function public.hc_jobseeker_get_job_document_requirements(uuid) from public, anon;
grant execute on function public.hc_jobseeker_get_job_document_requirements(uuid) to authenticated;

-- 6. Application submission with explicitly selected documents ---------------
-- Same as v1 except:
--   * the candidate passes the vault documents they chose for this job;
--   * every selected id must be owned by the caller, at most one per type;
--   * every 'required' requirement of the job must be covered, checked in the
--     same transaction that creates the application;
--   * the expectation snapshot records the selected documents (not defaults).

create or replace function ho_private.hc_jobseeker_submit_application_v2_impl(
  p_job_id uuid,
  p_applicant_name text,
  p_applicant_name_kana text,
  p_email text,
  p_phone text,
  p_qualifications text,
  p_years_of_experience numeric,
  p_desired_start_date date,
  p_message text,
  p_document_ids uuid[]
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
  v_document_ids uuid[];
  v_owned_count integer := 0;
  v_type_count integer := 0;
  v_missing text[];
begin
  if v_user_id is null or btrim(v_user_id) = '' then
    raise exception 'authentication required';
  end if;
  if p_applicant_name is null or btrim(p_applicant_name) = '' then
    raise exception 'applicant name is required';
  end if;

  -- Idempotent duplicate submission (same rule as v1).
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

  -- Selected documents: owned, at most one per type, locked against deletion.
  select coalesce(array_agg(distinct x.id), '{}'::uuid[])
    into v_document_ids
  from unnest(coalesce(p_document_ids, '{}'::uuid[])) as x(id)
  where x.id is not null;

  if cardinality(v_document_ids) > 20 then
    raise exception 'too many documents' using errcode = '22023';
  end if;

  select count(*)::integer, count(distinct d.document_type)::integer
    into v_owned_count, v_type_count
  from (
    select d.id, d.document_type
    from public.hc_jobseeker_documents d
    where d.id = any(v_document_ids)
      and d.jobseeker_clerk_user_id = v_user_id
    for share
  ) d;

  if v_owned_count <> cardinality(v_document_ids) then
    raise exception 'document not found' using errcode = '42501';
  end if;
  if v_type_count <> v_owned_count then
    raise exception 'one document per type' using errcode = '22023';
  end if;

  select array_agg(r.document_type order by r.document_type)
    into v_missing
  from public.hc_job_document_requirements r
  where r.job_id = p_job_id
    and r.requirement = 'required'
    and not exists (
      select 1
      from public.hc_jobseeker_documents d
      where d.id = any(v_document_ids)
        and d.jobseeker_clerk_user_id = v_user_id
        and d.document_type = r.document_type
    );

  if v_missing is not null then
    raise exception 'required documents missing'
      using errcode = '23514', detail = array_to_string(v_missing, ',');
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
      and d.id = any(v_document_ids)
    on conflict do nothing;
  end if;

  return v_application_id;
end;
$function$;

revoke all on function ho_private.hc_jobseeker_submit_application_v2_impl(uuid,text,text,text,text,text,numeric,date,text,uuid[]) from public, anon, authenticated;

create or replace function public.hc_jobseeker_submit_application_v2(
  p_job_id uuid,
  p_applicant_name text,
  p_applicant_name_kana text default null::text,
  p_email text default null::text,
  p_phone text default null::text,
  p_qualifications text default null::text,
  p_years_of_experience numeric default null::numeric,
  p_desired_start_date date default null::date,
  p_message text default null::text,
  p_document_ids uuid[] default '{}'::uuid[]
)
returns uuid
language sql
security definer
set search_path to ''
as $function$
  select ho_private.hc_jobseeker_submit_application_v2_impl(
    p_job_id,
    p_applicant_name,
    p_applicant_name_kana,
    p_email,
    p_phone,
    p_qualifications,
    p_years_of_experience,
    p_desired_start_date,
    p_message,
    p_document_ids
  );
$function$;

revoke all on function public.hc_jobseeker_submit_application_v2(uuid,text,text,text,text,text,numeric,date,text,uuid[]) from public, anon;
grant execute on function public.hc_jobseeker_submit_application_v2(uuid,text,text,text,text,text,numeric,date,text,uuid[]) to authenticated;

-- 7. v1 uses the same rule ----------------------------------------------------
-- The public v1 wrapper (search_path '', SQL) is unchanged and still calls this
-- private implementation. The selection is the caller's 応募時に使う documents
-- (at most one per type by hc_jobseeker_documents_one_default_per_type), which
-- is exactly what v1 snapshotted before. Required documents now apply to v1 too.

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
  v_defaults uuid[];
begin
  select coalesce(array_agg(d.id order by d.document_type), '{}'::uuid[])
    into v_defaults
  from public.hc_jobseeker_documents d
  where d.jobseeker_clerk_user_id = v_user_id
    and d.is_default;

  return ho_private.hc_jobseeker_submit_application_v2_impl(
    p_job_id,
    p_applicant_name,
    p_applicant_name_kana,
    p_email,
    p_phone,
    p_qualifications,
    p_years_of_experience,
    p_desired_start_date,
    p_message,
    v_defaults
  );
end;
$function$;

revoke all on function ho_private.hc_jobseeker_submit_application_impl(uuid,text,text,text,text,text,numeric,date,text) from public, anon, authenticated;

-- 8. Nursery settings from Poppy job management ---------------------------------
-- Addressed by the Poppy (Hoiku Market) job id. One Poppy job can be synced to
-- several hc_jobs rows (one per linked facility); the caller must be allowed to
-- write recruitment for every one of them, otherwise nothing is changed.

create or replace function ho_private.hc_employer_market_job_document_requirements_impl(
  p_hm_job_id uuid,
  p_items jsonb,
  p_write boolean
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user_id text := nullif((select auth.jwt()) ->> 'sub', '');
  v_job_ids uuid[];
  v_items jsonb;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select coalesce(array_agg(j.id order by j.id), '{}'::uuid[])
    into v_job_ids
  from public.hc_jobs j
  where j.source_type = 'market'
    and j.source_id = p_hm_job_id;

  if cardinality(v_job_ids) = 0 then
    -- Not synced to Hoiku Color (no active facility link). Nothing to configure.
    return jsonb_build_object('linked', false, 'items', '[]'::jsonb);
  end if;

  if exists (
    select 1 from public.hc_jobs j
    where j.id = any(v_job_ids)
      and not (case when p_write then ho_private.recruitment_can_write(j.facility_id)
                    else ho_private.recruitment_can_read(j.facility_id) end)
  ) then
    raise exception 'recruitment access denied' using errcode = '42501';
  end if;

  if p_write then
    v_items := ho_private.hc_document_requirements_normalize(p_items);

    -- Serialise concurrent saves of the same Poppy job.
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('hc-job-document-requirements|' || p_hm_job_id::text, 0));

    delete from public.hc_job_document_requirements r
    where r.job_id = any(v_job_ids)
      and not exists (
        select 1 from jsonb_array_elements(v_items) i
        where i ->> 'document_type' = r.document_type
      );

    insert into public.hc_job_document_requirements (job_id, document_type, requirement, note, created_by, updated_by)
    select j.id, i ->> 'document_type', i ->> 'requirement', i ->> 'note', v_user_id, v_user_id
    from unnest(v_job_ids) as j(id)
    cross join jsonb_array_elements(v_items) i
    on conflict (job_id, document_type) do update
      set requirement = excluded.requirement,
          note = excluded.note,
          updated_by = excluded.updated_by,
          updated_at = now()
      where public.hc_job_document_requirements.requirement is distinct from excluded.requirement
         or public.hc_job_document_requirements.note is distinct from excluded.note;
  end if;

  -- All synced rows carry the same list; read it from the first one.
  select coalesce(jsonb_agg(jsonb_build_object('document_type', r.document_type, 'requirement', r.requirement, 'note', r.note) order by r.document_type), '[]'::jsonb)
    into v_items
  from public.hc_job_document_requirements r
  where r.job_id = v_job_ids[1];

  return jsonb_build_object('linked', true, 'items', v_items);
end;
$function$;

revoke all on function ho_private.hc_employer_market_job_document_requirements_impl(uuid,jsonb,boolean) from public, anon, authenticated;

create or replace function public.hc_employer_get_market_job_document_requirements(p_hm_job_id uuid)
returns jsonb
language sql
security definer
set search_path to ''
as $function$
  select ho_private.hc_employer_market_job_document_requirements_impl(p_hm_job_id, null, false);
$function$;

create or replace function public.hc_employer_set_market_job_document_requirements(p_hm_job_id uuid, p_items jsonb)
returns jsonb
language sql
security definer
set search_path to ''
as $function$
  select ho_private.hc_employer_market_job_document_requirements_impl(p_hm_job_id, p_items, true);
$function$;

revoke all on function public.hc_employer_get_market_job_document_requirements(uuid) from public, anon;
revoke all on function public.hc_employer_set_market_job_document_requirements(uuid,jsonb) from public, anon;
grant execute on function public.hc_employer_get_market_job_document_requirements(uuid) to authenticated;
grant execute on function public.hc_employer_set_market_job_document_requirements(uuid,jsonb) to authenticated;
