-- Hoiku Color Candidate Web — 転職シミュレーター data contract v1.
-- NOT applied to production. Review, then apply with explicit approval.
--
-- 1. Posted-salary aggregates over the SAME population the job search shows
--    (hc_jobseeker_job_feed ∪ hc_external_job_public_feed), computed in SQL, never in the browser.
-- 2. Deterministic scenario filtering over that population (no estimates).
-- 3. Owner-scoped saved comparison conditions (restore on next visit).
--
-- Population note: the public external feed only contains postings re-verified within 168 hours,
-- so coverage follows the sync cursor (prefectures are filled in progressively). The aggregate
-- reports per-prefecture counts so the app can state its coverage instead of claiming 全国.
--
-- Data ownership (B): occupation (保育士 / 看護師 / 調理員 …) and annual holidays are NOT classified or parsed here.
-- The public feed mixes every role a nursery hires, and carries no occupation field today, so
-- occupation_group is NULL (and p_occupation filters nothing meaningful) until B ships a verified one.
-- Annual holidays: hc_private.career_posted_jobs_v1()
-- returns annual_holidays_days / annual_holidays_basis as NULL until B ships a verified column
-- and replaces that one function body. 'exact' = stated as N days, 'minimum' = 「N日以上」.
-- Public official-statistics (e-Stat) results are a different source and are NOT read here.
begin;

do $$
begin
  if to_regclass('public.hc_jobseeker_profiles') is null
     or to_regclass('public.hc_jobseeker_job_feed') is null
     or to_regclass('public.hc_external_job_public_feed') is null
     or to_regprocedure('hc_private.assert_jobseeker_mutation_allowed_v1(text)') is null
     or to_regprocedure('hc_private.hc_candidate_owned_row_account_freeze_v1()') is null then
    raise exception 'HC_CAREER_MARKET_PREREQUISITE_MISSING';
  end if;
end $$;

-- One definition of "the postings a jobseeker can currently see".
create or replace function hc_private.career_posted_jobs_v1()
returns table (
  id uuid, facility_name text, title text, prefecture text, employment_type text,
  occupation_group text, salary_type text, salary_min integer, salary_max integer,
  annual_holidays_days integer, annual_holidays_basis text, is_external boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, r.facility_name, r.title, r.prefecture, r.employment_type,
         null::text, r.salary_type, r.salary_min, r.salary_max,
         null::integer, null::text, false
  from public.hc_jobseeker_job_feed r
  union all
  select e.id, e.facility_name, e.title, e.prefecture, e.employment_type,
         null::text, e.salary_type, e.salary_min, e.salary_max,
         null::integer, null::text, true
  from public.hc_external_job_public_feed e
$$;

revoke all on function hc_private.career_posted_jobs_v1() from public, anon, authenticated, service_role;

-- Monthly lower bounds outside 10万〜100万円 are treated as input errors and counted, not charted.
create or replace function public.hc_jobseeker_salary_market_v1(
  p_prefecture text default null,
  p_employment_type text default null,
  p_occupation text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor text := nullif((select auth.jwt()) ->> 'sub', '');
  v_pref text := nullif(btrim(p_prefecture), '');
  v_emp text := nullif(btrim(p_employment_type), '');
  v_occ text := nullif(btrim(p_occupation), '');
  v_result jsonb;
begin
  if v_actor is null then
    raise exception 'HC_JOBSEEKER_AUTH_REQUIRED' using errcode = '42501';
  end if;

  with pop as (select * from hc_private.career_posted_jobs_v1()),
  scoped as (
    select * from pop
    where (v_pref is null or prefecture = v_pref)
      and (v_emp is null or employment_type = v_emp)
      and (v_occ is null or occupation_group = v_occ)
  ),
  monthly as (
    select * from scoped
    where salary_type = 'monthly' and salary_min between 100000 and 1000000
  ),
  stats as (
    select count(*) as n,
      round(percentile_cont(0.25) within group (order by salary_min))::integer as q1,
      round(percentile_cont(0.5) within group (order by salary_min))::integer as median,
      round(percentile_cont(0.75) within group (order by salary_min))::integer as q3,
      min(salary_min) as lo, max(salary_min) as hi
    from monthly
  ),
  hist as (
    select (salary_min / 20000) * 20000 as bin_from, count(*) as c
    from monthly group by 1
  )
  select jsonb_build_object(
    'scope', jsonb_build_object('prefecture', v_pref, 'employment_type', v_emp, 'occupation', v_occ),
    'as_of', now(),
    'population', jsonb_build_object(
      'total_count', (select count(*) from pop),
      'scope_count', (select count(*) from scoped),
      'monthly_count', (select n from stats),
      'not_monthly_count', (select count(*) from scoped where salary_type is distinct from 'monthly'),
      'occupation_verified_count', (select count(*) from scoped where occupation_group is not null),
      'implausible_count', (select count(*) from scoped where salary_type = 'monthly'
                              and (salary_min is null or salary_min not between 100000 and 1000000))
    ),
    'monthly_lower_bound', (
      select case when s.n >= 5 then jsonb_build_object(
        'count', s.n, 'median', s.median, 'q1', s.q1, 'q3', s.q3, 'min', s.lo, 'max', s.hi,
        'histogram', (select jsonb_agg(jsonb_build_object('from', h.bin_from, 'to', h.bin_from + 20000, 'count', h.c)
                                       order by h.bin_from) from hist h)
      ) end
      from stats s
    ),
    'holidays', jsonb_build_object(
      'scope_count', (select count(*) from scoped),
      'verified_count', (select count(*) from scoped where annual_holidays_days is not null)
    ),
    'facets', jsonb_build_object(
      'coverage', coalesce((select jsonb_agg(jsonb_build_object('prefecture', x.prefecture, 'count', x.c) order by x.prefecture)
                            from (select prefecture, count(*) as c from pop where prefecture is not null group by 1) x), '[]'::jsonb),
      'employment_types', coalesce((select jsonb_agg(x.employment_type order by x.employment_type)
                                    from (select distinct employment_type from pop where employment_type is not null) x), '[]'::jsonb)
    )
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.hc_jobseeker_salary_market_v1(text, text, text) from public, anon, authenticated, service_role;
grant execute on function public.hc_jobseeker_salary_market_v1(text, text, text) to authenticated;

-- Scenario filters. Only posted values are compared:
--   keep-income    posted upper bound reaches the line (reach says whether the lower bound already does)
--   more-holidays  reaches the line AND verified annual holidays exceed the floor; postings with
--                  unverified holidays are counted in unknown_holidays, never ranked
--   balance        postings with verified holidays, ranked inside the same pool by a weighted
--                  percentile of lower-bound pay and holidays (weight 100 = pay only)
create or replace function public.hc_jobseeker_career_scenario_jobs_v1(
  p_scenario text,
  p_prefecture text default null,
  p_employment_type text default null,
  p_salary_line integer default null,
  p_holiday_floor integer default null,
  p_salary_weight integer default 50,
  p_limit integer default 5,
  p_occupation text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor text := nullif((select auth.jwt()) ->> 'sub', '');
  v_pref text := nullif(btrim(p_prefecture), '');
  v_emp text := nullif(btrim(p_employment_type), '');
  v_occ text := nullif(btrim(p_occupation), '');
  v_limit integer := greatest(1, least(coalesce(p_limit, 5), 20));
  v_weight numeric := greatest(0, least(coalesce(p_salary_weight, 50), 100)) / 100.0;
  v_total integer;
  v_unknown integer := 0;
  v_known integer;
  v_afford integer;
  v_jobs jsonb;
begin
  if v_actor is null then
    raise exception 'HC_JOBSEEKER_AUTH_REQUIRED' using errcode = '42501';
  end if;
  if p_scenario not in ('keep-income', 'more-holidays', 'balance') then
    raise exception 'HC_CAREER_INVALID_SCENARIO' using errcode = '22023';
  end if;
  if p_scenario <> 'balance' and (p_salary_line is null or p_salary_line < 0 or p_salary_line > 2000000) then
    return jsonb_build_object('ready', false, 'missing', 'salary_line');
  end if;

  with base as (
    select p.id, p.facility_name, p.title, p.prefecture, p.employment_type, p.salary_min,
           greatest(p.salary_min, coalesce(p.salary_max, p.salary_min)) as salary_max,
           p.annual_holidays_days, p.annual_holidays_basis
    from hc_private.career_posted_jobs_v1() p
    where p.salary_type = 'monthly' and p.salary_min between 100000 and 1000000
      and (v_pref is null or p.prefecture = v_pref)
      and (v_emp is null or p.employment_type = v_emp)
      and (v_occ is null or p.occupation_group = v_occ)
  ),
  afford as (select * from base where p_scenario = 'balance' or salary_max >= p_salary_line),
  known as (select * from afford where annual_holidays_days is not null),
  scored as (
    select k.*, percent_rank() over (order by salary_min) as sal,
           percent_rank() over (order by annual_holidays_days) as hol
    from known k
  ),
  matched as (
    select id, facility_name, title, prefecture, employment_type, salary_min, salary_max,
           annual_holidays_days, annual_holidays_basis, v_weight * sal + (1 - v_weight) * hol as score
    from scored where p_scenario = 'balance'
    union all
    select id, facility_name, title, prefecture, employment_type, salary_min, salary_max,
           annual_holidays_days, annual_holidays_basis, null
    from afford where p_scenario = 'keep-income'
    union all
    select id, facility_name, title, prefecture, employment_type, salary_min, salary_max,
           annual_holidays_days, annual_holidays_basis, null
    from known
    where p_scenario = 'more-holidays' and (p_holiday_floor is null or annual_holidays_days > p_holiday_floor)
  ),
  ranked as (
    select m.*, row_number() over (order by
        case when p_scenario = 'balance' then score end desc nulls last,
        case when p_scenario = 'more-holidays' then annual_holidays_days end desc nulls last,
        salary_min desc, id) as ord
    from matched m
  )
  select
    (select count(*) from matched),
    (select count(*) from known),
    (select count(*) from afford),
    coalesce((select jsonb_agg(jsonb_build_object(
        'id', r.id, 'facility_name', r.facility_name, 'title', r.title, 'prefecture', r.prefecture,
        'employment_type', r.employment_type, 'salary_min', r.salary_min, 'salary_max', r.salary_max,
        'annual_holidays_days', r.annual_holidays_days, 'annual_holidays_basis', r.annual_holidays_basis,
        'reach', case when p_scenario = 'balance' or p_salary_line is null or r.salary_min >= p_salary_line
                      then 'lower-bound' else 'upper-bound-only' end
      ) order by r.ord) from ranked r where r.ord <= v_limit), '[]'::jsonb)
  into v_total, v_known, v_afford, v_jobs;

  v_unknown := case when p_scenario = 'keep-income' then 0 else v_afford - v_known end;
  if p_scenario = 'balance' and v_known < 5 then
    return jsonb_build_object('ready', false, 'missing', 'verified_holidays', 'unknown_holidays', v_unknown);
  end if;

  return jsonb_build_object('ready', true, 'total', v_total, 'unknown_holidays', v_unknown, 'jobs', v_jobs);
end;
$$;

revoke all on function public.hc_jobseeker_career_scenario_jobs_v1(text, text, text, integer, integer, integer, integer, text) from public, anon, authenticated, service_role;
grant execute on function public.hc_jobseeker_career_scenario_jobs_v1(text, text, text, integer, integer, integer, integer, text) to authenticated;

-- Saved comparison conditions. Desired minimum pay / region are NOT duplicated: they stay in
-- hc_jobseeker_profiles (hc_jobseeker_*_matching_preferences). Owner-scoped, RPC-only writes.
create table if not exists public.hc_jobseeker_career_conditions (
  clerk_user_id text primary key
    references public.hc_jobseeker_profiles(clerk_user_id) on delete cascade,
  current_monthly_salary integer check (current_monthly_salary is null or current_monthly_salary between 0 and 2000000),
  current_annual_holidays smallint check (current_annual_holidays is null or current_annual_holidays between 0 and 366),
  tolerable_salary_drop integer check (tolerable_salary_drop is null or tolerable_salary_drop between 0 and 2000000),
  desired_annual_holidays smallint check (desired_annual_holidays is null or desired_annual_holidays between 0 and 366),
  scenario text not null default 'keep-income' check (scenario in ('keep-income', 'more-holidays', 'balance')),
  salary_weight smallint not null default 50 check (salary_weight between 0 and 100),
  updated_at timestamptz not null default now()
);

alter table public.hc_jobseeker_career_conditions enable row level security;
revoke all on table public.hc_jobseeker_career_conditions from public, anon, authenticated;
grant select on table public.hc_jobseeker_career_conditions to authenticated;

drop policy if exists hc_jobseeker_career_conditions_select_own on public.hc_jobseeker_career_conditions;
create policy hc_jobseeker_career_conditions_select_own on public.hc_jobseeker_career_conditions
  for select to authenticated
  using (clerk_user_id = nullif(((select auth.jwt()) ->> 'sub'), ''));

drop trigger if exists hc_account_deletion_freeze_jobseeker_career_conditions on public.hc_jobseeker_career_conditions;
create trigger hc_account_deletion_freeze_jobseeker_career_conditions
before insert or update or delete on public.hc_jobseeker_career_conditions
for each row execute function hc_private.hc_candidate_owned_row_account_freeze_v1('clerk_user_id');

create or replace function public.hc_jobseeker_get_career_conditions()
returns jsonb
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
  return (
    select to_jsonb(c) - 'clerk_user_id'
    from public.hc_jobseeker_career_conditions c
    where c.clerk_user_id = v_actor
  );
end;
$$;

revoke all on function public.hc_jobseeker_get_career_conditions() from public, anon, authenticated, service_role;
grant execute on function public.hc_jobseeker_get_career_conditions() to authenticated;

create or replace function public.hc_jobseeker_save_career_conditions(p_conditions jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor text := nullif((select auth.jwt()) ->> 'sub', '');
  v_row public.hc_jobseeker_career_conditions;
begin
  if v_actor is null then
    raise exception 'HC_JOBSEEKER_AUTH_REQUIRED' using errcode = '42501';
  end if;
  perform hc_private.assert_jobseeker_mutation_allowed_v1(v_actor);
  if p_conditions is null or jsonb_typeof(p_conditions) <> 'object' then
    raise exception 'HC_CAREER_INVALID_PAYLOAD' using errcode = '22023';
  end if;
  if not exists (select 1 from public.hc_jobseeker_profiles where clerk_user_id = v_actor) then
    raise exception 'HC_CAREER_PROFILE_REQUIRED' using errcode = '22023';
  end if;

  insert into public.hc_jobseeker_career_conditions as c (
    clerk_user_id, current_monthly_salary, current_annual_holidays, tolerable_salary_drop,
    desired_annual_holidays, scenario, salary_weight, updated_at
  ) values (
    v_actor,
    (p_conditions ->> 'current_monthly_salary')::integer,
    (p_conditions ->> 'current_annual_holidays')::smallint,
    (p_conditions ->> 'tolerable_salary_drop')::integer,
    (p_conditions ->> 'desired_annual_holidays')::smallint,
    coalesce(p_conditions ->> 'scenario', 'keep-income'),
    coalesce((p_conditions ->> 'salary_weight')::smallint, 50),
    now()
  )
  on conflict (clerk_user_id) do update set
    current_monthly_salary = excluded.current_monthly_salary,
    current_annual_holidays = excluded.current_annual_holidays,
    tolerable_salary_drop = excluded.tolerable_salary_drop,
    desired_annual_holidays = excluded.desired_annual_holidays,
    scenario = excluded.scenario,
    salary_weight = excluded.salary_weight,
    updated_at = now()
  returning * into v_row;

  return to_jsonb(v_row) - 'clerk_user_id';
end;
$$;

revoke all on function public.hc_jobseeker_save_career_conditions(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.hc_jobseeker_save_career_conditions(jsonb) to authenticated;

-- 「保存を削除」: the owner can erase the saved conditions without deleting the account.
create or replace function public.hc_jobseeker_delete_career_conditions()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor text := nullif((select auth.jwt()) ->> 'sub', '');
begin
  if v_actor is null then
    raise exception 'HC_JOBSEEKER_AUTH_REQUIRED' using errcode = '42501';
  end if;
  perform hc_private.assert_jobseeker_mutation_allowed_v1(v_actor);
  delete from public.hc_jobseeker_career_conditions where clerk_user_id = v_actor;
end;
$$;

revoke all on function public.hc_jobseeker_delete_career_conditions() from public, anon, authenticated, service_role;
grant execute on function public.hc_jobseeker_delete_career_conditions() to authenticated;

commit;
