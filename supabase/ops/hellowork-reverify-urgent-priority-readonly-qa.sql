-- READ-ONLY QA: never invoke the live reverify picker, which stamps attempted_at.
-- Compare existing proportional fairness ranking with a proposed 60-hour urgent-first ranking.
-- Run in the project read-only SQL console before migration review.
with candidates as materialized (
  select
    s.id,
    s.last_verified_at,
    row_number() over (
      partition by coalesce(s.prefecture, '')
      order by s.last_verified_at, s.id
    ) as regional_rank,
    count(*) over (partition by coalesce(s.prefecture, '')) as regional_total
  from public.hc_external_job_sources s
  where s.source = 'hellowork'
    and s.source_status = 'active'
    and s.public_republication_allowed
    and s.claimed_job_id is null
    and (s.closing_at is null or s.closing_at >= now())
    and (s.expires_at is null or s.expires_at >= now())
    and s.last_verified_at < now() - interval '24 hours'
    and (s.reverify_attempted_at is null or s.reverify_attempted_at < now() - interval '6 hours')
), ranked as (
  select
    last_verified_at,
    row_number() over (
      order by regional_rank::numeric / regional_total, id
    ) as existing_rank,
    row_number() over (
      order by
        case when last_verified_at < now() - interval '60 hours' then 0 else 1 end,
        case when last_verified_at < now() - interval '60 hours'
             then last_verified_at end asc nulls last,
        regional_rank::numeric / regional_total,
        id
    ) as proposed_rank
  from candidates
)
select
  now() as measured_at_utc,
  count(*) as eligible_24h,
  count(*) filter (where last_verified_at < now() - interval '60 hours') as older_60h,
  count(*) filter (where last_verified_at < now() - interval '72 hours') as older_72h,
  count(*) filter (
    where last_verified_at < now() - interval '72 hours' and existing_rank > 40
  ) as overdue_outside_existing_40,
  count(*) filter (
    where last_verified_at < now() - interval '72 hours' and proposed_rank <= 40
  ) as overdue_inside_proposed_40,
  max(existing_rank) filter (where last_verified_at < now() - interval '72 hours') as worst_overdue_existing_rank,
  max(proposed_rank) filter (where last_verified_at < now() - interval '72 hours') as worst_overdue_proposed_rank
from ranked;
