-- Fix: hc_jobseeker_list_saved_jobs_with_status_v2 returned 33 columns (the inner
-- saved_at sort key leaked through `select *`) against a 32-column declared result,
-- so every call failed with 42804 and the candidate 気になる screen showed an error.
-- The outer query now lists exactly the declared columns; saved_at is used only for
-- ordering. Security definer, empty search_path, the Clerk-subject guard, owner
-- scoping and grants are unchanged (create or replace keeps existing grants).

create or replace function public.hc_jobseeker_list_saved_jobs_with_status_v2()
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
  verified_finance jsonb,
  source_kind text,
  source_name text,
  source_job_id text,
  source_url text,
  source_last_verified_at timestamptz,
  is_external boolean,
  can_apply_direct boolean,
  is_open boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor text := nullif((select auth.jwt()) ->> 'sub', '');
begin
  if v_actor is null then
    raise exception 'HC_JOBSEEKER_AUTH_REQUIRED' using errcode = '42501';
  end if;

  return query
  select
    q.id,
    q.facility_id,
    q.facility_name,
    q.facility_type,
    q.prefecture,
    q.city,
    q.address,
    q.title,
    q.description,
    q.employment_type,
    q.salary_type,
    q.salary_min,
    q.salary_max,
    q.salary_note,
    q.working_hours,
    q.holidays,
    q.required_qualification,
    q.benefits,
    q.number_of_positions,
    q.published_at,
    q.closing_at,
    q.spot_break_minutes,
    q.verified_workplace,
    q.verified_finance,
    q.source_kind,
    q.source_name,
    q.source_job_id,
    q.source_url,
    q.source_last_verified_at,
    q.is_external,
    q.can_apply_direct,
    q.is_open
  from (
    select
      r.id,
      r.facility_id,
      r.facility_name,
      r.facility_type,
      r.prefecture,
      r.city,
      r.jobseeker_address as address,
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
      case when f.facility_id is null then null else to_jsonb(f) end as verified_finance,
      'hoiku_color'::text as source_kind,
      null::text as source_name,
      null::text as source_job_id,
      null::text as source_url,
      null::timestamptz as source_last_verified_at,
      false as is_external,
      true as can_apply_direct,
      (r.closing_at is null or r.closing_at >= now()) as is_open,
      s.created_at as saved_at
    from public.hc_saved_jobs s
    join hc_feed_private.public_job_rows r on r.id = s.job_id
    left join public.hc_public_workplace_profiles w on w.facility_id = r.facility_id
    left join public.hc_public_finance_profiles f on f.facility_id = r.facility_id
    where s.clerk_user_id = v_actor

    union all

    select
      e.id,
      e.id as facility_id,
      e.facility_name,
      e.facility_type,
      e.prefecture,
      e.city,
      e.address,
      e.title,
      e.description,
      e.employment_type,
      e.salary_type,
      e.salary_min,
      e.salary_max,
      e.salary_note,
      e.working_hours,
      e.holidays,
      e.required_qualification,
      e.benefits,
      e.number_of_positions,
      e.published_at,
      e.closing_at,
      null::integer as spot_break_minutes,
      null::jsonb as verified_workplace,
      null::jsonb as verified_finance,
      e.source as source_kind,
      case when e.source = 'hellowork' then 'ハローワーク' else e.source end as source_name,
      e.source_job_id,
      e.source_url,
      e.last_verified_at as source_last_verified_at,
      true as is_external,
      false as can_apply_direct,
      true as is_open,
      s.created_at as saved_at
    from public.hc_saved_external_jobs s
    join public.hc_external_job_public_feed e on e.id = s.external_job_id
    where s.clerk_user_id = v_actor
  ) q
  order by q.saved_at desc, q.id desc;
end;
$$;

revoke all on function public.hc_jobseeker_list_saved_jobs_with_status_v2() from public, anon;
grant execute on function public.hc_jobseeker_list_saved_jobs_with_status_v2() to authenticated, service_role;
