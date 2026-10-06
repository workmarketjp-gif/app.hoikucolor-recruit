-- Compliance gate for republished external jobs.
-- Hello Work requires the republication site to visibly publish the operator's
-- business name, address, and telephone number. Keep ingestion running while
-- preventing candidate/public display until that disclosure is complete.

alter table public.hc_external_source_sync_control
  add column if not exists publication_enabled boolean not null default false;

update public.hc_external_source_sync_control
set publication_enabled = false,
    updated_at = now()
where source = 'hellowork';

create or replace view public.hc_external_job_public_feed
with (security_barrier = true)
as
select
  e.id,
  e.source,
  e.source_job_id,
  e.source_url,
  e.organization_name,
  e.facility_name,
  e.facility_type,
  e.prefecture,
  e.city,
  e.address,
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
  coalesce(e.source_published_at, e.fetched_at) as published_at,
  coalesce(e.closing_at, e.expires_at) as closing_at,
  e.last_verified_at,
  e.online_self_apply_allowed
from public.hc_external_job_sources e
where e.source_status = 'active'
  and e.public_republication_allowed = true
  and e.claimed_job_id is null
  and e.last_verified_at >= now() - interval '12 hours'
  and (e.expires_at is null or e.expires_at >= now())
  and (e.closing_at is null or e.closing_at >= now())
  and exists (
    select 1
    from public.hc_external_source_sync_control c
    where c.source = e.source
      and c.enabled = true
      and c.publication_enabled = true
  );

revoke all on public.hc_external_job_public_feed from public, anon;
grant select on public.hc_external_job_public_feed to authenticated, service_role;

comment on column public.hc_external_source_sync_control.publication_enabled is
  'Fail-closed public/candidate display gate. Enable only after source-specific republication disclosure requirements are satisfied.';
