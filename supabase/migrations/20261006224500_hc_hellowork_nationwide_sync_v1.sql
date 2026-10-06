-- Hello Work nationwide discovery control and faster freshness policy.
-- Keeps the crawler cursor/secret service-role only and shortens public freshness
-- from 36h to 12h so withdrawn jobs disappear quickly even when a detail URL is
-- no longer present in search results.

alter table public.hc_external_job_sources
  add column if not exists online_self_apply_allowed boolean;

create table if not exists public.hc_external_source_sync_control (
  source text primary key,
  sync_secret text not null default encode(extensions.gen_random_bytes(32), 'hex'),
  enabled boolean not null default true,
  prefecture_cursor smallint not null default 1
    check (prefecture_cursor between 1 and 47),
  page_cursor integer not null default 1
    check (page_cursor >= 1),
  completed_cycles integer not null default 0
    check (completed_cycles >= 0),
  last_scan_at timestamptz,
  last_batch_discovered integer not null default 0
    check (last_batch_discovered >= 0),
  last_batch_imported integer not null default 0
    check (last_batch_imported >= 0),
  last_batch_published integer not null default 0
    check (last_batch_published >= 0),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.hc_external_source_sync_control (source)
values ('hellowork')
on conflict (source) do nothing;

alter table public.hc_external_source_sync_control enable row level security;
revoke all on public.hc_external_source_sync_control from public, anon, authenticated;
grant select, insert, update, delete on public.hc_external_source_sync_control to service_role;

comment on table public.hc_external_source_sync_control is
  'Private external-source crawler cursor and sync secret. Never exposed to browsers.';

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
  e.last_verified_at,
  e.online_self_apply_allowed
from public.hc_external_job_sources e
where e.source_status = 'active'
  and e.public_republication_allowed = true
  and e.claimed_job_id is null
  and e.last_verified_at >= now() - interval '12 hours'
  and (e.expires_at is null or e.expires_at >= now())
  and (e.closing_at is null or e.closing_at >= now());

revoke all on public.hc_external_job_public_feed from public, anon;
grant select on public.hc_external_job_public_feed to authenticated, service_role;

create or replace view public.hc_public_job_feed_v2
with (security_barrier = true)
as
select
  j.id,
  j.facility_type,
  j.prefecture,
  j.city,
  j.title,
  j.description,
  j.employment_type,
  j.salary_type,
  j.salary_min,
  j.salary_max,
  j.salary_note,
  j.working_hours,
  j.holidays,
  j.required_qualification,
  j.benefits,
  j.number_of_positions,
  j.published_at,
  j.closing_at,
  j.facility_name,
  j.organization_name,
  j.postal_code,
  j.address,
  j.facility_id,
  'hoiku_color'::text as source_kind,
  null::text as source_name,
  null::text as source_job_id,
  null::text as source_url,
  null::timestamptz as source_last_verified_at,
  false as is_external,
  true as can_apply_direct,
  null::boolean as online_self_apply_allowed
from public.hc_public_job_feed j

union all

select
  e.id,
  e.facility_type,
  e.prefecture,
  e.city,
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
  e.facility_name,
  e.organization_name,
  null::text as postal_code,
  e.address,
  null::uuid as facility_id,
  e.source as source_kind,
  case when e.source = 'hellowork' then 'ハローワーク' else e.source end as source_name,
  e.source_job_id,
  e.source_url,
  e.last_verified_at as source_last_verified_at,
  true as is_external,
  false as can_apply_direct,
  e.online_self_apply_allowed
from public.hc_external_job_public_feed e;

revoke all on public.hc_public_job_feed_v2 from public;
grant select on public.hc_public_job_feed_v2 to anon, authenticated, service_role;
