-- Public Hoiku Color job feed v2.
-- Unifies canonical HC jobs with fresh, republication-safe external public jobs
-- for the public Hoiku Color frontend (hoikucolor-lp).
--
-- Source attribution is metadata for the detail page only; the list can render
-- every row as a normal Hoiku Color job card.

create or replace view public.hc_public_job_feed_v2
with (security_barrier = true)
as
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
  'hoiku_color'::text as source_kind,
  null::text as source_name,
  null::text as source_job_id,
  null::text as source_url,
  null::timestamptz as source_last_verified_at,
  false as is_external,
  true as can_apply_direct
from public.hc_public_job_feed j

union all

select
  e.id,
  e.facility_type,
  e.prefecture,
  e.city,
  e.title,
  e.description,
  e.employment_type,
  e.salary_type,
  e.salary_min,
  e.salary_max,
  e.salary_note,
  e.working_hours,
  e.holidays,
  e.required_qualification,
  e.benefits,
  e.number_of_positions,
  e.published_at,
  e.closing_at,
  e.facility_name,
  e.organization_name,
  null::text as postal_code,
  e.address,
  null::uuid as facility_id,
  e.source as source_kind,
  case when e.source = 'hellowork' then 'ハローワーク' else e.source end as source_name,
  e.source_job_id,
  e.source_url,
  e.last_verified_at as source_last_verified_at,
  true as is_external,
  false as can_apply_direct
from public.hc_external_job_public_feed e;

revoke all on public.hc_public_job_feed_v2 from public;
grant select on public.hc_public_job_feed_v2 to anon, authenticated, service_role;

comment on view public.hc_public_job_feed_v2 is
  'Public HC job feed for hoikucolor-lp. Canonical and fresh republication-safe external jobs share one public read model; raw source payload is never exposed.';
