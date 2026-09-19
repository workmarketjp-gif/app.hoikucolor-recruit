-- Hoiku Color Candidate Web — profile / matching-preference JWT-owned RPC boundary v1.
-- Production migration version: 20260919020215.
-- Production already has this migration. Repository sync must NOT re-apply it there.
--
-- Candidate PII stays RLS-protected for the currently deployed Web, while new Web/Native
-- clients can stop submitting Clerk identity as mutable browser data.

create or replace function public.hc_jobseeker_get_profile()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor text := nullif((select auth.jwt()) ->> 'sub', '');
  v_result jsonb;
begin
  if v_actor is null then
    raise exception 'HC_JOBSEEKER_AUTH_REQUIRED' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'clerk_user_id', p.clerk_user_id,
    'email', p.email,
    'name', p.name,
    'name_kana', p.name_kana,
    'phone', p.phone,
    'prefecture', p.prefecture,
    'desired_positions', p.desired_positions,
    'desired_employment_types', p.desired_employment_types,
    'qualifications', p.qualifications,
    'years_of_experience', p.years_of_experience,
    'desired_start_date', p.desired_start_date,
    'self_intro', p.self_intro
  ) into v_result
  from public.hc_jobseeker_profiles p
  where p.clerk_user_id = v_actor;

  return v_result;
end;
$$;

revoke all on function public.hc_jobseeker_get_profile()
  from public, anon, authenticated, service_role;
grant execute on function public.hc_jobseeker_get_profile()
  to authenticated;

create or replace function public.hc_jobseeker_upsert_profile(
  p_email text,
  p_name text,
  p_name_kana text,
  p_phone text,
  p_prefecture text,
  p_desired_positions text[],
  p_desired_employment_types text[],
  p_qualifications text[],
  p_years_of_experience numeric,
  p_desired_start_date date,
  p_self_intro text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor text := nullif((select auth.jwt()) ->> 'sub', '');
  v_result jsonb;
begin
  if v_actor is null then
    raise exception 'HC_JOBSEEKER_AUTH_REQUIRED' using errcode = '42501';
  end if;

  if p_email is not null and char_length(p_email) > 320 then
    raise exception 'HC_PROFILE_EMAIL_TOO_LONG' using errcode = '22023';
  end if;
  if p_name is not null and char_length(p_name) > 200 then
    raise exception 'HC_PROFILE_NAME_TOO_LONG' using errcode = '22023';
  end if;
  if p_name_kana is not null and char_length(p_name_kana) > 200 then
    raise exception 'HC_PROFILE_NAME_KANA_TOO_LONG' using errcode = '22023';
  end if;
  if p_phone is not null and char_length(p_phone) > 50 then
    raise exception 'HC_PROFILE_PHONE_TOO_LONG' using errcode = '22023';
  end if;
  if p_prefecture is not null and char_length(p_prefecture) > 100 then
    raise exception 'HC_PROFILE_PREFECTURE_TOO_LONG' using errcode = '22023';
  end if;
  if p_self_intro is not null and char_length(p_self_intro) > 5000 then
    raise exception 'HC_PROFILE_SELF_INTRO_TOO_LONG' using errcode = '22023';
  end if;
  if p_years_of_experience is not null and (p_years_of_experience < 0 or p_years_of_experience > 80) then
    raise exception 'HC_PROFILE_EXPERIENCE_OUT_OF_RANGE' using errcode = '22023';
  end if;
  if cardinality(coalesce(p_desired_positions, '{}'::text[])) > 50
     or cardinality(coalesce(p_desired_employment_types, '{}'::text[])) > 50
     or cardinality(coalesce(p_qualifications, '{}'::text[])) > 50 then
    raise exception 'HC_PROFILE_ARRAY_TOO_LARGE' using errcode = '22023';
  end if;

  insert into public.hc_jobseeker_profiles(
    clerk_user_id, email, name, name_kana, phone, prefecture,
    desired_positions, desired_employment_types, qualifications,
    years_of_experience, desired_start_date, self_intro, updated_at
  ) values (
    v_actor,
    nullif(btrim(coalesce(p_email, '')), ''),
    nullif(btrim(coalesce(p_name, '')), ''),
    nullif(btrim(coalesce(p_name_kana, '')), ''),
    nullif(btrim(coalesce(p_phone, '')), ''),
    nullif(btrim(coalesce(p_prefecture, '')), ''),
    coalesce(p_desired_positions, '{}'::text[]),
    coalesce(p_desired_employment_types, '{}'::text[]),
    coalesce(p_qualifications, '{}'::text[]),
    p_years_of_experience,
    p_desired_start_date,
    nullif(btrim(coalesce(p_self_intro, '')), ''),
    now()
  )
  on conflict (clerk_user_id) do update set
    email = excluded.email,
    name = excluded.name,
    name_kana = excluded.name_kana,
    phone = excluded.phone,
    prefecture = excluded.prefecture,
    desired_positions = excluded.desired_positions,
    desired_employment_types = excluded.desired_employment_types,
    qualifications = excluded.qualifications,
    years_of_experience = excluded.years_of_experience,
    desired_start_date = excluded.desired_start_date,
    self_intro = excluded.self_intro,
    updated_at = now();

  select jsonb_build_object(
    'clerk_user_id', p.clerk_user_id,
    'email', p.email,
    'name', p.name,
    'name_kana', p.name_kana,
    'phone', p.phone,
    'prefecture', p.prefecture,
    'desired_positions', p.desired_positions,
    'desired_employment_types', p.desired_employment_types,
    'qualifications', p.qualifications,
    'years_of_experience', p.years_of_experience,
    'desired_start_date', p.desired_start_date,
    'self_intro', p.self_intro
  ) into v_result
  from public.hc_jobseeker_profiles p
  where p.clerk_user_id = v_actor;

  return v_result;
end;
$$;

revoke all on function public.hc_jobseeker_upsert_profile(text,text,text,text,text,text[],text[],text[],numeric,date,text)
  from public, anon, authenticated, service_role;
grant execute on function public.hc_jobseeker_upsert_profile(text,text,text,text,text,text[],text[],text[],numeric,date,text)
  to authenticated;

create or replace function public.hc_jobseeker_get_matching_preferences()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor text := nullif((select auth.jwt()) ->> 'sub', '');
  v_result jsonb;
begin
  if v_actor is null then
    raise exception 'HC_JOBSEEKER_AUTH_REQUIRED' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'desired_prefectures', p.desired_prefectures,
    'desired_cities', p.desired_cities,
    'desired_monthly_salary_min', p.desired_monthly_salary_min,
    'desired_hourly_wage_min', p.desired_hourly_wage_min,
    'available_weekdays', p.available_weekdays,
    'available_time_from', case when p.available_time_from is null then null else to_char(p.available_time_from, 'HH24:MI') end,
    'available_time_to', case when p.available_time_to is null then null else to_char(p.available_time_to, 'HH24:MI') end,
    'max_commute_minutes', p.max_commute_minutes,
    'classroom_experience', p.classroom_experience,
    'leadership_roles', p.leadership_roles,
    'preferred_child_ages', p.preferred_child_ages,
    'childcare_values', p.childcare_values,
    'work_preferences', p.work_preferences
  ) into v_result
  from public.hc_jobseeker_profiles p
  where p.clerk_user_id = v_actor;

  return coalesce(v_result, jsonb_build_object(
    'desired_prefectures', '[]'::jsonb,
    'desired_cities', '[]'::jsonb,
    'desired_monthly_salary_min', null,
    'desired_hourly_wage_min', null,
    'available_weekdays', '[]'::jsonb,
    'available_time_from', null,
    'available_time_to', null,
    'max_commute_minutes', null,
    'classroom_experience', '[]'::jsonb,
    'leadership_roles', '[]'::jsonb,
    'preferred_child_ages', '[]'::jsonb,
    'childcare_values', '[]'::jsonb,
    'work_preferences', '[]'::jsonb
  ));
end;
$$;

revoke all on function public.hc_jobseeker_get_matching_preferences()
  from public, anon, authenticated, service_role;
grant execute on function public.hc_jobseeker_get_matching_preferences()
  to authenticated;

create or replace function public.hc_jobseeker_upsert_matching_preferences(
  p_desired_prefectures text[],
  p_desired_cities text[],
  p_desired_monthly_salary_min integer,
  p_desired_hourly_wage_min integer,
  p_available_weekdays text[],
  p_available_time_from time without time zone,
  p_available_time_to time without time zone,
  p_max_commute_minutes integer,
  p_classroom_experience text[],
  p_leadership_roles text[],
  p_preferred_child_ages text[],
  p_childcare_values text[],
  p_work_preferences text[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor text := nullif((select auth.jwt()) ->> 'sub', '');
  v_result jsonb;
begin
  if v_actor is null then
    raise exception 'HC_JOBSEEKER_AUTH_REQUIRED' using errcode = '42501';
  end if;

  if cardinality(coalesce(p_desired_prefectures, '{}'::text[])) > 50
     or cardinality(coalesce(p_desired_cities, '{}'::text[])) > 100
     or cardinality(coalesce(p_available_weekdays, '{}'::text[])) > 7
     or cardinality(coalesce(p_classroom_experience, '{}'::text[])) > 50
     or cardinality(coalesce(p_leadership_roles, '{}'::text[])) > 50
     or cardinality(coalesce(p_preferred_child_ages, '{}'::text[])) > 50
     or cardinality(coalesce(p_childcare_values, '{}'::text[])) > 50
     or cardinality(coalesce(p_work_preferences, '{}'::text[])) > 50 then
    raise exception 'HC_MATCHING_PREFERENCES_ARRAY_TOO_LARGE' using errcode = '22023';
  end if;

  insert into public.hc_jobseeker_profiles(
    clerk_user_id,
    desired_prefectures, desired_cities,
    desired_monthly_salary_min, desired_hourly_wage_min,
    available_weekdays, available_time_from, available_time_to,
    max_commute_minutes, classroom_experience, leadership_roles,
    preferred_child_ages, childcare_values, work_preferences, updated_at
  ) values (
    v_actor,
    coalesce(p_desired_prefectures, '{}'::text[]),
    coalesce(p_desired_cities, '{}'::text[]),
    p_desired_monthly_salary_min,
    p_desired_hourly_wage_min,
    coalesce(p_available_weekdays, '{}'::text[]),
    p_available_time_from,
    p_available_time_to,
    p_max_commute_minutes,
    coalesce(p_classroom_experience, '{}'::text[]),
    coalesce(p_leadership_roles, '{}'::text[]),
    coalesce(p_preferred_child_ages, '{}'::text[]),
    coalesce(p_childcare_values, '{}'::text[]),
    coalesce(p_work_preferences, '{}'::text[]),
    now()
  )
  on conflict (clerk_user_id) do update set
    desired_prefectures = excluded.desired_prefectures,
    desired_cities = excluded.desired_cities,
    desired_monthly_salary_min = excluded.desired_monthly_salary_min,
    desired_hourly_wage_min = excluded.desired_hourly_wage_min,
    available_weekdays = excluded.available_weekdays,
    available_time_from = excluded.available_time_from,
    available_time_to = excluded.available_time_to,
    max_commute_minutes = excluded.max_commute_minutes,
    classroom_experience = excluded.classroom_experience,
    leadership_roles = excluded.leadership_roles,
    preferred_child_ages = excluded.preferred_child_ages,
    childcare_values = excluded.childcare_values,
    work_preferences = excluded.work_preferences,
    updated_at = now();

  select jsonb_build_object(
    'desired_prefectures', p.desired_prefectures,
    'desired_cities', p.desired_cities,
    'desired_monthly_salary_min', p.desired_monthly_salary_min,
    'desired_hourly_wage_min', p.desired_hourly_wage_min,
    'available_weekdays', p.available_weekdays,
    'available_time_from', case when p.available_time_from is null then null else to_char(p.available_time_from, 'HH24:MI') end,
    'available_time_to', case when p.available_time_to is null then null else to_char(p.available_time_to, 'HH24:MI') end,
    'max_commute_minutes', p.max_commute_minutes,
    'classroom_experience', p.classroom_experience,
    'leadership_roles', p.leadership_roles,
    'preferred_child_ages', p.preferred_child_ages,
    'childcare_values', p.childcare_values,
    'work_preferences', p.work_preferences
  ) into v_result
  from public.hc_jobseeker_profiles p
  where p.clerk_user_id = v_actor;

  return v_result;
end;
$$;

revoke all on function public.hc_jobseeker_upsert_matching_preferences(text[],text[],integer,integer,text[],time without time zone,time without time zone,integer,text[],text[],text[],text[],text[])
  from public, anon, authenticated, service_role;
grant execute on function public.hc_jobseeker_upsert_matching_preferences(text[],text[],integer,integer,text[],time without time zone,time without time zone,integer,text[],text[],text[],text[],text[])
  to authenticated;
