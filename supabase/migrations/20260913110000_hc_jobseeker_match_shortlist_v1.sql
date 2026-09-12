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
  scored as (
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
      (
        case when exists (
          select 1 from public.hc_saved_jobs s where s.job_id = r.id
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
  )
  select
    scored.id,
    scored.facility_id,
    scored.facility_name,
    scored.facility_type,
    scored.prefecture,
    scored.city,
    scored.address,
    scored.title,
    scored.description,
    scored.employment_type,
    scored.salary_type,
    scored.salary_min,
    scored.salary_max,
    scored.salary_note,
    scored.working_hours,
    scored.holidays,
    scored.required_qualification,
    scored.benefits,
    scored.number_of_positions,
    scored.published_at,
    scored.closing_at,
    scored.spot_break_minutes,
    scored.verified_workplace,
    scored.verified_finance
  from scored
  order by
    scored.candidate_pref_score desc,
    scored.verified_quality desc,
    scored.verified_transparency desc,
    scored.published_at desc nulls last,
    scored.id
  limit 120;
$$;

revoke all on function public.hc_jobseeker_list_ranked_jobs() from public, anon;
grant execute on function public.hc_jobseeker_list_ranked_jobs() to authenticated, service_role;

comment on function public.hc_jobseeker_list_ranked_jobs() is
  'Candidate-safe bounded shortlist for matching/comparison. Broad structured preference scoring happens server-side; detailed condition and childcare-value scoring remains client-side over at most 120 active jobs. HO/HF Verified data is used only as separate public evidence and tie-break ordering.';

do $$
begin
  if has_function_privilege('anon', 'public.hc_jobseeker_list_ranked_jobs()', 'EXECUTE') then
    raise exception 'anon must not execute hc_jobseeker_list_ranked_jobs';
  end if;
  if not has_function_privilege('authenticated', 'public.hc_jobseeker_list_ranked_jobs()', 'EXECUTE') then
    raise exception 'authenticated must execute hc_jobseeker_list_ranked_jobs';
  end if;
end;
$$;
