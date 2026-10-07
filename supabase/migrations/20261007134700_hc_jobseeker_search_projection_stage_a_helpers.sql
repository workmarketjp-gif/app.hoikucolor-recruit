-- HC candidate search projection: Stage A benchmark helpers.
-- These helpers are private/service-role only and are not wired to production RPCs.

create or replace function hc_feed_private.hc_jobseeker_contains_pattern(p_value text)
returns text
language sql
immutable
parallel safe
set search_path = pg_catalog
as $$
  select '%' ||
    replace(
      replace(
        replace(lower(btrim(coalesce(p_value, ''))), E'\\', E'\\\\'),
        '%', E'\\%'
      ),
      '_', E'\\_'
    ) ||
  '%';
$$;

revoke all on function hc_feed_private.hc_jobseeker_contains_pattern(text)
  from public, anon, authenticated;

create or replace view hc_feed_private.jobseeker_search_projection_visible
as
select p.*
from hc_feed_private.jobseeker_search_projection p
where (
  (
    p.is_external = false
    and (p.closing_at is null or p.closing_at >= now())
  )
  or
  (
    p.is_external = true
    and p.source_last_verified_at >= now() - interval '12 hours'
    and (p.search_valid_until is null or p.search_valid_until >= now())
    and exists (
      select 1
      from public.hc_external_source_sync_control c
      where c.source = p.source_kind
        and c.enabled = true
        and c.publication_enabled = true
    )
  )
);

revoke all on hc_feed_private.jobseeker_search_projection_visible
  from public, anon, authenticated;
grant select on hc_feed_private.jobseeker_search_projection_visible
  to service_role;

create or replace function hc_feed_private.hc_jobseeker_search_projection_no_keyword_v1(
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
security definer
set search_path = pg_catalog, public, hc_feed_private
as $$
  with base as materialized (
    select
      p.id,
      p.rank_quality,
      p.rank_transparency,
      p.published_at,
      count(*) over ()::bigint as total_count
    from hc_feed_private.jobseeker_search_projection_visible p
    where (nullif(btrim(p_prefecture), '') is null or p.prefecture = btrim(p_prefecture))
      and (nullif(btrim(p_employment_type), '') is null or p.employment_type = btrim(p_employment_type))
      and (not coalesce(p_ho_verified, false) or p.ho_verified = true)
      and (not coalesce(p_hf_verified, false) or p.hf_verified = true)
  ),
  window_page as materialized (
    select b.*
    from base b
    where p_after_id is null
       or b.rank_quality < coalesce(p_after_quality, 0)
       or (
         b.rank_quality = coalesce(p_after_quality, 0)
         and b.rank_transparency < coalesce(p_after_transparency, 0)
       )
       or (
         b.rank_quality = coalesce(p_after_quality, 0)
         and b.rank_transparency = coalesce(p_after_transparency, 0)
         and coalesce(b.published_at, '-infinity'::timestamptz)
             < coalesce(p_after_published_at, '-infinity'::timestamptz)
       )
       or (
         b.rank_quality = coalesce(p_after_quality, 0)
         and b.rank_transparency = coalesce(p_after_transparency, 0)
         and coalesce(b.published_at, '-infinity'::timestamptz)
             = coalesce(p_after_published_at, '-infinity'::timestamptz)
         and b.id > p_after_id
       )
    order by b.rank_quality desc,
             b.rank_transparency desc,
             b.published_at desc nulls last,
             b.id
    limit greatest(1, least(coalesce(p_limit, 24), 50)) + 1
  ),
  page_keys as (
    select w.*
    from window_page w
    order by w.rank_quality desc,
             w.rank_transparency desc,
             w.published_at desc nulls last,
             w.id
    limit greatest(1, least(coalesce(p_limit, 24), 50))
  )
  select
    p.id,
    p.facility_id,
    p.facility_name,
    p.facility_type,
    p.prefecture,
    p.city,
    p.address,
    p.title,
    p.description,
    p.employment_type,
    p.salary_type,
    p.salary_min,
    p.salary_max,
    p.salary_note,
    p.working_hours,
    p.holidays,
    p.required_qualification,
    p.benefits,
    p.number_of_positions,
    p.published_at,
    p.closing_at,
    p.spot_break_minutes,
    p.verified_workplace,
    p.verified_finance,
    p.source_kind,
    p.source_name,
    p.source_job_id,
    p.source_url,
    p.source_last_verified_at,
    p.is_external,
    p.can_apply_direct,
    p.rank_quality,
    p.rank_transparency,
    k.total_count,
    ((select count(*) from window_page) >
      greatest(1, least(coalesce(p_limit, 24), 50))) as has_more
  from page_keys k
  join hc_feed_private.jobseeker_search_projection p on p.id = k.id
  order by k.rank_quality desc,
           k.rank_transparency desc,
           k.published_at desc nulls last,
           k.id;
$$;

revoke all on function hc_feed_private.hc_jobseeker_search_projection_no_keyword_v1(
  text,text,boolean,boolean,integer,numeric,numeric,timestamptz,uuid
) from public, anon, authenticated;
grant execute on function hc_feed_private.hc_jobseeker_search_projection_no_keyword_v1(
  text,text,boolean,boolean,integer,numeric,numeric,timestamptz,uuid
) to service_role;

create or replace function hc_feed_private.hc_jobseeker_search_projection_keyword_v1(
  p_query text,
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
security definer
set search_path = pg_catalog, public, hc_feed_private
as $$
  with base as materialized (
    select
      p.id,
      p.rank_quality,
      p.rank_transparency,
      p.published_at,
      count(*) over ()::bigint as total_count
    from hc_feed_private.jobseeker_search_projection_visible p
    where p.search_document like hc_feed_private.hc_jobseeker_contains_pattern(p_query) escape E'\\'
      and (nullif(btrim(p_prefecture), '') is null or p.prefecture = btrim(p_prefecture))
      and (nullif(btrim(p_employment_type), '') is null or p.employment_type = btrim(p_employment_type))
      and (not coalesce(p_ho_verified, false) or p.ho_verified = true)
      and (not coalesce(p_hf_verified, false) or p.hf_verified = true)
  ),
  window_page as materialized (
    select b.*
    from base b
    where p_after_id is null
       or b.rank_quality < coalesce(p_after_quality, 0)
       or (
         b.rank_quality = coalesce(p_after_quality, 0)
         and b.rank_transparency < coalesce(p_after_transparency, 0)
       )
       or (
         b.rank_quality = coalesce(p_after_quality, 0)
         and b.rank_transparency = coalesce(p_after_transparency, 0)
         and coalesce(b.published_at, '-infinity'::timestamptz)
             < coalesce(p_after_published_at, '-infinity'::timestamptz)
       )
       or (
         b.rank_quality = coalesce(p_after_quality, 0)
         and b.rank_transparency = coalesce(p_after_transparency, 0)
         and coalesce(b.published_at, '-infinity'::timestamptz)
             = coalesce(p_after_published_at, '-infinity'::timestamptz)
         and b.id > p_after_id
       )
    order by b.rank_quality desc,
             b.rank_transparency desc,
             b.published_at desc nulls last,
             b.id
    limit greatest(1, least(coalesce(p_limit, 24), 50)) + 1
  ),
  page_keys as (
    select w.*
    from window_page w
    order by w.rank_quality desc,
             w.rank_transparency desc,
             w.published_at desc nulls last,
             w.id
    limit greatest(1, least(coalesce(p_limit, 24), 50))
  )
  select
    p.id,
    p.facility_id,
    p.facility_name,
    p.facility_type,
    p.prefecture,
    p.city,
    p.address,
    p.title,
    p.description,
    p.employment_type,
    p.salary_type,
    p.salary_min,
    p.salary_max,
    p.salary_note,
    p.working_hours,
    p.holidays,
    p.required_qualification,
    p.benefits,
    p.number_of_positions,
    p.published_at,
    p.closing_at,
    p.spot_break_minutes,
    p.verified_workplace,
    p.verified_finance,
    p.source_kind,
    p.source_name,
    p.source_job_id,
    p.source_url,
    p.source_last_verified_at,
    p.is_external,
    p.can_apply_direct,
    p.rank_quality,
    p.rank_transparency,
    k.total_count,
    ((select count(*) from window_page) >
      greatest(1, least(coalesce(p_limit, 24), 50))) as has_more
  from page_keys k
  join hc_feed_private.jobseeker_search_projection p on p.id = k.id
  order by k.rank_quality desc,
           k.rank_transparency desc,
           k.published_at desc nulls last,
           k.id;
$$;

revoke all on function hc_feed_private.hc_jobseeker_search_projection_keyword_v1(
  text,text,text,boolean,boolean,integer,numeric,numeric,timestamptz,uuid
) from public, anon, authenticated;
grant execute on function hc_feed_private.hc_jobseeker_search_projection_keyword_v1(
  text,text,text,boolean,boolean,integer,numeric,numeric,timestamptz,uuid
) to service_role;

create or replace function hc_feed_private.hc_jobseeker_job_search_facets_projection_v1()
returns table (
  prefectures text[],
  employment_types text[]
)
language sql
stable
security definer
set search_path = pg_catalog, public, hc_feed_private
as $$
  select
    coalesce(
      array_agg(distinct p.prefecture order by p.prefecture)
        filter (where nullif(btrim(p.prefecture), '') is not null),
      '{}'::text[]
    ) as prefectures,
    coalesce(
      array_agg(distinct p.employment_type order by p.employment_type)
        filter (where nullif(btrim(p.employment_type), '') is not null),
      '{}'::text[]
    ) as employment_types
  from hc_feed_private.jobseeker_search_projection_visible p;
$$;

revoke all on function hc_feed_private.hc_jobseeker_job_search_facets_projection_v1()
  from public, anon, authenticated;
grant execute on function hc_feed_private.hc_jobseeker_job_search_facets_projection_v1()
  to service_role;

comment on function hc_feed_private.hc_jobseeker_search_projection_no_keyword_v1(
  text,text,boolean,boolean,integer,numeric,numeric,timestamptz,uuid
) is 'Stage A benchmark helper. Not used by production HC candidate search.';

comment on function hc_feed_private.hc_jobseeker_search_projection_keyword_v1(
  text,text,text,boolean,boolean,integer,numeric,numeric,timestamptz,uuid
) is 'Stage A trigram benchmark helper. Not used by production HC candidate search.';

comment on function hc_feed_private.hc_jobseeker_job_search_facets_projection_v1()
  is 'Stage A facet benchmark helper. Not used by production HC candidate search.';
