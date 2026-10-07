-- HC candidate search projection: Stage A foundation.
-- Production RPCs remain unchanged in Stage A.

create table if not exists hc_feed_private.jobseeker_search_projection (
  id uuid primary key,
  facility_id uuid not null,
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
  source_kind text not null,
  source_name text,
  source_job_id text,
  source_url text,
  source_last_verified_at timestamptz,
  search_valid_until timestamptz,
  source_content_hash text,
  source_parser_version text,
  is_external boolean not null,
  can_apply_direct boolean not null,
  ho_verified boolean not null default false,
  hf_verified boolean not null default false,
  rank_quality numeric not null default 0,
  rank_transparency numeric not null default 0,
  search_document text not null default '',
  projection_updated_at timestamptz not null default now()
);

alter table hc_feed_private.jobseeker_search_projection set (fillfactor = 80);

revoke all on table hc_feed_private.jobseeker_search_projection
  from public, anon, authenticated;
grant select, insert, update, delete on table hc_feed_private.jobseeker_search_projection
  to service_role;

comment on table hc_feed_private.jobseeker_search_projection is
  'Stage A only: private candidate-safe projection for HC search performance measurement. Production RPCs do not read it.';

create or replace view hc_feed_private.jobseeker_search_projection_source
as
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
  r.closing_at as search_valid_until,
  null::text as source_content_hash,
  null::text as source_parser_version,
  false as is_external,
  true as can_apply_direct,
  coalesce(w.verified_metric_count, 0) > 0 as ho_verified,
  coalesce(f.verified_metric_count, 0) > 0 as hf_verified,
  (coalesce(w.quality_points, 0) + coalesce(f.quality_points, 0))::numeric as rank_quality,
  (coalesce(w.transparency_pct, 0) + coalesce(f.transparency_pct, 0))::numeric as rank_transparency,
  public.hc_job_search_document(
    r.title,
    r.facility_name,
    r.description,
    r.prefecture,
    r.city,
    r.required_qualification,
    null,
    null
  ) as search_document
from hc_feed_private.public_job_rows r
left join public.hc_public_workplace_profiles w on w.facility_id = r.facility_id
left join public.hc_public_finance_profiles f on f.facility_id = r.facility_id

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
  coalesce(e.source_published_at, e.fetched_at) as published_at,
  coalesce(e.closing_at, e.expires_at) as closing_at,
  null::integer as spot_break_minutes,
  null::jsonb as verified_workplace,
  null::jsonb as verified_finance,
  e.source as source_kind,
  case when e.source = 'hellowork' then 'ハローワーク' else e.source end as source_name,
  e.source_job_id,
  e.source_url,
  e.last_verified_at as source_last_verified_at,
  case
    when e.closing_at is null then e.expires_at
    when e.expires_at is null then e.closing_at
    else least(e.closing_at, e.expires_at)
  end as search_valid_until,
  e.source_payload->>'content_sha256' as source_content_hash,
  e.source_payload->>'parser_version' as source_parser_version,
  true as is_external,
  false as can_apply_direct,
  false as ho_verified,
  false as hf_verified,
  0::numeric as rank_quality,
  0::numeric as rank_transparency,
  public.hc_job_search_document(
    e.title,
    e.facility_name,
    e.description,
    e.prefecture,
    e.city,
    e.required_qualification,
    null,
    null
  ) as search_document
from public.hc_external_job_sources e
where e.source_status = 'active'
  and e.public_republication_allowed = true
  and e.claimed_job_id is null;

revoke all on hc_feed_private.jobseeker_search_projection_source
  from public, anon, authenticated;
grant select on hc_feed_private.jobseeker_search_projection_source
  to service_role;

create index if not exists hc_jobseeker_search_projection_rank_idx
  on hc_feed_private.jobseeker_search_projection (
    rank_quality desc,
    rank_transparency desc,
    published_at desc nulls last,
    id
  );

create index if not exists hc_jobseeker_search_projection_filter_rank_idx
  on hc_feed_private.jobseeker_search_projection (
    prefecture,
    employment_type,
    ho_verified,
    hf_verified,
    rank_quality desc,
    rank_transparency desc,
    published_at desc nulls last,
    id
  );

create index if not exists hc_jobseeker_search_projection_facets_idx
  on hc_feed_private.jobseeker_search_projection (prefecture, employment_type);

create index if not exists hc_jobseeker_search_projection_search_trgm_idx
  on hc_feed_private.jobseeker_search_projection
  using gin (search_document extensions.gin_trgm_ops);
