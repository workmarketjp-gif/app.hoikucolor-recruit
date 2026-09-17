-- Candidate-safe confirmed spot-work read model and notification deep-link.
-- Facility-side Hoiku Poppy implementation remains unchanged.

create or replace function public.hc_jobseeker_list_my_spot_assignments()
returns table (
  assignment_id uuid,
  application_id uuid,
  job_id uuid,
  facility_id uuid,
  facility_name text,
  facility_type text,
  prefecture text,
  city text,
  address text,
  title text,
  work_date date,
  start_time time without time zone,
  end_time time without time zone,
  break_minutes integer,
  hourly_rate numeric,
  assignment_status text,
  confirmed_at timestamptz
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
    x.id,
    x.application_id,
    x.job_id,
    x.facility_id,
    f.name,
    f.facility_type,
    f.prefecture,
    f.city,
    coalesce(f.address_line, f.address),
    coalesce(nullif(btrim(j.title), ''), 'スポット勤務'::text),
    x.work_date,
    x.start_time,
    x.end_time,
    x.break_minutes,
    x.hourly_rate,
    x.status,
    x.confirmed_at
  from public.hc_spot_assignments x
  join public.ho_facilities f
    on f.id = x.facility_id
   and f.organization_id = x.organization_id
  left join public.hc_jobs j
    on j.id = x.job_id
   and j.organization_id = x.organization_id
   and j.facility_id = x.facility_id
  where x.jobseeker_clerk_user_id = v_user_id
  order by
    case
      when x.status = 'confirmed' and x.work_date >= (now() at time zone 'Asia/Tokyo')::date then 0
      when x.status = 'completed' then 1
      when x.status = 'cancelled' then 2
      when x.status = 'no_show' then 3
      else 4
    end,
    case when x.work_date >= (now() at time zone 'Asia/Tokyo')::date then x.work_date end asc nulls last,
    x.work_date desc,
    x.start_time asc,
    x.confirmed_at desc
  limit 100;
end;
$$;

revoke all on function public.hc_jobseeker_list_my_spot_assignments() from public, anon;
grant execute on function public.hc_jobseeker_list_my_spot_assignments() to authenticated, service_role;

create or replace function ho_private.hc_spot_assignment_jobseeker_notification_trigger()
returns trigger
language plpgsql
security definer
set search_path = public, ho_private, pg_temp
as $$
declare
  v_facility_name text;
  v_app_id uuid;
begin
  if new.status <> 'confirmed' then return new; end if;
  select f.name into v_facility_name from public.ho_facilities f where f.id = new.facility_id;
  v_app_id := new.application_id;
  perform ho_private.hc_notify_jobseeker(
    new.organization_id,
    new.facility_id,
    v_app_id,
    new.jobseeker_clerk_user_id,
    'spot_confirmed',
    'スポット勤務が確定しました',
    coalesce(v_facility_name, '園') || '／' || to_char(new.work_date, 'YYYY年MM月DD日') || ' ' || to_char(new.start_time, 'HH24:MI') || '〜' || to_char(new.end_time, 'HH24:MI'),
    '/spot-jobs?assignment_id=' || new.id::text || '#spot-assignment-' || new.id::text,
    'jobseeker:spot:' || new.id::text || ':confirmed'
  );
  return new;
end;
$$;

revoke all on function ho_private.hc_spot_assignment_jobseeker_notification_trigger() from public, anon;
