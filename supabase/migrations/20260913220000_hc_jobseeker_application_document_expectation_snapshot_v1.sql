create table if not exists public.hc_application_document_expectations (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.hc_applications(id) on delete cascade,
  jobseeker_clerk_user_id text not null,
  source_jobseeker_document_id_snapshot uuid not null,
  document_type text not null check (document_type in ('resume','work_history','nursery_teacher_license','kindergarten_license','other')),
  title text not null check (length(btrim(title)) between 1 and 240),
  destination_file_path text not null,
  captured_at timestamptz not null default now(),
  constraint hc_application_document_expectations_application_source_key unique (application_id, source_jobseeker_document_id_snapshot),
  constraint hc_application_document_expectations_application_type_key unique (application_id, document_type),
  constraint hc_application_document_expectations_destination_key unique (destination_file_path)
);

create index if not exists hc_application_document_expectations_owner_idx
  on public.hc_application_document_expectations (jobseeker_clerk_user_id, captured_at desc);

alter table public.hc_application_document_expectations enable row level security;

revoke all on table public.hc_application_document_expectations from public, anon, authenticated;
grant select on table public.hc_application_document_expectations to authenticated;

drop policy if exists hc_application_document_expectations_select_own on public.hc_application_document_expectations;
create policy hc_application_document_expectations_select_own
  on public.hc_application_document_expectations
  for select
  to authenticated
  using (jobseeker_clerk_user_id = ((select auth.jwt()) ->> 'sub'));

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
