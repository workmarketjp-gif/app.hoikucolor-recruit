-- Production migration version: 20261023020217 (applied 2026-10-23 with the user's approval).
-- Production already has this migration. Repository sync must NOT re-apply it there.
--
-- Career scenario: separate 「N日以上」 from 「N日を超える」 for annual holidays.
--   p_holiday_floor     = "more than" (strict): used for 「今より多い」 (the person's current holidays)
--   p_holiday_at_least  = "at least" (>=):     used for 「希望の年間休日 N日以上」
-- A posting whose basis is 'minimum' (「125日以上」) is a lower bound: it satisfies "at least N" iff days >= N and
-- "more than N" iff days > N, i.e. only what the posting guarantees. Both conditions apply together.
-- Adding a parameter creates an overload PostgREST cannot resolve, so the 8-argument version is dropped first
-- (named-argument callers keep working because every new parameter has a default).
drop function if exists public.hc_jobseeker_career_scenario_jobs_v1(text, text, text, integer, integer, integer, integer, text);

create or replace function public.hc_jobseeker_career_scenario_jobs_v1(
  p_scenario text,
  p_prefecture text default null,
  p_employment_type text default null,
  p_salary_line integer default null,
  p_holiday_floor integer default null,
  p_salary_weight integer default 50,
  p_limit integer default 5,
  p_occupation text default null,
  p_holiday_at_least integer default null
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
  if (p_holiday_floor is not null and p_holiday_floor not between 0 and 366)
     or (p_holiday_at_least is not null and p_holiday_at_least not between 0 and 366) then
    raise exception 'HC_CAREER_INVALID_HOLIDAYS' using errcode = '22023';
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
      and (v_occ is null or v_occ = any (p.occupation_groups))
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
    where p_scenario = 'more-holidays'
      and (p_holiday_floor is null or annual_holidays_days > p_holiday_floor)
      and (p_holiday_at_least is null or annual_holidays_days >= p_holiday_at_least)
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

revoke all on function public.hc_jobseeker_career_scenario_jobs_v1(text, text, text, integer, integer, integer, integer, text, integer) from public, anon, authenticated, service_role;
grant execute on function public.hc_jobseeker_career_scenario_jobs_v1(text, text, text, integer, integer, integer, integer, text, integer) to authenticated;
