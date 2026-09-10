-- Hoiku Color: authenticated visit / trial booking foundation.
-- Production was introduced in three guarded migrations; this file records the final idempotent state for fresh environments.

create schema if not exists hc_private;
revoke all on schema hc_private from public, anon;
grant usage on schema hc_private to authenticated, service_role;

create table if not exists public.hc_visit_settings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  facility_id uuid not null unique,
  visit_enabled boolean not null default false,
  half_day_trial_enabled boolean not null default false,
  full_day_trial_enabled boolean not null default false,
  available_weekdays smallint[] not null default array[1,2,3,4,5]::smallint[],
  first_start_time time without time zone not null default time '09:30',
  last_start_time time without time zone not null default time '15:00',
  slot_interval_minutes integer not null default 30,
  visit_duration_minutes integer not null default 60,
  half_day_duration_minutes integer not null default 240,
  full_day_duration_minutes integer not null default 420,
  capacity_per_slot integer not null default 1,
  min_notice_hours integer not null default 24,
  max_days_ahead integer not null default 60,
  public_note text,
  what_to_bring text,
  dress_code text,
  updated_by_clerk_user_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint hc_visit_settings_facility_tenant_fkey
    foreign key (facility_id, organization_id)
    references public.ho_facilities(id, organization_id)
    on delete cascade,
  constraint hc_visit_settings_weekdays_check
    check (cardinality(available_weekdays) between 1 and 7 and available_weekdays <@ array[1,2,3,4,5,6,7]::smallint[]),
  constraint hc_visit_settings_times_check check (first_start_time <= last_start_time),
  constraint hc_visit_settings_interval_check check (slot_interval_minutes between 15 and 180),
  constraint hc_visit_settings_visit_duration_check check (visit_duration_minutes between 15 and 240),
  constraint hc_visit_settings_half_duration_check check (half_day_duration_minutes between 120 and 360),
  constraint hc_visit_settings_full_duration_check check (full_day_duration_minutes between 300 and 600),
  constraint hc_visit_settings_capacity_check check (capacity_per_slot between 1 and 20),
  constraint hc_visit_settings_notice_check check (min_notice_hours between 0 and 720),
  constraint hc_visit_settings_window_check check (max_days_ahead between 1 and 365),
  constraint hc_visit_settings_public_note_check check (public_note is null or char_length(public_note) <= 2000),
  constraint hc_visit_settings_bring_check check (what_to_bring is null or char_length(what_to_bring) <= 1000),
  constraint hc_visit_settings_dress_check check (dress_code is null or char_length(dress_code) <= 1000)
);

create index if not exists hc_visit_settings_org_facility_idx
  on public.hc_visit_settings(organization_id, facility_id);

alter table public.hc_visit_settings enable row level security;
revoke all on public.hc_visit_settings from public, anon, authenticated;
grant select on public.hc_visit_settings to anon, authenticated;
grant all on public.hc_visit_settings to service_role;

drop policy if exists hc_visit_settings_public_read on public.hc_visit_settings;
create policy hc_visit_settings_public_read
  on public.hc_visit_settings
  for select
  to anon
  using (visit_enabled or half_day_trial_enabled or full_day_trial_enabled);

drop policy if exists hc_visit_settings_authenticated_read on public.hc_visit_settings;
create policy hc_visit_settings_authenticated_read
  on public.hc_visit_settings
  for select
  to authenticated
  using (
    visit_enabled or half_day_trial_enabled or full_day_trial_enabled
    or ho_private.recruitment_can_write(facility_id)
  );

create table if not exists public.hc_visit_reservations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  facility_id uuid not null,
  job_id uuid not null,
  application_id uuid,
  jobseeker_clerk_user_id text not null,
  experience_type text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'requested',
  candidate_message text,
  facility_note text,
  confirmed_at timestamptz,
  cancelled_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint hc_visit_reservations_facility_tenant_fkey
    foreign key (facility_id, organization_id)
    references public.ho_facilities(id, organization_id)
    on delete cascade,
  constraint hc_visit_reservations_job_tenant_fkey
    foreign key (job_id, organization_id, facility_id)
    references public.hc_jobs(id, organization_id, facility_id)
    on delete restrict,
  constraint hc_visit_reservations_application_fkey
    foreign key (application_id)
    references public.hc_applications(id)
    on delete set null,
  constraint hc_visit_reservations_type_check
    check (experience_type in ('visit','half_day_trial','full_day_trial')),
  constraint hc_visit_reservations_status_check
    check (status in ('requested','confirmed','declined','cancelled','completed','no_show')),
  constraint hc_visit_reservations_time_check check (ends_at > starts_at),
  constraint hc_visit_reservations_candidate_message_check
    check (candidate_message is null or char_length(candidate_message) <= 1000),
  constraint hc_visit_reservations_facility_note_check
    check (facility_note is null or char_length(facility_note) <= 2000)
);

create index if not exists hc_visit_reservations_facility_time_idx
  on public.hc_visit_reservations(facility_id, starts_at, ends_at)
  where status in ('requested','confirmed');
create index if not exists hc_visit_reservations_jobseeker_idx
  on public.hc_visit_reservations(jobseeker_clerk_user_id, created_at desc);
create index if not exists hc_visit_reservations_job_idx
  on public.hc_visit_reservations(job_id, created_at desc);
drop index if exists public.hc_visit_reservations_no_exact_duplicate_idx;
create unique index if not exists hc_visit_reservations_one_active_per_job_idx
  on public.hc_visit_reservations(job_id, jobseeker_clerk_user_id)
  where status in ('requested','confirmed');

alter table public.hc_visit_reservations enable row level security;
revoke all on public.hc_visit_reservations from public, anon, authenticated;
grant select on public.hc_visit_reservations to authenticated;
grant all on public.hc_visit_reservations to service_role;

drop policy if exists hc_visit_reservations_read_participants on public.hc_visit_reservations;
create policy hc_visit_reservations_read_participants
  on public.hc_visit_reservations
  for select
  to authenticated
  using (
    jobseeker_clerk_user_id = ho_private.current_clerk_user_id()
    or ho_private.recruitment_can_write(facility_id)
  );

create or replace function hc_private.upsert_visit_settings(
  p_facility_id uuid,
  p_visit_enabled boolean,
  p_half_day_trial_enabled boolean,
  p_full_day_trial_enabled boolean,
  p_available_weekdays smallint[],
  p_first_start_time time without time zone,
  p_last_start_time time without time zone,
  p_slot_interval_minutes integer,
  p_visit_duration_minutes integer,
  p_half_day_duration_minutes integer,
  p_full_day_duration_minutes integer,
  p_capacity_per_slot integer,
  p_min_notice_hours integer,
  p_max_days_ahead integer,
  p_public_note text,
  p_what_to_bring text,
  p_dress_code text
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org_id uuid;
  v_user_id text;
  v_id uuid;
begin
  v_user_id := ho_private.current_clerk_user_id();
  if v_user_id is null or v_user_id = '' then
    raise exception '認証が必要です。';
  end if;
  if not ho_private.recruitment_can_write(p_facility_id) then
    raise exception 'この施設の見学・体験設定を変更する権限がありません。';
  end if;

  select f.organization_id into v_org_id
  from public.ho_facilities f
  where f.id = p_facility_id and f.status = 'active';
  if v_org_id is null then raise exception '対象施設が見つかりません。'; end if;

  insert into public.hc_visit_settings (
    organization_id, facility_id, visit_enabled, half_day_trial_enabled, full_day_trial_enabled,
    available_weekdays, first_start_time, last_start_time, slot_interval_minutes,
    visit_duration_minutes, half_day_duration_minutes, full_day_duration_minutes,
    capacity_per_slot, min_notice_hours, max_days_ahead,
    public_note, what_to_bring, dress_code, updated_by_clerk_user_id
  ) values (
    v_org_id, p_facility_id,
    coalesce(p_visit_enabled,false), coalesce(p_half_day_trial_enabled,false), coalesce(p_full_day_trial_enabled,false),
    coalesce(p_available_weekdays,array[1,2,3,4,5]::smallint[]),
    coalesce(p_first_start_time,time '09:30'), coalesce(p_last_start_time,time '15:00'), coalesce(p_slot_interval_minutes,30),
    coalesce(p_visit_duration_minutes,60), coalesce(p_half_day_duration_minutes,240), coalesce(p_full_day_duration_minutes,420),
    coalesce(p_capacity_per_slot,1), coalesce(p_min_notice_hours,24), coalesce(p_max_days_ahead,60),
    nullif(btrim(p_public_note),''), nullif(btrim(p_what_to_bring),''), nullif(btrim(p_dress_code),''), v_user_id
  )
  on conflict (facility_id) do update set
    visit_enabled = excluded.visit_enabled,
    half_day_trial_enabled = excluded.half_day_trial_enabled,
    full_day_trial_enabled = excluded.full_day_trial_enabled,
    available_weekdays = excluded.available_weekdays,
    first_start_time = excluded.first_start_time,
    last_start_time = excluded.last_start_time,
    slot_interval_minutes = excluded.slot_interval_minutes,
    visit_duration_minutes = excluded.visit_duration_minutes,
    half_day_duration_minutes = excluded.half_day_duration_minutes,
    full_day_duration_minutes = excluded.full_day_duration_minutes,
    capacity_per_slot = excluded.capacity_per_slot,
    min_notice_hours = excluded.min_notice_hours,
    max_days_ahead = excluded.max_days_ahead,
    public_note = excluded.public_note,
    what_to_bring = excluded.what_to_bring,
    dress_code = excluded.dress_code,
    updated_by_clerk_user_id = v_user_id,
    updated_at = now()
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function hc_private.request_visit(
  p_job_id uuid,
  p_experience_type text,
  p_local_date date,
  p_local_time time without time zone,
  p_application_id uuid default null,
  p_candidate_message text default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id text;
  v_org_id uuid;
  v_facility_id uuid;
  v_timezone text;
  v_weekdays smallint[];
  v_first_start time;
  v_last_start time;
  v_slot_interval integer;
  v_duration integer;
  v_capacity integer;
  v_notice integer;
  v_max_days integer;
  v_start timestamptz;
  v_end timestamptz;
  v_local_today date;
  v_active_count integer;
  v_id uuid;
  v_enabled boolean;
begin
  v_user_id := ho_private.current_clerk_user_id();
  if v_user_id is null or v_user_id = '' then raise exception '認証が必要です。'; end if;
  if p_experience_type not in ('visit','half_day_trial','full_day_trial') then raise exception '見学・体験種別が不正です。'; end if;

  select j.organization_id, j.facility_id, f.timezone, s.available_weekdays,
    s.first_start_time, s.last_start_time, s.slot_interval_minutes,
    case p_experience_type when 'visit' then s.visit_duration_minutes when 'half_day_trial' then s.half_day_duration_minutes else s.full_day_duration_minutes end,
    s.capacity_per_slot, s.min_notice_hours, s.max_days_ahead,
    case p_experience_type when 'visit' then s.visit_enabled when 'half_day_trial' then s.half_day_trial_enabled else s.full_day_trial_enabled end
  into v_org_id, v_facility_id, v_timezone, v_weekdays, v_first_start, v_last_start,
    v_slot_interval, v_duration, v_capacity, v_notice, v_max_days, v_enabled
  from public.hc_jobs j
  join public.ho_facilities f on f.id = j.facility_id and f.organization_id = j.organization_id and f.status = 'active'
  join public.hc_visit_settings s on s.facility_id = j.facility_id and s.organization_id = j.organization_id
  where j.id = p_job_id and j.status = 'published' and j.published_at is not null
    and (j.closing_at is null or j.closing_at > now());

  if v_org_id is null or not coalesce(v_enabled,false) then raise exception 'この求人では現在、選択した見学・体験を受け付けていません。'; end if;
  if p_local_date is null or p_local_time is null then raise exception '日時を選択してください。'; end if;
  if not (extract(isodow from p_local_date)::smallint = any(v_weekdays)) then raise exception '選択した曜日は受付対象外です。'; end if;
  if p_local_time < v_first_start or p_local_time > v_last_start then raise exception '選択した時間は受付時間外です。'; end if;
  if mod((extract(epoch from (p_local_time - v_first_start)) / 60)::integer, v_slot_interval) <> 0 then raise exception '選択した時間は予約枠に一致しません。'; end if;

  v_start := (p_local_date + p_local_time) at time zone v_timezone;
  v_end := v_start + make_interval(mins => v_duration);
  v_local_today := (clock_timestamp() at time zone v_timezone)::date;
  if v_start < clock_timestamp() + make_interval(hours => v_notice) then raise exception '予約可能な最短日時を過ぎています。'; end if;
  if p_local_date > v_local_today + v_max_days then raise exception '予約可能期間を超えています。'; end if;

  if p_application_id is not null and not exists (
    select 1 from public.hc_applications a
    where a.id = p_application_id and a.job_id = p_job_id
      and a.organization_id = v_org_id and a.facility_id = v_facility_id
      and a.jobseeker_clerk_user_id = v_user_id
  ) then raise exception '応募情報と予約情報が一致しません。'; end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_facility_id::text || '|' || p_local_date::text, 0));

  if exists (
    select 1 from public.hc_visit_reservations r
    where r.jobseeker_clerk_user_id = v_user_id and r.status in ('requested','confirmed')
      and r.starts_at < v_end and r.ends_at > v_start
  ) then raise exception '同じ時間帯にすでに見学・体験予約があります。'; end if;

  select count(*)::integer into v_active_count
  from public.hc_visit_reservations r
  where r.facility_id = v_facility_id and r.status in ('requested','confirmed')
    and r.starts_at < v_end and r.ends_at > v_start;
  if v_active_count >= v_capacity then raise exception 'この時間帯は満席です。別の日時を選択してください。'; end if;

  insert into public.hc_visit_reservations (
    organization_id, facility_id, job_id, application_id, jobseeker_clerk_user_id,
    experience_type, starts_at, ends_at, status, candidate_message
  ) values (
    v_org_id, v_facility_id, p_job_id, p_application_id, v_user_id,
    p_experience_type, v_start, v_end, 'requested', nullif(btrim(p_candidate_message),'')
  ) returning id into v_id;
  return v_id;
end;
$$;

create or replace function hc_private.cancel_visit(p_reservation_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_user_id text;
begin
  v_user_id := ho_private.current_clerk_user_id();
  if v_user_id is null or v_user_id = '' then raise exception '認証が必要です。'; end if;
  update public.hc_visit_reservations
  set status = 'cancelled', cancelled_at = now(), updated_at = now()
  where id = p_reservation_id and jobseeker_clerk_user_id = v_user_id and status in ('requested','confirmed');
  if not found then raise exception 'キャンセルできる予約が見つかりません。'; end if;
  return true;
end;
$$;

create or replace function hc_private.manage_visit_reservation(p_reservation_id uuid, p_status text, p_facility_note text default null)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_facility_id uuid; v_current_status text;
begin
  select facility_id, status into v_facility_id, v_current_status from public.hc_visit_reservations where id = p_reservation_id;
  if v_facility_id is null then raise exception '予約が見つかりません。'; end if;
  if not ho_private.recruitment_can_write(v_facility_id) then raise exception 'この予約を管理する権限がありません。'; end if;
  if not (
    (v_current_status = 'requested' and p_status in ('confirmed','declined','cancelled'))
    or (v_current_status = 'confirmed' and p_status in ('completed','no_show','cancelled'))
    or (v_current_status = p_status)
  ) then raise exception '予約ステータスの遷移が不正です。'; end if;
  update public.hc_visit_reservations set
    status = p_status,
    facility_note = coalesce(nullif(btrim(p_facility_note),''), facility_note),
    confirmed_at = case when p_status = 'confirmed' and confirmed_at is null then now() else confirmed_at end,
    cancelled_at = case when p_status in ('cancelled','declined') and cancelled_at is null then now() else cancelled_at end,
    completed_at = case when p_status = 'completed' and completed_at is null then now() else completed_at end,
    updated_at = now()
  where id = p_reservation_id;
  return true;
end;
$$;

revoke all on function hc_private.upsert_visit_settings(uuid,boolean,boolean,boolean,smallint[],time without time zone,time without time zone,integer,integer,integer,integer,integer,integer,integer,text,text,text) from public, anon;
revoke all on function hc_private.request_visit(uuid,text,date,time without time zone,uuid,text) from public, anon;
revoke all on function hc_private.cancel_visit(uuid) from public, anon;
revoke all on function hc_private.manage_visit_reservation(uuid,text,text) from public, anon;
grant execute on function hc_private.upsert_visit_settings(uuid,boolean,boolean,boolean,smallint[],time without time zone,time without time zone,integer,integer,integer,integer,integer,integer,integer,text,text,text) to authenticated, service_role;
grant execute on function hc_private.request_visit(uuid,text,date,time without time zone,uuid,text) to authenticated, service_role;
grant execute on function hc_private.cancel_visit(uuid) to authenticated, service_role;
grant execute on function hc_private.manage_visit_reservation(uuid,text,text) to authenticated, service_role;

create or replace function public.hc_upsert_visit_settings(
  p_facility_id uuid, p_visit_enabled boolean, p_half_day_trial_enabled boolean, p_full_day_trial_enabled boolean,
  p_available_weekdays smallint[], p_first_start_time time without time zone, p_last_start_time time without time zone,
  p_slot_interval_minutes integer, p_visit_duration_minutes integer, p_half_day_duration_minutes integer,
  p_full_day_duration_minutes integer, p_capacity_per_slot integer, p_min_notice_hours integer, p_max_days_ahead integer,
  p_public_note text default null, p_what_to_bring text default null, p_dress_code text default null
) returns uuid language sql security invoker set search_path = '' as $$
  select hc_private.upsert_visit_settings(
    p_facility_id, p_visit_enabled, p_half_day_trial_enabled, p_full_day_trial_enabled,
    p_available_weekdays, p_first_start_time, p_last_start_time, p_slot_interval_minutes,
    p_visit_duration_minutes, p_half_day_duration_minutes, p_full_day_duration_minutes,
    p_capacity_per_slot, p_min_notice_hours, p_max_days_ahead, p_public_note, p_what_to_bring, p_dress_code
  );
$$;

create or replace function public.hc_request_visit(
  p_job_id uuid, p_experience_type text, p_local_date date, p_local_time time without time zone,
  p_application_id uuid default null, p_candidate_message text default null
) returns uuid language sql security invoker set search_path = '' as $$
  select hc_private.request_visit(p_job_id, p_experience_type, p_local_date, p_local_time, p_application_id, p_candidate_message);
$$;

create or replace function public.hc_cancel_visit(p_reservation_id uuid)
returns boolean language sql security invoker set search_path = '' as $$
  select hc_private.cancel_visit(p_reservation_id);
$$;

create or replace function public.hc_manage_visit_reservation(p_reservation_id uuid, p_status text, p_facility_note text default null)
returns boolean language sql security invoker set search_path = '' as $$
  select hc_private.manage_visit_reservation(p_reservation_id, p_status, p_facility_note);
$$;

revoke all on function public.hc_upsert_visit_settings(uuid,boolean,boolean,boolean,smallint[],time without time zone,time without time zone,integer,integer,integer,integer,integer,integer,integer,text,text,text) from public, anon;
revoke all on function public.hc_request_visit(uuid,text,date,time without time zone,uuid,text) from public, anon;
revoke all on function public.hc_cancel_visit(uuid) from public, anon;
revoke all on function public.hc_manage_visit_reservation(uuid,text,text) from public, anon;
grant execute on function public.hc_upsert_visit_settings(uuid,boolean,boolean,boolean,smallint[],time without time zone,time without time zone,integer,integer,integer,integer,integer,integer,integer,text,text,text) to authenticated, service_role;
grant execute on function public.hc_request_visit(uuid,text,date,time without time zone,uuid,text) to authenticated, service_role;
grant execute on function public.hc_cancel_visit(uuid) to authenticated, service_role;
grant execute on function public.hc_manage_visit_reservation(uuid,text,text) to authenticated, service_role;
