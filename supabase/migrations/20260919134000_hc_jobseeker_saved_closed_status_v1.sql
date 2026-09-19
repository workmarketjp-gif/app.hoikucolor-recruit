-- HC-W02: preserve saved-job visibility after a published deadline expires.
-- Search/ranking continues to use public.hc_jobseeker_job_feed (open jobs only).
-- Saved jobs use the private public-feed cache so a job that is still published
-- but has passed closing_at can be shown as 募集終了 instead of disappearing.
-- Jobs removed from the canonical published cache remain hidden.

create or replace function public.hc_jobseeker_list_saved_jobs_with_status()
returns table(
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
    (r.closing_at is null or r.closing_at >= now()) as is_open
  from public.hc_saved_jobs s
  join hc_feed_private.public_job_rows r on r.id = s.job_id
  left join public.hc_public_workplace_profiles w on w.facility_id = r.facility_id
  left join public.hc_public_finance_profiles f on f.facility_id = r.facility_id
  where s.clerk_user_id = v_actor
  order by s.created_at desc, s.id desc;
end;
$$;

revoke all on function public.hc_jobseeker_list_saved_jobs_with_status()
  from public, anon, authenticated, service_role;
grant execute on function public.hc_jobseeker_list_saved_jobs_with_status()
  to authenticated;
