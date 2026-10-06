-- External job source layer (v1: Hello Work) for Hoiku Color.
-- Unclaimed third-party jobs stay OUTSIDE hc_jobs so the canonical HC/HM/HO facility
-- model is never polluted with synthetic organizations/facilities.
--
-- Publication safety:
-- - only rows explicitly marked republication-safe are candidate-visible;
-- - rows disappear if source verification is older than 36 hours;
-- - expired/removed/blocked rows never appear;
-- - raw source snapshots are service-role only and never exposed by views/RPCs.

create table if not exists public.hc_external_job_sources (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  source_job_id text not null,
  source_url text not null,
  source_status text not null default 'active'
    check (source_status in ('active','closed','expired','removed','blocked')),
  public_republication_allowed boolean not null default false,

  organization_name text,
  facility_name text not null,
  facility_type text,
  prefecture text,
  city text,
  address text,

  title text not null,
  description text not null default '',
  employment_type text,
  salary_type text,
  salary_min integer,
  salary_max integer,
  salary_note text,
  working_hours text,
  holidays text,
  required_qualification text,
  benefits text,
  number_of_positions integer not null default 1 check (number_of_positions > 0),

  source_published_at timestamptz,
  closing_at timestamptz,
  expires_at timestamptz,
  fetched_at timestamptz not null default now(),
  last_verified_at timestamptz not null default now(),

  source_payload jsonb not null default '{}'::jsonb
    check (jsonb_typeof(source_payload) = 'object'),

  claim_status text not null default 'unclaimed'
    check (claim_status in ('unclaimed','pending','claimed','rejected')),
  claimed_by_facility_id uuid references public.ho_facilities(id) on delete set null,
  claimed_job_id uuid references public.hc_jobs(id) on delete set null,
  claimed_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (source, source_job_id),
  check (
    source <> 'hellowork'
    or source_url ~ '^https://www\\.hellowork\\.mhlw\\.go\\.jp/kensaku/'
  )
);

create index if not exists hc_external_job_sources_active_idx
  on public.hc_external_job_sources (source_status, last_verified_at desc, closing_at);
create index if not exists hc_external_job_sources_location_idx
  on public.hc_external_job_sources (prefecture, employment_type);
create unique index if not exists hc_external_job_sources_claimed_job_unique
  on public.hc_external_job_sources (claimed_job_id)
  where claimed_job_id is not null;

alter table public.hc_external_job_sources enable row level security;
revoke all on public.hc_external_job_sources from public, anon, authenticated;
grant select, insert, update, delete on public.hc_external_job_sources to service_role;

comment on table public.hc_external_job_sources is
  'Private normalized/raw third-party job source store. V1 accepts Hello Work public jobs; browsers never read this table directly.';

create or replace view public.hc_external_job_public_feed
with (security_barrier = true)
as
select
  e.id,
  e.source,
  e.source_job_id,
  e.source_url,
  e.organization_name,
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
  coalesce(e.source_published_at, e.fetched_at) as published_at,
  coalesce(e.closing_at, e.expires_at) as closing_at,
  e.last_verified_at
from public.hc_external_job_sources e
where e.source_status = 'active'
  and e.public_republication_allowed = true
  and e.claimed_job_id is null
  and e.last_verified_at >= now() - interval '36 hours'
  and (e.expires_at is null or e.expires_at >= now())
  and (e.closing_at is null or e.closing_at >= now());

revoke all on public.hc_external_job_public_feed from public, anon;
grant select on public.hc_external_job_public_feed to authenticated, service_role;

comment on view public.hc_external_job_public_feed is
  'Candidate-safe third-party job feed. Raw payload and restricted/old/withdrawn jobs are deliberately excluded.';

create or replace function public.hc_jobseeker_search_jobs_v2(
  p_query text default null,
  p_prefecture text default null,
  p_employment_type text default null,
  p_ho_verified boolean default false,
  p_hf_verified boolean default false,
  p_limit integer default 24,
  p_after_quality numeric default null,
  p_after_transparency numeric default null,
  p_after_published_at timestamptz default null,
  p_after_id uuid default null
)
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
  rank_quality numeric,
  rank_transparency numeric,
  total_count bigint,
  has_more boolean
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with canonical as (
    select
      r.id,
      r.facility_id,
      r.facility_name,
      r.facility_type,
      r.prefecture,
      r.city,
      r.address,
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
      (coalesce(w.quality_points, 0) + coalesce(f.quality_points, 0))::numeric as rank_quality,
      (coalesce(w.transparency_pct, 0) + coalesce(f.transparency_pct, 0))::numeric as rank_transparency
    from public.hc_jobseeker_job_feed r
    left join public.hc_public_workplace_profiles w on w.facility_id = r.facility_id
    left join public.hc_public_finance_profiles f on f.facility_id = r.facility_id
  ),
  external as (
    select
      e.id,
      e.id as facility_id, -- stable non-canonical UUID; all facility actions are disabled for external rows.
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
      0::numeric as rank_quality,
      0::numeric as rank_transparency
    from public.hc_external_job_public_feed e
  ),
  filtered as (
    select *
    from (
      select * from canonical
      union all
      select * from external
    ) u
    where (
      nullif(btrim(p_query), '') is null
      or strpos(
        lower(concat_ws(' ', u.title, u.facility_name, u.description, u.prefecture, u.city, u.required_qualification)),
        lower(btrim(p_query))
      ) > 0
    )
      and (nullif(btrim(p_prefecture), '') is null or u.prefecture = btrim(p_prefecture))
      and (nullif(btrim(p_employment_type), '') is null or u.employment_type = btrim(p_employment_type))
      and (not coalesce(p_ho_verified, false) or coalesce((u.verified_workplace->>'verified_metric_count')::integer, 0) > 0)
      and (not coalesce(p_hf_verified, false) or coalesce((u.verified_finance->>'verified_metric_count')::integer, 0) > 0)
  ),
  counted as (
    select filtered.*, count(*) over () as total_count
    from filtered
  ),
  page as (
    select *
    from counted
    where p_after_id is null
       or rank_quality < coalesce(p_after_quality, 0)
       or (rank_quality = coalesce(p_after_quality, 0) and rank_transparency < coalesce(p_after_transparency, 0))
       or (
         rank_quality = coalesce(p_after_quality, 0)
         and rank_transparency = coalesce(p_after_transparency, 0)
         and coalesce(published_at, '-infinity'::timestamptz) < coalesce(p_after_published_at, '-infinity'::timestamptz)
       )
       or (
         rank_quality = coalesce(p_after_quality, 0)
         and rank_transparency = coalesce(p_after_transparency, 0)
         and coalesce(published_at, '-infinity'::timestamptz) = coalesce(p_after_published_at, '-infinity'::timestamptz)
         and id > p_after_id
       )
    order by rank_quality desc, rank_transparency desc, published_at desc nulls last, id
    limit greatest(1, least(coalesce(p_limit, 24), 50)) + 1
  )
  select
    page.id, page.facility_id, page.facility_name, page.facility_type,
    page.prefecture, page.city, page.address, page.title, page.description,
    page.employment_type, page.salary_type, page.salary_min, page.salary_max,
    page.salary_note, page.working_hours, page.holidays,
    page.required_qualification, page.benefits, page.number_of_positions,
    page.published_at, page.closing_at, page.spot_break_minutes,
    page.verified_workplace, page.verified_finance,
    page.source_kind, page.source_name, page.source_job_id, page.source_url,
    page.source_last_verified_at, page.is_external, page.can_apply_direct,
    page.rank_quality, page.rank_transparency, page.total_count,
    ((select count(*) from page) > greatest(1, least(coalesce(p_limit, 24), 50))) as has_more
  from page
  order by page.rank_quality desc, page.rank_transparency desc, page.published_at desc nulls last, page.id
  limit greatest(1, least(coalesce(p_limit, 24), 50));
$$;

create or replace function public.hc_jobseeker_get_job_v2(p_job_id uuid)
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
  can_apply_direct boolean
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select * from (
    select
      r.id, r.facility_id, r.facility_name, r.facility_type, r.prefecture, r.city, r.address,
      r.title, r.description, r.employment_type, r.salary_type, r.salary_min, r.salary_max,
      r.salary_note, r.working_hours, r.holidays, r.required_qualification, r.benefits,
      r.number_of_positions, r.published_at, r.closing_at, r.spot_break_minutes,
      case when w.facility_id is null then null else to_jsonb(w) end as verified_workplace,
      case when f.facility_id is null then null else to_jsonb(f) end as verified_finance,
      'hoiku_color'::text as source_kind, null::text as source_name, null::text as source_job_id,
      null::text as source_url, null::timestamptz as source_last_verified_at,
      false as is_external, true as can_apply_direct
    from public.hc_jobseeker_job_feed r
    left join public.hc_public_workplace_profiles w on w.facility_id = r.facility_id
    left join public.hc_public_finance_profiles f on f.facility_id = r.facility_id
    where r.id = p_job_id

    union all

    select
      e.id, e.id as facility_id, e.facility_name, e.facility_type, e.prefecture, e.city, e.address,
      e.title, e.description, e.employment_type, e.salary_type, e.salary_min, e.salary_max,
      e.salary_note, e.working_hours, e.holidays, e.required_qualification, e.benefits,
      e.number_of_positions, e.published_at, e.closing_at, null::integer as spot_break_minutes,
      null::jsonb as verified_workplace, null::jsonb as verified_finance,
      e.source as source_kind,
      case when e.source = 'hellowork' then 'ハローワーク' else e.source end as source_name,
      e.source_job_id, e.source_url, e.last_verified_at as source_last_verified_at,
      true as is_external, false as can_apply_direct
    from public.hc_external_job_public_feed e
    where e.id = p_job_id
  ) q
  limit 1;
$$;

create or replace function public.hc_jobseeker_job_search_facets_v2()
returns table (prefectures text[], employment_types text[])
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with source_rows as (
    select prefecture, employment_type from public.hc_jobseeker_job_feed
    union all
    select prefecture, employment_type from public.hc_external_job_public_feed
  )
  select
    coalesce(array_agg(distinct prefecture order by prefecture)
      filter (where nullif(btrim(prefecture), '') is not null), '{}'::text[]) as prefectures,
    coalesce(array_agg(distinct employment_type order by employment_type)
      filter (where nullif(btrim(employment_type), '') is not null), '{}'::text[]) as employment_types
  from source_rows;
$$;

revoke all on function public.hc_jobseeker_search_jobs_v2(text,text,text,boolean,boolean,integer,numeric,numeric,timestamptz,uuid) from public, anon;
revoke all on function public.hc_jobseeker_get_job_v2(uuid) from public, anon;
revoke all on function public.hc_jobseeker_job_search_facets_v2() from public, anon;
grant execute on function public.hc_jobseeker_search_jobs_v2(text,text,text,boolean,boolean,integer,numeric,numeric,timestamptz,uuid) to authenticated, service_role;
grant execute on function public.hc_jobseeker_get_job_v2(uuid) to authenticated, service_role;
grant execute on function public.hc_jobseeker_job_search_facets_v2() to authenticated, service_role;

comment on function public.hc_jobseeker_search_jobs_v2(text,text,text,boolean,boolean,integer,numeric,numeric,timestamptz,uuid) is
  'Candidate-safe combined HC + fresh external public job search. External jobs cannot be directly applied to in HC.';
comment on function public.hc_jobseeker_get_job_v2(uuid) is
  'Candidate-safe exact lookup across canonical HC jobs and fresh republication-safe external jobs.';
