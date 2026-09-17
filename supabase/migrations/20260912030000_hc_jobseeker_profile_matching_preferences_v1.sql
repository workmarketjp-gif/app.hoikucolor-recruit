alter table public.hc_jobseeker_profiles
  add column if not exists desired_prefectures text[] not null default '{}'::text[],
  add column if not exists desired_cities text[] not null default '{}'::text[],
  add column if not exists desired_monthly_salary_min integer,
  add column if not exists desired_hourly_wage_min integer,
  add column if not exists available_weekdays text[] not null default '{}'::text[],
  add column if not exists available_time_from time without time zone,
  add column if not exists available_time_to time without time zone,
  add column if not exists max_commute_minutes integer,
  add column if not exists classroom_experience text[] not null default '{}'::text[],
  add column if not exists leadership_roles text[] not null default '{}'::text[],
  add column if not exists preferred_child_ages text[] not null default '{}'::text[],
  add column if not exists childcare_values text[] not null default '{}'::text[],
  add column if not exists work_preferences text[] not null default '{}'::text[];

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'hc_jobseeker_profiles_monthly_salary_nonnegative') then
    alter table public.hc_jobseeker_profiles add constraint hc_jobseeker_profiles_monthly_salary_nonnegative check (desired_monthly_salary_min is null or desired_monthly_salary_min >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'hc_jobseeker_profiles_hourly_wage_nonnegative') then
    alter table public.hc_jobseeker_profiles add constraint hc_jobseeker_profiles_hourly_wage_nonnegative check (desired_hourly_wage_min is null or desired_hourly_wage_min >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'hc_jobseeker_profiles_commute_minutes_range') then
    alter table public.hc_jobseeker_profiles add constraint hc_jobseeker_profiles_commute_minutes_range check (max_commute_minutes is null or max_commute_minutes between 1 and 300);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'hc_jobseeker_profiles_available_time_order') then
    alter table public.hc_jobseeker_profiles add constraint hc_jobseeker_profiles_available_time_order check (available_time_from is null or available_time_to is null or available_time_from < available_time_to);
  end if;
end $$;

create or replace function hc_private.hc_jobseeker_anonymous_scout_snapshot(p_jobseeker_clerk_user_id text, p_organization_id uuid)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select case
    when not hc_private.hc_jobseeker_is_scoutable_for_org(p_jobseeker_clerk_user_id, p_organization_id) then null
    else (
      select jsonb_build_object(
        'prefecture', p.prefecture,
        'desired_positions', p.desired_positions,
        'desired_employment_types', p.desired_employment_types,
        'qualifications', p.qualifications,
        'years_of_experience', p.years_of_experience,
        'desired_start_date', p.desired_start_date,
        'desired_prefectures', p.desired_prefectures,
        'desired_cities', p.desired_cities,
        'desired_monthly_salary_min', p.desired_monthly_salary_min,
        'desired_hourly_wage_min', p.desired_hourly_wage_min,
        'available_weekdays', p.available_weekdays,
        'available_time_from', p.available_time_from,
        'available_time_to', p.available_time_to,
        'max_commute_minutes', p.max_commute_minutes,
        'classroom_experience', p.classroom_experience,
        'leadership_roles', p.leadership_roles,
        'preferred_child_ages', p.preferred_child_ages,
        'childcare_values', p.childcare_values,
        'work_preferences', p.work_preferences
      )
      from public.hc_jobseeker_profiles p
      where p.clerk_user_id = p_jobseeker_clerk_user_id
    )
  end;
$$;

revoke all on function hc_private.hc_jobseeker_anonymous_scout_snapshot(text, uuid) from public, anon, authenticated;
grant execute on function hc_private.hc_jobseeker_anonymous_scout_snapshot(text, uuid) to service_role;

comment on function hc_private.hc_jobseeker_anonymous_scout_snapshot(text, uuid) is 'Anonymous scout projection for matching. Includes structured experience, availability, location, compensation and childcare-value preferences, but deliberately excludes name, kana, email, phone, Clerk ID, self introduction and employer identity. Returns null unless scout opt-in is enabled and the receiving organization is not manually or automatically blocked.';
