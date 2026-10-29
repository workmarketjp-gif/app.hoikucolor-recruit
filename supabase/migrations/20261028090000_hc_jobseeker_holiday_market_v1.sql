-- キャリアダッシュボード: 求人票に明記された年間休日の分布（読み取り専用の集計 RPC）。
--
-- Contract: docs/career-data-contract.md「年間休日の分布」.
-- * Population is hc_private.career_posted_jobs_v1() — exactly the postings job search shows.
-- * Only annual_holidays_days written by the structure trigger is counted; nothing is parsed,
--   estimated or filled in here. Postings without a stated number are counted, never placed.
-- * basis 'minimum' (「125日以上」) is placed in the band of its stated floor and counted apart,
--   so the browser can say 「以上」 instead of treating it as an exact number.
-- * Fewer than 5 stated values in scope: no bands (same threshold as the salary median).
-- * Authenticated candidates only; identity from the JWT; no caller-supplied identity.
--
-- NOT APPLIED by this PR. Apply only after review by the shared-migration owner.

begin;

create or replace function public.hc_jobseeker_holiday_market_v1(
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

  with scoped as (
    select p.annual_holidays_days as days, p.annual_holidays_basis as basis
    from hc_private.career_posted_jobs_v1() p
    where (v_pref is null or p.prefecture = v_pref)
      and (v_emp is null or p.employment_type = v_emp)
      and (v_occ is null or v_occ = any (p.occupation_groups))
  ),
  stated as (
    select days, basis from scoped
    where days between 50 and 200 and basis in ('exact', 'minimum')
  ),
  bands(ord, band_from, band_to, label) as (
    values (1, 50, 104, '104日以下'), (2, 105, 109, '105〜109日'), (3, 110, 114, '110〜114日'),
           (4, 115, 119, '115〜119日'), (5, 120, 124, '120〜124日'), (6, 125, 200, '125日以上')
  ),
  counted as (
    select b.ord, b.band_from, b.band_to, b.label,
           count(s.days) filter (where s.basis = 'exact') as exact_count,
           count(s.days) filter (where s.basis = 'minimum') as minimum_count
    from bands b
    left join stated s on s.days between b.band_from and b.band_to
    group by b.ord, b.band_from, b.band_to, b.label
  )
  select jsonb_build_object(
    'scope', jsonb_build_object('prefecture', v_pref, 'employment_type', v_emp, 'occupation', v_occ),
    'as_of', now(),
    'population', jsonb_build_object(
      'scope_count', (select count(*) from scoped),
      'stated_count', (select count(*) from stated),
      'exact_count', (select count(*) from stated where basis = 'exact'),
      'minimum_count', (select count(*) from stated where basis = 'minimum'),
      'unstated_count', (select count(*) from scoped) - (select count(*) from stated)
    ),
    'bands', case when (select count(*) from stated) >= 5 then (
      select jsonb_agg(jsonb_build_object(
               'from', c.band_from, 'to', c.band_to, 'label', c.label,
               'exact_count', c.exact_count, 'minimum_count', c.minimum_count) order by c.ord)
      from counted c
    ) end
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.hc_jobseeker_holiday_market_v1(text, text, text) from public, anon, authenticated, service_role;
grant execute on function public.hc_jobseeker_holiday_market_v1(text, text, text) to authenticated;

commit;
