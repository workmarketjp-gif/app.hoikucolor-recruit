-- Server-side public job search for the Hoiku Color frontend.
-- Prevents the public LP from loading/filtering a 20k+ job catalog in the browser.

create or replace function public.hc_public_search_jobs_v2(
  p_query text default null,
  p_prefecture text default null,
  p_employment_type text default null,
  p_ho_verified boolean default false,
  p_limit integer default 24,
  p_offset integer default 0
)
returns table (
  id uuid,
  facility_type text,
  prefecture text,
  city text,
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
  facility_name text,
  organization_name text,
  postal_code text,
  address text,
  facility_id uuid,
  source_kind text,
  source_name text,
  source_job_id text,
  source_url text,
  source_last_verified_at timestamptz,
  is_external boolean,
  can_apply_direct boolean,
  online_self_apply_allowed boolean,
  verified_workplace jsonb,
  total_count bigint
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with enriched as (
    select
      j.*,
      case when w.facility_id is null then null else to_jsonb(w) end as verified_workplace,
      coalesce(w.quality_points, 0)::numeric as rank_quality,
      coalesce(w.transparency_pct, 0)::numeric as rank_transparency
    from public.hc_public_job_feed_v2 j
    left join public.hc_public_workplace_profiles w
      on w.facility_id = j.facility_id
  ),
  filtered as (
    select *
    from enriched j
    where (
      nullif(btrim(p_query), '') is null
      or strpos(
        lower(concat_ws(
          ' ',
          j.title,
          j.description,
          j.facility_name,
          j.organization_name,
          j.prefecture,
          j.city,
          j.facility_type,
          j.required_qualification
        )),
        lower(btrim(p_query))
      ) > 0
    )
      and (nullif(btrim(p_prefecture), '') is null or j.prefecture = btrim(p_prefecture))
      and (nullif(btrim(p_employment_type), '') is null or j.employment_type = btrim(p_employment_type))
      and (
        not coalesce(p_ho_verified, false)
        or coalesce((j.verified_workplace->>'verified_metric_count')::integer, 0) > 0
      )
  ),
  counted as (
    select filtered.*, count(*) over () as total_count
    from filtered
  )
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
    j.source_kind,
    j.source_name,
    j.source_job_id,
    j.source_url,
    j.source_last_verified_at,
    j.is_external,
    j.can_apply_direct,
    j.online_self_apply_allowed,
    j.verified_workplace,
    j.total_count
  from counted j
  order by j.rank_quality desc,
           j.rank_transparency desc,
           j.published_at desc nulls last,
           j.id
  limit greatest(1, least(coalesce(p_limit, 24), 50))
  offset greatest(0, coalesce(p_offset, 0));
$$;

create or replace function public.hc_public_job_search_facets_v2()
returns table (
  prefectures text[],
  employment_types text[]
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select
    coalesce(
      array_agg(distinct prefecture order by prefecture)
        filter (where nullif(btrim(prefecture), '') is not null),
      '{}'::text[]
    ) as prefectures,
    coalesce(
      array_agg(distinct employment_type order by employment_type)
        filter (where nullif(btrim(employment_type), '') is not null),
      '{}'::text[]
    ) as employment_types
  from public.hc_public_job_feed_v2;
$$;

revoke all on function public.hc_public_search_jobs_v2(text,text,text,boolean,integer,integer)
  from public;
revoke all on function public.hc_public_job_search_facets_v2()
  from public;

grant execute on function public.hc_public_search_jobs_v2(text,text,text,boolean,integer,integer)
  to anon, authenticated, service_role;
grant execute on function public.hc_public_job_search_facets_v2()
  to anon, authenticated, service_role;

comment on function public.hc_public_search_jobs_v2(text,text,text,boolean,integer,integer) is
  'Anonymous-safe paginated public Hoiku Color job search for 20k+ catalogs.';
