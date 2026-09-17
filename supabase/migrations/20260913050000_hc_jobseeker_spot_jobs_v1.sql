-- Candidate-safe Hoiku Color spot-job read model and application hardening.
-- Facility-side Hoiku Poppy code is intentionally unchanged.

create or replace function public.hc_jobseeker_list_spot_jobs()
returns table (
  job_id uuid,
  facility_id uuid,
  facility_name text,
  facility_type text,
  prefecture text,
  city text,
  address text,
  title text,
  description text,
  work_date date,
  start_time time,
  end_time time,
  break_minutes integer,
  hourly_rate integer,
  required_count integer,
  confirmed_count integer,
  available_count integer,
  required_qualification text,
  age_group_or_class text,
  facility_message text,
  published_at timestamptz,
  closing_at timestamptz,
  application_id uuid,
  application_status text
)
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_user_id text := auth.jwt() ->> 'sub';
begin
  if v_user_id is null or btrim(v_user_id) = '' then
    raise exception using errcode = '42501', message = 'AUTH_REQUIRED';
  end if;

  return query
  select
    j.id,
    j.facility_id,
    f.name,
    f.facility_type,
    f.prefecture,
    f.city,
    coalesce(f.address_line, f.address),
    j.title,
    j.description,
    s.work_date,
    s.start_time,
    s.end_time,
    s.break_minutes,
    coalesce(s.hourly_wage, s.hourly_rate),
    greatest(coalesce(s.required_count, 1), 1),
    capacity.confirmed_count,
    greatest(greatest(coalesce(s.required_count, 1), 1) - capacity.confirmed_count, 0),
    coalesce(nullif(btrim(s.required_qualification), ''), j.required_qualification),
    nullif(btrim(s.age_group_or_class), ''),
    nullif(btrim(s.facility_message), ''),
    j.published_at,
    j.closing_at,
    mine.id,
    mine.status
  from public.hc_jobs j
  join public.ho_spot_job_drafts s
    on s.id = j.source_id
   and s.organization_id = j.organization_id
   and s.facility_id = j.facility_id
  join public.ho_facilities f
    on f.id = j.facility_id
   and f.organization_id = j.organization_id
  left join lateral (
    select count(*)::integer as confirmed_count
    from public.hc_spot_assignments x
    where x.spot_job_id = s.id
      and x.status in ('confirmed', 'completed')
  ) capacity on true
  left join lateral (
    select a.id, a.status
    from public.hc_applications a
    where a.job_id = j.id
      and a.jobseeker_clerk_user_id = v_user_id
    order by a.applied_at asc
    limit 1
  ) mine on true
  where j.source_type = 'spot_job'
    and j.status = 'published'
    and j.published_at is not null
    and s.status = 'published'
    and f.status = 'active'
    and s.work_date is not null
    and s.start_time is not null
    and s.end_time is not null
    and s.end_time > s.start_time
    and coalesce(s.hourly_wage, s.hourly_rate, 0) > 0
    and (s.work_date + s.start_time) > (now() at time zone 'Asia/Tokyo')
    and (j.closing_at is null or j.closing_at >= now())
    and capacity.confirmed_count < greatest(coalesce(s.required_count, 1), 1)
  order by s.work_date asc, s.start_time asc, j.published_at desc;
end;
$$;

revoke all on function public.hc_jobseeker_list_spot_jobs() from public, anon;
grant execute on function public.hc_jobseeker_list_spot_jobs() to authenticated, service_role;

create or replace function ho_private.hc_jobseeker_submit_application_impl(
  p_job_id uuid,
  p_applicant_name text,
  p_applicant_name_kana text default null,
  p_email text default null,
  p_phone text default null,
  p_qualifications text default null,
  p_years_of_experience numeric default null,
  p_desired_start_date date default null,
  p_message text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_user_id text := auth.jwt() ->> 'sub';
  v_org_id uuid;
  v_facility_id uuid;
  v_source_type text;
  v_source_id uuid;
  v_application_id uuid;
  v_spot public.ho_spot_job_drafts%rowtype;
  v_confirmed_count integer := 0;
begin
  if v_user_id is null or btrim(v_user_id) = '' then
    raise exception 'authentication required';
  end if;
  if p_applicant_name is null or btrim(p_applicant_name) = '' then
    raise exception 'applicant name is required';
  end if;

  -- Idempotent duplicate submission: an existing candidate application wins,
  -- even when a spot later fills or closes.
  select a.id into v_application_id
  from public.hc_applications a
  where a.job_id = p_job_id
    and a.jobseeker_clerk_user_id = v_user_id
  order by a.applied_at asc
  limit 1;
  if v_application_id is not null then
    return v_application_id;
  end if;

  select j.organization_id, j.facility_id, j.source_type, j.source_id
    into v_org_id, v_facility_id, v_source_type, v_source_id
  from public.hc_jobs j
  join public.ho_facilities f
    on f.id = j.facility_id
   and f.organization_id = j.organization_id
  where j.id = p_job_id
    and j.status = 'published'
    and f.status = 'active'
    and (j.closing_at is null or j.closing_at >= now())
  limit 1;

  if v_facility_id is null then
    raise exception 'job is not available';
  end if;

  if v_source_type = 'spot_job' then
    select s.* into v_spot
    from public.ho_spot_job_drafts s
    where s.id = v_source_id
      and s.organization_id = v_org_id
      and s.facility_id = v_facility_id
    for share;

    if v_spot.id is null
       or v_spot.status <> 'published'
       or v_spot.work_date is null
       or v_spot.start_time is null
       or v_spot.end_time is null
       or v_spot.end_time <= v_spot.start_time
       or coalesce(v_spot.hourly_wage, v_spot.hourly_rate, 0) <= 0
       or (v_spot.work_date + v_spot.start_time) <= (now() at time zone 'Asia/Tokyo') then
      raise exception 'spot job is not available';
    end if;

    select count(*)::integer into v_confirmed_count
    from public.hc_spot_assignments x
    where x.spot_job_id = v_spot.id
      and x.status in ('confirmed', 'completed');

    if v_confirmed_count >= greatest(coalesce(v_spot.required_count, 1), 1) then
      raise exception 'spot job capacity is filled';
    end if;
  end if;

  begin
    insert into public.hc_applications (
      organization_id, facility_id, job_id, applicant_name, applicant_name_kana, email, phone,
      qualifications, years_of_experience, desired_start_date, message, status, source_type, jobseeker_clerk_user_id
    ) values (
      v_org_id, v_facility_id, p_job_id, btrim(p_applicant_name), nullif(btrim(p_applicant_name_kana), ''),
      nullif(btrim(p_email), ''), nullif(btrim(p_phone), ''), nullif(btrim(p_qualifications), ''),
      p_years_of_experience, p_desired_start_date, nullif(btrim(p_message), ''),
      'new', 'hoiku_color_jobseeker', v_user_id
    ) returning id into v_application_id;
  exception when unique_violation then
    select a.id into v_application_id
    from public.hc_applications a
    where a.job_id = p_job_id
      and a.jobseeker_clerk_user_id = v_user_id
    order by a.applied_at asc
    limit 1;
  end;

  if v_application_id is null then
    raise exception 'application could not be created';
  end if;
  return v_application_id;
end;
$$;

revoke all on function ho_private.hc_jobseeker_submit_application_impl(uuid,text,text,text,text,text,numeric,date,text) from public, anon, authenticated;
