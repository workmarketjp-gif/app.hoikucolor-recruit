# Hello Work re-verification priority v2 — review specification ONLY

> **NOT A MIGRATION. NOT EXECUTED. NO PRODUCTION APPROVAL.**
> This document records a complete proposed SQL replacement function for a future **Supabase CLI-generated, versioned** migration. Do not run the SQL in production, include it in an automatic deploy, or edit/reapply the migration already applied on 2026-10-23.

## Provenance and reason

- Owner repository: `workmarketjp-gif/app.hoikucolor-recruit`.
- Existing applied migration, **do not edit**: `supabase/migrations/20261023001450_hc_hellowork_fair_reverify_v1.sql`.
- Existing production RPC: `public.hc_hellowork_pick_reverify_batch_v1(integer)`, called by `hc-hellowork-import` v29.
- Canonical investigation: [Hoiku Color SEO issue #33](https://github.com/workmarketjp-gif/hoikucolor-lp/issues/33#issuecomment-6812728292).
- Read-only snapshot on 2026-11-12 NZ: 26,208 publicly displayed external jobs, of which 26,201 had a verification time inside 72 hours and seven were older. The RPC eligibility filter yielded eight old candidates overall (one was outside the public feed).
- Existing `rn / pref_total` ranking favors proportionate regional coverage but can defer very old jobs in prefectures with small candidate populations. In the snapshot, seven published 72-hour-overdue records had selection ranks 60 through 4,464; none fit the forty-record batch.
- Read-only proposed-order simulation ranked **all eight 72h+ candidates 1–8** without changing eligibility or verification timestamps.

## Proposed SQL — copy into a NEW CLI-created migration after validation

The 60-hour threshold supplies a margin before the public 72-hour freshness objective. Older items sort by actual verification time; the remainder preserve the existing proportional prefecture selection. Exact function signature, prerequisites, eligibility, lease/attempt backoff, service-role-only access and returned URL contract must remain intact.

~~~sql
begin;

do $guard$
begin
  if to_regprocedure('public.hc_hellowork_pick_reverify_batch_v1(integer)') is null
     or to_regclass('public.hc_external_job_sources') is null
     or to_regclass('public.hc_external_source_sync_control') is null then
    raise exception 'HC_HW_REVERIFY_V2_PREREQUISITE_MISSING';
  end if;
end;
$guard$;

create or replace function public.hc_hellowork_pick_reverify_batch_v1(p_limit integer default 40)
returns table (source_url text)
language plpgsql
security definer
set search_path = ''
as $function$
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
    select s.id, s.source_url, s.last_verified_at,
           row_number() over (
             partition by coalesce(s.prefecture, '')
             order by s.last_verified_at, s.id
           ) as rn,
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
    select c.id
    from candidates c
    order by
      case when c.last_verified_at < now() - interval '60 hours' then 0 else 1 end,
      case when c.last_verified_at < now() - interval '60 hours'
           then c.last_verified_at end asc nulls last,
      c.rn::numeric / c.pref_total,
      c.id
    limit v_limit
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
$function$;

revoke all on function public.hc_hellowork_pick_reverify_batch_v1(integer)
  from public, anon, authenticated;
grant execute on function public.hc_hellowork_pick_reverify_batch_v1(integer)
  to service_role;

commit;
~~~

## Invariants (REQUIRED)

1. No additional Hello Work requests per run: cron remains every five minutes and the existing 40-record limit remains unchanged (RPC clamps 1–50).
2. Only an actual official public job-detail fetch updates `last_verified_at`. The picker stamps **`reverify_attempted_at` only**. An attempted or failed fetch must not masquerade as fresh verification.
3. Existing status, expiry, claim and consent/publication filters are unchanged.
4. Failed official HTTP requests preserve stored records and existing six-hour attempt cooldown; existing lease and backoff logic in the Edge Function stays unchanged.
5. No browser access to the `SECURITY DEFINER` RPC. The current production permission baseline, verified read-only, is `anon=false`, `authenticated=false`, `service_role=true`; `search_path` remains empty.
6. No change to cron, table/column DDL, identity joins, public feed, GSC, Cloudflare or other unrelated apps.

## Validation and deployment plan (NOT YET DONE)

- Run `supabase migration new hc_hellowork_reverify_urgent_priority_v2` from this repository in an environment with a working Supabase CLI. Copy the reviewed SQL into the file **created by that CLI**. Never rename/rewrite the old applied 2026-10-23 migration.
- Validate the new migration using PostgreSQL 17 in an isolated rollback-able transaction / throwaway database. Check the stored procedure signature, function security, role grants, table references, and syntax.
- Query the real candidate rows **read-only** to compare both orders (no RPC invocation, as the picker updates attempted timestamps). Confirm that 72h+ jobs rank in the first forty during the test snapshot and less urgent eligible jobs retain proportionate prefecture fairness.
- Validate disabled-publication behavior, invalid limit inputs, 6h cooldown, older priorities with duplicate timestamps, null prefectures and temporary upstream failures.
- Review the final SQL as an independent database/security change and ask the owner for **separate, explicit Production SQL application approval**. Do not merge/deploy this doc as if it were a migration.
- After an authorized deployment, record an actual 72-hour freshness time series, reverify picked/verified/errors, cron HTTP results, provider rate limits and rollback function. Consider the 60-hour margin if incoming volume changes.

## Current execution status

A read-only order simulation and actual Production ACL check passed. **Migration file generation, local PostgreSQL 17 execution, CI, production deployment and SLA outcome remain unverified.** The connected chat environment does not have the Supabase CLI binary; no downloader retry or billable CI was attempted. This proposed SQL is saved for a controlled CLI-created migration once an appropriate environment is available.
