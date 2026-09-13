-- Hoiku Color jobseeker application history/detail read model.
-- Production migration: 20260912000442_hc_jobseeker_application_detail_v1.
-- Candidate reads are projected through narrow SECURITY DEFINER RPCs so facility-only notes/results remain private.

create or replace function public.hc_jobseeker_list_applications()
returns table (
  id uuid,
  job_id uuid,
  applicant_name text,
  status text,
  desired_start_date date,
  message text,
  applied_at timestamptz,
  updated_at timestamptz,
  job_title text,
  employment_type text,
  facility_name text,
  prefecture text,
  city text
)
language sql
stable
security definer
set search_path = public, ho_private, pg_temp
as $$
  select
    a.id,
    a.job_id,
    a.applicant_name,
    a.status,
    a.desired_start_date,
    a.message,
    a.applied_at,
    a.updated_at,
    j.title as job_title,
    j.employment_type,
    f.name as facility_name,
    f.prefecture,
    f.city
  from public.hc_applications a
  join public.hc_jobs j
    on j.id = a.job_id
   and j.organization_id = a.organization_id
   and j.facility_id = a.facility_id
  join public.ho_facilities f
    on f.id = a.facility_id
   and f.organization_id = a.organization_id
  where a.jobseeker_clerk_user_id = ho_private.current_clerk_user_id()
  order by a.applied_at desc;
$$;

create or replace function public.hc_jobseeker_get_application_detail(p_application_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, ho_private, pg_temp
as $$
  select jsonb_build_object(
    'application', jsonb_build_object(
      'id', a.id,
      'job_id', a.job_id,
      'applicant_name', a.applicant_name,
      'status', a.status,
      'desired_start_date', a.desired_start_date,
      'message', a.message,
      'applied_at', a.applied_at,
      'updated_at', a.updated_at,
      'job_title', j.title,
      'employment_type', j.employment_type,
      'facility_name', f.name,
      'prefecture', f.prefecture,
      'city', f.city
    ),
    'interviews', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id,
        'application_id', i.application_id,
        'scheduled_at', i.scheduled_at,
        'duration_minutes', i.duration_minutes,
        'location', i.location,
        'meeting_url', i.meeting_url,
        'status', i.status,
        'updated_at', i.updated_at
      ) order by i.scheduled_at desc)
      from public.hc_interviews i
      where i.application_id = a.id
        and i.organization_id = a.organization_id
        and i.facility_id = a.facility_id
    ), '[]'::jsonb),
    'visits', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id,
        'application_id', r.application_id,
        'job_id', r.job_id,
        'experience_type', r.experience_type,
        'starts_at', r.starts_at,
        'ends_at', r.ends_at,
        'status', r.status,
        'candidate_message', r.candidate_message,
        'confirmed_at', r.confirmed_at,
        'cancelled_at', r.cancelled_at,
        'completed_at', r.completed_at,
        'updated_at', r.updated_at
      ) order by r.starts_at desc)
      from public.hc_visit_reservations r
      where r.jobseeker_clerk_user_id = ho_private.current_clerk_user_id()
        and r.organization_id = a.organization_id
        and r.facility_id = a.facility_id
        and r.job_id = a.job_id
        and (r.application_id = a.id or r.application_id is null)
    ), '[]'::jsonb)
  )
  from public.hc_applications a
  join public.hc_jobs j
    on j.id = a.job_id
   and j.organization_id = a.organization_id
   and j.facility_id = a.facility_id
  join public.ho_facilities f
    on f.id = a.facility_id
   and f.organization_id = a.organization_id
  where a.id = p_application_id
    and a.jobseeker_clerk_user_id = ho_private.current_clerk_user_id();
$$;

revoke all on function public.hc_jobseeker_list_applications() from public, anon;
revoke all on function public.hc_jobseeker_get_application_detail(uuid) from public, anon;
grant execute on function public.hc_jobseeker_list_applications() to authenticated, service_role;
grant execute on function public.hc_jobseeker_get_application_detail(uuid) to authenticated, service_role;
