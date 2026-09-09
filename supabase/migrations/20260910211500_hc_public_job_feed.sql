create or replace view public.hc_public_job_feed
with (security_barrier = true)
as
select
  j.id,
  f.facility_type,
  f.prefecture,
  f.city,
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
  j.closing_at
from public.hc_jobs j
join public.ho_facilities f
  on f.id = j.facility_id
 and f.organization_id = j.organization_id
where j.status = 'published'
  and f.status = 'active'
  and (j.closing_at is null or j.closing_at >= now());

revoke all on public.hc_public_job_feed from public;
grant select on public.hc_public_job_feed to anon, authenticated;
