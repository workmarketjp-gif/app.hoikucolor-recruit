create schema if not exists hc_feed_private;
revoke all on schema hc_feed_private from public;
grant usage on schema hc_feed_private to anon, authenticated, service_role, bi_reader;

create table if not exists hc_feed_private.public_job_rows (
  id uuid primary key,
  facility_id uuid not null,
  facility_name text,
  facility_type text,
  prefecture text,
  city text,
  public_address text,
  jobseeker_address text,
  organization_name text,
  postal_code text,
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
  refreshed_at timestamptz not null default now()
);

alter table hc_feed_private.public_job_rows enable row level security;
revoke all on hc_feed_private.public_job_rows from public, anon, authenticated, service_role, bi_reader;
grant select on hc_feed_private.public_job_rows to anon, authenticated, service_role, bi_reader;

drop policy if exists hc_public_job_rows_select on hc_feed_private.public_job_rows;
create policy hc_public_job_rows_select
on hc_feed_private.public_job_rows
for select
to anon, authenticated, service_role, bi_reader
using (true);

create or replace function ho_private.hc_refresh_public_job_feed_row(p_job_id uuid)
returns void
language plpgsql
security definer
set search_path = public, hc_feed_private, ho_private, pg_temp
as $$
begin
  delete from hc_feed_private.public_job_rows where id = p_job_id;

  insert into hc_feed_private.public_job_rows (
    id, facility_id, facility_name, facility_type, prefecture, city,
    public_address, jobseeker_address, organization_name, postal_code,
    title, description, employment_type, salary_type, salary_min, salary_max,
    salary_note, working_hours, holidays, required_qualification, benefits,
    number_of_positions, published_at, closing_at, spot_break_minutes, refreshed_at
  )
  select
    j.id,
    j.facility_id,
    f.name,
    f.facility_type,
    f.prefecture,
    f.city,
    f.address,
    coalesce(f.address_line, f.address),
    coalesce(nullif(trim(o.legal_name), ''), o.name),
    f.postal_code,
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
    j.spot_break_minutes,
    now()
  from public.hc_jobs j
  join public.ho_facilities f
    on f.id = j.facility_id
   and f.organization_id = j.organization_id
  join public.ho_organizations o
    on o.id = j.organization_id
  where j.id = p_job_id
    and j.status = 'published'
    and j.published_at is not null
    and f.status = 'active'
    and o.status = 'active';
end;
$$;
revoke all on function ho_private.hc_refresh_public_job_feed_row(uuid) from public, anon, authenticated, service_role, bi_reader;

create or replace function ho_private.hc_public_job_feed_job_trigger()
returns trigger
language plpgsql
security definer
set search_path = public, hc_feed_private, ho_private, pg_temp
as $$
begin
  perform ho_private.hc_refresh_public_job_feed_row(coalesce(new.id, old.id));
  return coalesce(new, old);
end;
$$;
revoke all on function ho_private.hc_public_job_feed_job_trigger() from public, anon, authenticated, service_role, bi_reader;

drop trigger if exists hc_refresh_public_job_feed_on_job on public.hc_jobs;
create trigger hc_refresh_public_job_feed_on_job
after insert or update or delete on public.hc_jobs
for each row execute function ho_private.hc_public_job_feed_job_trigger();

create or replace function ho_private.hc_public_job_feed_facility_trigger()
returns trigger
language plpgsql
security definer
set search_path = public, hc_feed_private, ho_private, pg_temp
as $$
declare
  v_job record;
begin
  for v_job in select id from public.hc_jobs where facility_id = coalesce(new.id, old.id)
  loop
    perform ho_private.hc_refresh_public_job_feed_row(v_job.id);
  end loop;
  return coalesce(new, old);
end;
$$;
revoke all on function ho_private.hc_public_job_feed_facility_trigger() from public, anon, authenticated, service_role, bi_reader;

drop trigger if exists hc_refresh_public_job_feed_on_facility on public.ho_facilities;
create trigger hc_refresh_public_job_feed_on_facility
after update of name, facility_type, prefecture, city, address, address_line, postal_code, status on public.ho_facilities
for each row execute function ho_private.hc_public_job_feed_facility_trigger();

create or replace function ho_private.hc_public_job_feed_org_trigger()
returns trigger
language plpgsql
security definer
set search_path = public, hc_feed_private, ho_private, pg_temp
as $$
declare
  v_job record;
begin
  for v_job in select id from public.hc_jobs where organization_id = coalesce(new.id, old.id)
  loop
    perform ho_private.hc_refresh_public_job_feed_row(v_job.id);
  end loop;
  return coalesce(new, old);
end;
$$;
revoke all on function ho_private.hc_public_job_feed_org_trigger() from public, anon, authenticated, service_role, bi_reader;

drop trigger if exists hc_refresh_public_job_feed_on_org on public.ho_organizations;
create trigger hc_refresh_public_job_feed_on_org
after update of name, legal_name, status on public.ho_organizations
for each row execute function ho_private.hc_public_job_feed_org_trigger();

select ho_private.hc_refresh_public_job_feed_row(id) from public.hc_jobs;

create or replace view public.hc_public_job_feed
with (security_invoker = true)
as
select
  r.id,
  r.facility_type,
  r.prefecture,
  r.city,
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
  r.facility_name,
  r.organization_name,
  r.postal_code,
  r.public_address as address,
  r.facility_id,
  r.spot_break_minutes
from hc_feed_private.public_job_rows r
where r.closing_at is null or r.closing_at >= now();

create or replace view public.hc_jobseeker_job_feed
with (security_invoker = true)
as
select
  r.id,
  r.facility_id,
  r.facility_name,
  r.facility_type,
  r.prefecture,
  r.city,
  r.jobseeker_address as address,
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
  r.spot_break_minutes
from hc_feed_private.public_job_rows r
where r.closing_at is null or r.closing_at >= now();

revoke all on public.hc_public_job_feed from public;
grant select on public.hc_public_job_feed to anon, authenticated, service_role, bi_reader;
revoke all on public.hc_jobseeker_job_feed from public, anon;
grant select on public.hc_jobseeker_job_feed to authenticated, service_role, bi_reader;
