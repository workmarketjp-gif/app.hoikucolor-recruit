-- Allow signed-in Hoiku Color candidates to save fresh external jobs without
-- weakening the canonical hc_saved_jobs -> hc_jobs foreign key.
--
-- External jobs stay in their own saved table and are only returned while the
-- source job is still in hc_external_job_public_feed. If republication becomes
-- disallowed, stale, expired or removed, the job disappears from candidate UI.

create table if not exists public.hc_saved_external_jobs (
  id uuid primary key default gen_random_uuid(),
  clerk_user_id text not null,
  external_job_id uuid not null references public.hc_external_job_sources(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (clerk_user_id, external_job_id)
);

create index if not exists hc_saved_external_jobs_user_created_idx
  on public.hc_saved_external_jobs(clerk_user_id, created_at desc);
create index if not exists hc_saved_external_jobs_job_idx
  on public.hc_saved_external_jobs(external_job_id);

alter table public.hc_saved_external_jobs enable row level security;
revoke all on public.hc_saved_external_jobs from public, anon, authenticated;
grant select, insert, delete on public.hc_saved_external_jobs to service_role;

create or replace function public.hc_jobseeker_save_job(p_job_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor text := nullif((select auth.jwt()) ->> 'sub', '');
  v_inserted integer := 0;
begin
  if v_actor is null then
    raise exception 'HC_JOBSEEKER_AUTH_REQUIRED' using errcode = '42501';
  end if;

  if exists (
    select 1
    from public.hc_jobseeker_job_feed f
    where f.id = p_job_id
  ) then
    insert into public.hc_saved_jobs(clerk_user_id, job_id)
    values (v_actor, p_job_id)
    on conflict (clerk_user_id, job_id) do nothing;

    get diagnostics v_inserted = row_count;
    return v_inserted = 1;
  end if;

  if exists (
    select 1
    from public.hc_external_job_public_feed e
    where e.id = p_job_id
  ) then
    insert into public.hc_saved_external_jobs(clerk_user_id, external_job_id)
    values (v_actor, p_job_id)
    on conflict (clerk_user_id, external_job_id) do nothing;

    get diagnostics v_inserted = row_count;
    return v_inserted = 1;
  end if;

  raise exception 'HC_JOB_NOT_AVAILABLE' using errcode = '23514';
end;
$$;

create or replace function public.hc_jobseeker_unsave_job(p_job_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor text := nullif((select auth.jwt()) ->> 'sub', '');
  v_deleted integer := 0;
  v_external_deleted integer := 0;
begin
  if v_actor is null then
    raise exception 'HC_JOBSEEKER_AUTH_REQUIRED' using errcode = '42501';
  end if;

  delete from public.hc_saved_jobs s
  where s.clerk_user_id = v_actor
    and s.job_id = p_job_id;
  get diagnostics v_deleted = row_count;

  delete from public.hc_saved_external_jobs s
  where s.clerk_user_id = v_actor
    and s.external_job_id = p_job_id;
  get diagnostics v_external_deleted = row_count;

  return (v_deleted + v_external_deleted) > 0;
end;
$$;

create or replace function public.hc_jobseeker_list_saved_job_ids()
returns table(job_id uuid, saved_at timestamptz)
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
  select q.job_id, q.saved_at
  from (
    select s.job_id, s.created_at as saved_at
    from public.hc_saved_jobs s
    where s.clerk_user_id = v_actor

    union all

    select s.external_job_id as job_id, s.created_at as saved_at
    from public.hc_saved_external_jobs s
    join public.hc_external_job_public_feed e on e.id = s.external_job_id
    where s.clerk_user_id = v_actor
  ) q
  order by q.saved_at desc, q.job_id;
end;
$$;

create or replace function public.hc_jobseeker_list_saved_jobs_with_status_v2()
returns table (
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
  source_kind text,
  source_name text,
  source_job_id text,
  source_url text,
  source_last_verified_at timestamptz,
  is_external boolean,
  can_apply_direct boolean,
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
  select *
  from (
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
      'hoiku_color'::text as source_kind,
      null::text as source_name,
      null::text as source_job_id,
      null::text as source_url,
      null::timestamptz as source_last_verified_at,
      false as is_external,
      true as can_apply_direct,
      (r.closing_at is null or r.closing_at >= now()) as is_open,
      s.created_at as saved_at
    from public.hc_saved_jobs s
    join hc_feed_private.public_job_rows r on r.id = s.job_id
    left join public.hc_public_workplace_profiles w on w.facility_id = r.facility_id
    left join public.hc_public_finance_profiles f on f.facility_id = r.facility_id
    where s.clerk_user_id = v_actor

    union all

    select
      e.id,
      e.id as facility_id,
      e.facility_name,
      e.facility_type,
      e.prefecture,
      e.city,
      e.address,
      e.title,
      e.description,
      e.employment_type,
      e.salary_type,
      e.salary_min,
      e.salary_max,
      e.salary_note,
      e.working_hours,
      e.holidays,
      e.required_qualification,
      e.benefits,
      e.number_of_positions,
      e.published_at,
      e.closing_at,
      null::integer as spot_break_minutes,
      null::jsonb as verified_workplace,
      null::jsonb as verified_finance,
      e.source as source_kind,
      case when e.source = 'hellowork' then 'ハローワーク' else e.source end as source_name,
      e.source_job_id,
      e.source_url,
      e.last_verified_at as source_last_verified_at,
      true as is_external,
      false as can_apply_direct,
      true as is_open,
      s.created_at as saved_at
    from public.hc_saved_external_jobs s
    join public.hc_external_job_public_feed e on e.id = s.external_job_id
    where s.clerk_user_id = v_actor
  ) q
  order by q.saved_at desc, q.id desc;
end;
$$;

revoke all on function public.hc_jobseeker_save_job(uuid) from public, anon;
revoke all on function public.hc_jobseeker_unsave_job(uuid) from public, anon;
revoke all on function public.hc_jobseeker_list_saved_job_ids() from public, anon;
revoke all on function public.hc_jobseeker_list_saved_jobs_with_status_v2() from public, anon;
grant execute on function public.hc_jobseeker_save_job(uuid) to authenticated, service_role;
grant execute on function public.hc_jobseeker_unsave_job(uuid) to authenticated, service_role;
grant execute on function public.hc_jobseeker_list_saved_job_ids() to authenticated, service_role;
grant execute on function public.hc_jobseeker_list_saved_jobs_with_status_v2() to authenticated, service_role;

comment on table public.hc_saved_external_jobs is
  'Private candidate bookmarks for fresh external jobs. External jobs remain isolated from canonical hc_jobs.';
comment on function public.hc_jobseeker_list_saved_jobs_with_status_v2() is
  'Candidate-owned saved jobs across canonical HC jobs and currently republication-safe external jobs.';
