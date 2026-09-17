create or replace function public.hc_list_my_visit_reservations(p_job_id uuid default null)
returns table (
  id uuid,
  facility_id uuid,
  job_id uuid,
  application_id uuid,
  experience_type text,
  starts_at timestamptz,
  ends_at timestamptz,
  status text,
  candidate_message text,
  confirmed_at timestamptz,
  cancelled_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    r.id,
    r.facility_id,
    r.job_id,
    r.application_id,
    r.experience_type,
    r.starts_at,
    r.ends_at,
    r.status,
    r.candidate_message,
    r.confirmed_at,
    r.cancelled_at,
    r.completed_at,
    r.created_at,
    r.updated_at
  from public.hc_visit_reservations r
  where ho_private.current_clerk_user_id() is not null
    and r.jobseeker_clerk_user_id = ho_private.current_clerk_user_id()
    and (p_job_id is null or r.job_id = p_job_id)
  order by r.starts_at asc;
$$;

revoke all on function public.hc_list_my_visit_reservations(uuid) from public, anon, authenticated;
grant execute on function public.hc_list_my_visit_reservations(uuid) to authenticated, service_role;
