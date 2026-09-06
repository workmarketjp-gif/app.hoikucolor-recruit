-- Hoiku Color jobseeker portal
-- Shared Supabase project: kcmmpjyngcysdfbumchk

create table if not exists public.hc_jobseeker_profiles (
  id uuid primary key default gen_random_uuid(),
  clerk_user_id text not null unique,
  email text,
  name text,
  name_kana text,
  phone text,
  prefecture text,
  desired_positions text[] not null default '{}',
  desired_employment_types text[] not null default '{}',
  qualifications text[] not null default '{}',
  years_of_experience numeric,
  desired_start_date date,
  self_intro text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.hc_jobseeker_profiles enable row level security;

drop policy if exists hc_jobseeker_profiles_select_own on public.hc_jobseeker_profiles;
create policy hc_jobseeker_profiles_select_own
on public.hc_jobseeker_profiles for select to authenticated
using (clerk_user_id = (auth.jwt() ->> 'sub'));

drop policy if exists hc_jobseeker_profiles_insert_own on public.hc_jobseeker_profiles;
create policy hc_jobseeker_profiles_insert_own
on public.hc_jobseeker_profiles for insert to authenticated
with check (clerk_user_id = (auth.jwt() ->> 'sub'));

drop policy if exists hc_jobseeker_profiles_update_own on public.hc_jobseeker_profiles;
create policy hc_jobseeker_profiles_update_own
on public.hc_jobseeker_profiles for update to authenticated
using (clerk_user_id = (auth.jwt() ->> 'sub'))
with check (clerk_user_id = (auth.jwt() ->> 'sub'));

grant select, insert, update on public.hc_jobseeker_profiles to authenticated;

create table if not exists public.hc_saved_jobs (
  id uuid primary key default gen_random_uuid(),
  clerk_user_id text not null,
  job_id uuid not null references public.hc_jobs(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (clerk_user_id, job_id)
);

create index if not exists hc_saved_jobs_user_created_idx on public.hc_saved_jobs(clerk_user_id, created_at desc);
create index if not exists hc_saved_jobs_job_idx on public.hc_saved_jobs(job_id);

alter table public.hc_saved_jobs enable row level security;

drop policy if exists hc_saved_jobs_select_own on public.hc_saved_jobs;
create policy hc_saved_jobs_select_own
on public.hc_saved_jobs for select to authenticated
using (clerk_user_id = (auth.jwt() ->> 'sub'));

drop policy if exists hc_saved_jobs_insert_own on public.hc_saved_jobs;
create policy hc_saved_jobs_insert_own
on public.hc_saved_jobs for insert to authenticated
with check (
  clerk_user_id = (auth.jwt() ->> 'sub')
  and exists (
    select 1 from public.hc_jobs j
    where j.id = job_id
      and j.status = 'published'
      and (j.closing_at is null or j.closing_at >= now())
  )
);

drop policy if exists hc_saved_jobs_delete_own on public.hc_saved_jobs;
create policy hc_saved_jobs_delete_own
on public.hc_saved_jobs for delete to authenticated
using (clerk_user_id = (auth.jwt() ->> 'sub'));

grant select, insert, delete on public.hc_saved_jobs to authenticated;

alter table public.hc_applications
  add column if not exists jobseeker_clerk_user_id text;

create index if not exists hc_applications_jobseeker_idx
  on public.hc_applications(jobseeker_clerk_user_id, applied_at desc)
  where jobseeker_clerk_user_id is not null;

drop policy if exists hc_applications_jobseeker_select_own on public.hc_applications;
create policy hc_applications_jobseeker_select_own
on public.hc_applications for select to authenticated
using (jobseeker_clerk_user_id = (auth.jwt() ->> 'sub'));

grant select on public.hc_applications to authenticated;

-- A deliberately narrow read model for jobseekers.
-- The view exposes only recruiting/public facility fields, never Hoiku Office operational data.
create or replace view public.hc_jobseeker_job_feed
with (security_barrier = true)
as
select
  j.id,
  j.facility_id,
  f.name as facility_name,
  f.facility_type,
  f.prefecture,
  f.city,
  coalesce(f.address_line, f.address) as address,
  j.title,
  j.description,
  j.employment_type,
  j.salary_type,
  j.salary_min,
  j.salary_max,
  j.salary_note,
  j.working_hours,
  j.holidays,
  j.required_qualification,
  j.benefits,
  j.number_of_positions,
  j.published_at,
  j.closing_at
from public.hc_jobs j
join public.ho_facilities f on f.id = j.facility_id
where j.status = 'published'
  and f.status = 'active'
  and (j.closing_at is null or j.closing_at >= now());

revoke all on public.hc_jobseeker_job_feed from anon;
grant select on public.hc_jobseeker_job_feed to authenticated;

-- Canonical application submission entry point for signed-in jobseekers.
-- SECURITY DEFINER is used because hc_applications is primarily protected for facility-side writes.
create or replace function public.hc_jobseeker_submit_application(
  p_job_id uuid,
  p_applicant_name text,
  p_applicant_name_kana text default null,
  p_email text default null,
  p_phone text default null,
  p_qualifications text default null,
  p_years_of_experience numeric default null,
  p_desired_start_date date default null,
  p_message text default null
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id text := auth.jwt() ->> 'sub';
  v_org_id uuid;
  v_facility_id uuid;
  v_application_id uuid;
begin
  if v_user_id is null or btrim(v_user_id) = '' then
    raise exception 'authentication required';
  end if;

  if p_applicant_name is null or btrim(p_applicant_name) = '' then
    raise exception 'applicant name is required';
  end if;

  select organization_id, facility_id
    into v_org_id, v_facility_id
  from public.hc_jobs
  where id = p_job_id
    and status = 'published'
    and (closing_at is null or closing_at >= now())
  limit 1;

  if v_facility_id is null then
    raise exception 'job is not available';
  end if;

  insert into public.hc_applications (
    organization_id, facility_id, job_id,
    applicant_name, applicant_name_kana, email, phone,
    qualifications, years_of_experience, desired_start_date, message,
    status, source_type, jobseeker_clerk_user_id
  ) values (
    v_org_id, v_facility_id, p_job_id,
    btrim(p_applicant_name), nullif(btrim(p_applicant_name_kana), ''), nullif(btrim(p_email), ''), nullif(btrim(p_phone), ''),
    nullif(btrim(p_qualifications), ''), p_years_of_experience, p_desired_start_date, nullif(btrim(p_message), ''),
    'new', 'hoiku_color_jobseeker', v_user_id
  )
  returning id into v_application_id;

  return v_application_id;
end;
$$;

revoke all on function public.hc_jobseeker_submit_application(uuid,text,text,text,text,text,numeric,date,text) from public;
grant execute on function public.hc_jobseeker_submit_application(uuid,text,text,text,text,text,numeric,date,text) to authenticated;
