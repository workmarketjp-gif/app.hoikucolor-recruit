create or replace function public.hc_jobseeker_get_visit_settings(p_job_id uuid)
returns table (
  id uuid,
  facility_id uuid,
  visit_enabled boolean,
  half_day_trial_enabled boolean,
  full_day_trial_enabled boolean,
  available_weekdays smallint[],
  first_start_time time,
  last_start_time time,
  slot_interval_minutes integer,
  visit_duration_minutes integer,
  half_day_duration_minutes integer,
  full_day_duration_minutes integer,
  min_notice_hours integer,
  max_days_ahead integer,
  public_note text,
  what_to_bring text,
  dress_code text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    s.id,
    s.facility_id,
    s.visit_enabled,
    s.half_day_trial_enabled,
    s.full_day_trial_enabled,
    s.available_weekdays,
    s.first_start_time,
    s.last_start_time,
    s.slot_interval_minutes,
    s.visit_duration_minutes,
    s.half_day_duration_minutes,
    s.full_day_duration_minutes,
    s.min_notice_hours,
    s.max_days_ahead,
    s.public_note,
    s.what_to_bring,
    s.dress_code
  from public.hc_jobseeker_job_feed j
  join public.hc_visit_settings s on s.facility_id = j.facility_id
  where ho_private.current_clerk_user_id() is not null
    and j.id = p_job_id
    and (s.visit_enabled or s.half_day_trial_enabled or s.full_day_trial_enabled)
  limit 1;
$$;

revoke all on function public.hc_jobseeker_get_visit_settings(uuid) from public, anon, authenticated;
grant execute on function public.hc_jobseeker_get_visit_settings(uuid) to authenticated, service_role;
