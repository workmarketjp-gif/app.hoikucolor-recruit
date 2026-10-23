-- Production migration version: 20261023001450 (applied 2026-10-23 with the user's approval).
-- Production already has this migration. Repository sync must NOT re-apply it there.
--
-- Hello Work fair re-verification (restores nationwide public coverage without faking freshness).
--
-- Why: the public feed requires last_verified_at within 168 hours. Bulk verification happened on
-- 2026-10-13/14 (30-second discovery cadence). After the cadence was cut to one batch a day only
-- ~50 pages are re-checked daily, so ~25,700 of 25,827 active jobs aged out of the feed.
-- last_verified_at is only ever written by the importer after it fetched the official page.
--
-- This adds the batch picker used by hc-hellowork-import {"reverify":true}:
--   * only active, publicly republishable, unclaimed, unexpired jobs not verified for 24 hours;
--   * proportionally fair across prefectures: each job is ranked inside its prefecture by age and the
--     batch takes the lowest rank/size first, so every prefecture's backlog shrinks at the same rate;
--   * a picked job is stamped (reverify_attempted_at) so a failing URL is not retried for 6 hours;
--   * callable by service_role only (the Edge Function), never by browser roles.
begin;

do $$
begin
  if to_regclass('public.hc_external_job_sources') is null
     or to_regclass('public.hc_external_source_sync_control') is null then
    raise exception 'HC_HW_REVERIFY_PREREQUISITE_MISSING';
  end if;
end $$;

alter table public.hc_external_job_sources
  add column if not exists reverify_attempted_at timestamptz;

alter table public.hc_external_source_sync_control
  add column if not exists reverify_lease_until timestamptz,
  add column if not exists last_reverify_at timestamptz,
  add column if not exists last_reverify_picked integer,
  add column if not exists last_reverify_verified integer,
  add column if not exists last_reverify_withdrawn integer,
  add column if not exists last_reverify_errors integer,
  add column if not exists last_reverify_error text;

create or replace function public.hc_hellowork_pick_reverify_batch_v1(p_limit integer default 40)
returns table (source_url text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 40), 50));
begin
  if not exists (
    select 1 from public.hc_external_source_sync_control c
    where c.source = 'hellowork' and c.enabled and c.publication_enabled
  ) then
    return;
  end if;

  return query
  with candidates as (
    select s.id, s.source_url,
           row_number() over (partition by coalesce(s.prefecture, '') order by s.last_verified_at, s.id) as rn,
           count(*) over (partition by coalesce(s.prefecture, '')) as pref_total
    from public.hc_external_job_sources s
    where s.source = 'hellowork'
      and s.source_status = 'active'
      and s.public_republication_allowed
      and s.claimed_job_id is null
      and (s.closing_at is null or s.closing_at >= now())
      and (s.expires_at is null or s.expires_at >= now())
      and s.last_verified_at < now() - interval '24 hours'
      and (s.reverify_attempted_at is null or s.reverify_attempted_at < now() - interval '6 hours')
  ),
  picked as (
    select id from candidates order by rn::numeric / pref_total, id limit v_limit
  ),
  stamped as (
    update public.hc_external_job_sources s
       set reverify_attempted_at = now()
      from picked p
     where s.id = p.id
    returning s.source_url
  )
  select st.source_url from stamped st;
end;
$$;

revoke all on function public.hc_hellowork_pick_reverify_batch_v1(integer) from public, anon, authenticated;
grant execute on function public.hc_hellowork_pick_reverify_batch_v1(integer) to service_role;

commit;
