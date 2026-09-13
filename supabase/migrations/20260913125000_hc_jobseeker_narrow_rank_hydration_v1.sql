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
  with ranked_ids as (
    select
      r.id,
      r.facility_id,
      r.published_at,
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
  counted_ids as (
    select ranked_ids.*, count(*) over () as total_count
    from ranked_ids
  ),
  page_ids as (
    select *
    from counted_ids
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
  ),
  visible_ids as (
    select * from page_ids
    order by rank_quality desc, rank_transparency desc, published_at desc, id
    limit greatest(1, least(coalesce(p_limit, 24), 50))
  )
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
    v.rank_quality,
    v.rank_transparency,
    v.total_count,
    ((select count(*) from page_ids) > greatest(1, least(coalesce(p_limit, 24), 50))) as has_more
  from visible_ids v
  join public.hc_jobseeker_job_feed r on r.id = v.id
  left join public.hc_public_workplace_profiles w on w.facility_id = r.facility_id
  left join public.hc_public_finance_profiles f on f.facility_id = r.facility_id
  order by v.rank_quality desc, v.rank_transparency desc, v.published_at desc, v.id;
$$;

create or replace function public.hc_jobseeker_list_ranked_jobs()
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
  with candidate_profile as (
    select
      coalesce(p.desired_prefectures, '{}'::text[]) as desired_prefectures,
      coalesce(p.desired_cities, '{}'::text[]) as desired_cities,
      coalesce(p.desired_employment_types, '{}'::text[]) as desired_employment_types,
      coalesce(p.desired_positions, '{}'::text[]) as desired_positions,
      coalesce(p.qualifications, '{}'::text[]) as qualifications,
      p.desired_monthly_salary_min,
      p.desired_hourly_wage_min
    from public.hc_jobseeker_profiles p
    where p.clerk_user_id = (auth.jwt() ->> 'sub')
    limit 1
  ),
  scored_ids as (
    select
      r.id,
      r.facility_id,
      r.published_at,
      (
        case when exists (
          select 1
          from public.hc_saved_jobs s
          where s.job_id = r.id
            and s.clerk_user_id = (auth.jwt() ->> 'sub')
        ) then 1000 else 0 end
        + case
            when coalesce(cardinality(p.desired_cities), 0) > 0 and r.city = any(p.desired_cities) then 120
            when coalesce(cardinality(p.desired_prefectures), 0) > 0 and r.prefecture = any(p.desired_prefectures) then 100
            else 0
          end
        + case
            when coalesce(cardinality(p.desired_employment_types), 0) > 0
              and r.employment_type = any(p.desired_employment_types) then 70
            else 0
          end
        + case
            when coalesce(cardinality(p.desired_positions), 0) > 0
              and exists (
                select 1
                from unnest(p.desired_positions) position_name
                where nullif(btrim(position_name), '') is not null
                  and strpos(lower(coalesce(r.title, '')), lower(btrim(position_name))) > 0
              ) then 50
            else 0
          end
        + case
            when r.salary_type = 'hourly'
              and p.desired_hourly_wage_min is not null
              and coalesce(r.salary_max, r.salary_min) >= p.desired_hourly_wage_min then 40
            when coalesce(r.salary_type, '') <> 'hourly'
              and p.desired_monthly_salary_min is not null
              and coalesce(r.salary_max, r.salary_min) >= p.desired_monthly_salary_min then 40
            else 0
          end
        + case
            when coalesce(cardinality(p.qualifications), 0) > 0
              and nullif(btrim(r.required_qualification), '') is not null
              and exists (
                select 1
                from unnest(p.qualifications) qualification_name
                where nullif(btrim(qualification_name), '') is not null
                  and strpos(lower(r.required_qualification), lower(btrim(qualification_name))) > 0
              ) then 25
            else 0
          end
      )::integer as candidate_pref_score,
      (coalesce(w.quality_points, 0) + coalesce(f.quality_points, 0))::numeric as verified_quality,
      (coalesce(w.transparency_pct, 0) + coalesce(f.transparency_pct, 0))::numeric as verified_transparency
    from public.hc_jobseeker_job_feed r
    left join candidate_profile p on true
    left join public.hc_public_workplace_profiles w on w.facility_id = r.facility_id
    left join public.hc_public_finance_profiles f on f.facility_id = r.facility_id
  ),
  shortlist_ids as (
    select *
    from scored_ids
    order by
      candidate_pref_score desc,
      verified_quality desc,
      verified_transparency desc,
      published_at desc nulls last,
      id
    limit 120
  )
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
  from shortlist_ids s
  join public.hc_jobseeker_job_feed r on r.id = s.id
  left join public.hc_public_workplace_profiles w on w.facility_id = r.facility_id
  left join public.hc_public_finance_profiles f on f.facility_id = r.facility_id
  order by
    s.candidate_pref_score desc,
    s.verified_quality desc,
    s.verified_transparency desc,
    s.published_at desc nulls last,
    s.id;
$$;

revoke all on function public.hc_jobseeker_search_jobs(text, text, text, boolean, boolean, integer, numeric, numeric, timestamptz, uuid) from public, anon;
revoke all on function public.hc_jobseeker_list_ranked_jobs() from public, anon;
grant execute on function public.hc_jobseeker_search_jobs(text, text, text, boolean, boolean, integer, numeric, numeric, timestamptz, uuid) to authenticated, service_role;
grant execute on function public.hc_jobseeker_list_ranked_jobs() to authenticated, service_role;

comment on function public.hc_jobseeker_search_jobs(text, text, text, boolean, boolean, integer, numeric, numeric, timestamptz, uuid) is
  'Candidate-safe server-side job search. Ranking/counting happens over narrow identifiers first; only the visible page is hydrated with wide job text and HO/HF public evidence.';
comment on function public.hc_jobseeker_list_ranked_jobs() is
  'Candidate-safe bounded matching/comparison shortlist. Candidate scoring/sorting happens over narrow identifiers first and only the top 120 are hydrated; saved-job boost is explicitly bound to the current Clerk sub.';

do $$
begin
  if has_function_privilege('anon', 'public.hc_jobseeker_search_jobs(text,text,text,boolean,boolean,integer,numeric,numeric,timestamptz,uuid)', 'EXECUTE') then
    raise exception 'anon must not execute hc_jobseeker_search_jobs';
  end if;
  if has_function_privilege('anon', 'public.hc_jobseeker_list_ranked_jobs()', 'EXECUTE') then
    raise exception 'anon must not execute hc_jobseeker_list_ranked_jobs';
  end if;
  if not has_function_privilege('authenticated', 'public.hc_jobseeker_search_jobs(text,text,text,boolean,boolean,integer,numeric,numeric,timestamptz,uuid)', 'EXECUTE') then
    raise exception 'authenticated must execute hc_jobseeker_search_jobs';
  end if;
  if not has_function_privilege('authenticated', 'public.hc_jobseeker_list_ranked_jobs()', 'EXECUTE') then
    raise exception 'authenticated must execute hc_jobseeker_list_ranked_jobs';
  end if;
end;
$$;
