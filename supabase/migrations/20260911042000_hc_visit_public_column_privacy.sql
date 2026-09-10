-- Hoiku Color: public visit availability may be read anonymously, but internal updater identity must never be exposed.
-- Keep RLS row filtering and replace table-wide SELECT with an explicit public column allow-list.

revoke select on table public.hc_visit_settings from anon;

grant select (
  id,
  organization_id,
  facility_id,
  visit_enabled,
  half_day_trial_enabled,
  full_day_trial_enabled,
  available_weekdays,
  first_start_time,
  last_start_time,
  slot_interval_minutes,
  visit_duration_minutes,
  half_day_duration_minutes,
  full_day_duration_minutes,
  capacity_per_slot,
  min_notice_hours,
  max_days_ahead,
  public_note,
  what_to_bring,
  dress_code,
  created_at,
  updated_at
) on table public.hc_visit_settings to anon;

-- updated_by_clerk_user_id intentionally remains unavailable to anon.
