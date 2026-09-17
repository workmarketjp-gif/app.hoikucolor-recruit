create index if not exists hc_public_job_rows_facility_idx
  on hc_feed_private.public_job_rows (facility_id);

create index if not exists hc_public_job_rows_published_idx
  on hc_feed_private.public_job_rows (published_at desc, id);

create index if not exists hc_public_job_rows_closing_idx
  on hc_feed_private.public_job_rows (closing_at);

create or replace function public.hc_jobseeker_list_ranked_jobs()
returns table (
  id uuid,
  facility_id uuid,
  facility_name text,
  facility_type text,
  prefecture text,
  city text,
  address text,
  title text,
  description text,
  employment_type text,
  salary_type text,
  salary_min integer,
  salary_max integer,
  salary_note text,
  working_hours text,
  holidays text,
  required_qualification text,
  benefits text,
  number_of_positions integer,
  published_at timestamptz,
  closing_at timestamptz,
  spot_break_minutes integer,
  verified_workplace jsonb,
  verified_finance jsonb
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select
    r.id,
    r.facility_id,
    r.facility_name,
    r.facility_type,
    r.prefecture,
    r.city,
    r.address,
    r.title,
    r.description,
    r.employment_type,
    r.salary_type,
    r.salary_min,
    r.salary_max,
    r.salary_note,
    r.working_hours,
    r.holidays,
    r.required_qualification,
    r.benefits,
    r.number_of_positions,
    r.published_at,
    r.closing_at,
    r.spot_break_minutes,
    case when w.facility_id is null then null else to_jsonb(w) end as verified_workplace,
    case when f.facility_id is null then null else to_jsonb(f) end as verified_finance
  from public.hc_jobseeker_job_feed r
  left join public.hc_public_workplace_profiles w on w.facility_id = r.facility_id
  left join public.hc_public_finance_profiles f on f.facility_id = r.facility_id
  order by
    (coalesce(w.quality_points, 0) + coalesce(f.quality_points, 0)) desc,
    (coalesce(w.transparency_pct, 0) + coalesce(f.transparency_pct, 0)) desc,
    r.published_at desc nulls last,
    r.id;
$$;

create or replace function public.hc_jobseeker_get_ranked_job(p_job_id uuid)
returns table (
  id uuid,
  facility_id uuid,
  facility_name text,
  facility_type text,
  prefecture text,
  city text,
  address text,
  title text,
  description text,
  employment_type text,
  salary_type text,
  salary_min integer,
  salary_max integer,
  salary_note text,
  working_hours text,
  holidays text,
  required_qualification text,
  benefits text,
  number_of_positions integer,
  published_at timestamptz,
  closing_at timestamptz,
  spot_break_minutes integer,
  verified_workplace jsonb,
  verified_finance jsonb
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select
    r.id,
    r.facility_id,
    r.facility_name,
    r.facility_type,
    r.prefecture,
    r.city,
    r.address,
    r.title,
    r.description,
    r.employment_type,
    r.salary_type,
    r.salary_min,
    r.salary_max,
    r.salary_note,
    r.working_hours,
    r.holidays,
    r.required_qualification,
    r.benefits,
    r.number_of_positions,
    r.published_at,
    r.closing_at,
    r.spot_break_minutes,
    case when w.facility_id is null then null else to_jsonb(w) end as verified_workplace,
    case when f.facility_id is null then null else to_jsonb(f) end as verified_finance
  from public.hc_jobseeker_job_feed r
  left join public.hc_public_workplace_profiles w on w.facility_id = r.facility_id
  left join public.hc_public_finance_profiles f on f.facility_id = r.facility_id
  where r.id = p_job_id;
$$;

revoke all on function public.hc_jobseeker_list_ranked_jobs() from public, anon;
revoke all on function public.hc_jobseeker_get_ranked_job(uuid) from public, anon;
grant execute on function public.hc_jobseeker_list_ranked_jobs() to authenticated, service_role;
grant execute on function public.hc_jobseeker_get_ranked_job(uuid) to authenticated, service_role;

comment on function public.hc_jobseeker_list_ranked_jobs() is
  'Candidate-safe active job catalog enriched only from public HO/HF Verified profiles and ranked by Verified quality, transparency, freshness.';
comment on function public.hc_jobseeker_get_ranked_job(uuid) is
  'Candidate-safe exact active job lookup for authenticated jobseekers; excludes closed/unpublished rows via hc_jobseeker_job_feed.';

do $$
begin
  if has_function_privilege('anon', 'public.hc_jobseeker_list_ranked_jobs()', 'EXECUTE') then
    raise exception 'anon must not execute hc_jobseeker_list_ranked_jobs';
  end if;
  if not has_function_privilege('authenticated', 'public.hc_jobseeker_list_ranked_jobs()', 'EXECUTE') then
    raise exception 'authenticated must execute hc_jobseeker_list_ranked_jobs';
  end if;
  if has_function_privilege('anon', 'public.hc_jobseeker_get_ranked_job(uuid)', 'EXECUTE') then
    raise exception 'anon must not execute hc_jobseeker_get_ranked_job';
  end if;
  if not has_function_privilege('authenticated', 'public.hc_jobseeker_get_ranked_job(uuid)', 'EXECUTE') then
    raise exception 'authenticated must execute hc_jobseeker_get_ranked_job';
  end if;
end;
$$;
