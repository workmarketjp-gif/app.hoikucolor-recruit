create index if not exists hc_public_job_rows_prefecture_employment_idx
  on hc_feed_private.public_job_rows (prefecture, employment_type);

create or replace function public.hc_jobseeker_search_jobs(
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
  with ranked as (
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
      (coalesce(w.quality_points, 0) + coalesce(f.quality_points, 0))::numeric as rank_quality,
      (coalesce(w.transparency_pct, 0) + coalesce(f.transparency_pct, 0))::numeric as rank_transparency
    from public.hc_jobseeker_job_feed r
    left join public.hc_public_workplace_profiles w on w.facility_id = r.facility_id
    left join public.hc_public_finance_profiles f on f.facility_id = r.facility_id
    where (
      nullif(btrim(p_query), '') is null
      or strpos(
        lower(concat_ws(' ', r.title, r.facility_name, r.description, r.prefecture, r.city, r.required_qualification)),
        lower(btrim(p_query))
      ) > 0
    )
      and (nullif(btrim(p_prefecture), '') is null or r.prefecture = btrim(p_prefecture))
      and (nullif(btrim(p_employment_type), '') is null or r.employment_type = btrim(p_employment_type))
      and (not coalesce(p_ho_verified, false) or coalesce(w.verified_metric_count, 0) > 0)
      and (not coalesce(p_hf_verified, false) or coalesce(f.verified_metric_count, 0) > 0)
  ),
  counted as (
    select ranked.*, count(*) over () as total_count
    from ranked
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
         and published_at < coalesce(p_after_published_at, '-infinity'::timestamptz)
       )
       or (
         rank_quality = coalesce(p_after_quality, 0)
         and rank_transparency = coalesce(p_after_transparency, 0)
         and published_at = coalesce(p_after_published_at, '-infinity'::timestamptz)
         and id > p_after_id
       )
    order by rank_quality desc, rank_transparency desc, published_at desc, id
    limit greatest(1, least(coalesce(p_limit, 24), 50)) + 1
  )
  select
    page.id,
    page.facility_id,
    page.facility_name,
    page.facility_type,
    page.prefecture,
    page.city,
    page.address,
    page.title,
    page.description,
    page.employment_type,
    page.salary_type,
    page.salary_min,
    page.salary_max,
    page.salary_note,
    page.working_hours,
    page.holidays,
    page.required_qualification,
    page.benefits,
    page.number_of_positions,
    page.published_at,
    page.closing_at,
    page.spot_break_minutes,
    page.verified_workplace,
    page.verified_finance,
    page.rank_quality,
    page.rank_transparency,
    page.total_count,
    ((select count(*) from page) > greatest(1, least(coalesce(p_limit, 24), 50))) as has_more
  from page
  order by page.rank_quality desc, page.rank_transparency desc, page.published_at desc, page.id
  limit greatest(1, least(coalesce(p_limit, 24), 50));
$$;

create or replace function public.hc_jobseeker_job_search_facets()
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
    coalesce(array_agg(distinct r.prefecture order by r.prefecture) filter (where nullif(btrim(r.prefecture), '') is not null), '{}'::text[]) as prefectures,
    coalesce(array_agg(distinct r.employment_type order by r.employment_type) filter (where nullif(btrim(r.employment_type), '') is not null), '{}'::text[]) as employment_types
  from public.hc_jobseeker_job_feed r;
$$;

create or replace function public.hc_jobseeker_list_saved_ranked_jobs()
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
  verified_finance jsonb
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
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
    case when f.facility_id is null then null else to_jsonb(f) end as verified_finance
  from public.hc_saved_jobs s
  join public.hc_jobseeker_job_feed r on r.id = s.job_id
  left join public.hc_public_workplace_profiles w on w.facility_id = r.facility_id
  left join public.hc_public_finance_profiles f on f.facility_id = r.facility_id
  order by s.created_at desc;
$$;

revoke all on function public.hc_jobseeker_search_jobs(text, text, text, boolean, boolean, integer, numeric, numeric, timestamptz, uuid) from public, anon;
revoke all on function public.hc_jobseeker_job_search_facets() from public, anon;
revoke all on function public.hc_jobseeker_list_saved_ranked_jobs() from public, anon;
grant execute on function public.hc_jobseeker_search_jobs(text, text, text, boolean, boolean, integer, numeric, numeric, timestamptz, uuid) to authenticated, service_role;
grant execute on function public.hc_jobseeker_job_search_facets() to authenticated, service_role;
grant execute on function public.hc_jobseeker_list_saved_ranked_jobs() to authenticated, service_role;

comment on function public.hc_jobseeker_search_jobs(text, text, text, boolean, boolean, integer, numeric, numeric, timestamptz, uuid) is
  'Candidate-safe server-side job search with HO/HF Verified filters and stable composite cursor pagination.';
comment on function public.hc_jobseeker_job_search_facets() is
  'Candidate-safe active-job filter facets derived only from the jobseeker feed.';
comment on function public.hc_jobseeker_list_saved_ranked_jobs() is
  'Candidate-safe saved-job catalog; saved-job RLS binds rows to the current authenticated jobseeker.';

do $$
begin
  if has_function_privilege('anon', 'public.hc_jobseeker_search_jobs(text,text,text,boolean,boolean,integer,numeric,numeric,timestamptz,uuid)', 'EXECUTE') then
    raise exception 'anon must not execute hc_jobseeker_search_jobs';
  end if;
  if not has_function_privilege('authenticated', 'public.hc_jobseeker_search_jobs(text,text,text,boolean,boolean,integer,numeric,numeric,timestamptz,uuid)', 'EXECUTE') then
    raise exception 'authenticated must execute hc_jobseeker_search_jobs';
  end if;
  if has_function_privilege('anon', 'public.hc_jobseeker_job_search_facets()', 'EXECUTE') then
    raise exception 'anon must not execute hc_jobseeker_job_search_facets';
  end if;
  if has_function_privilege('anon', 'public.hc_jobseeker_list_saved_ranked_jobs()', 'EXECUTE') then
    raise exception 'anon must not execute hc_jobseeker_list_saved_ranked_jobs';
  end if;
end;
$$;
