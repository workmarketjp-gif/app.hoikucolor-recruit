alter table public.ho_spot_job_drafts
  add column if not exists break_minutes integer not null default 0;

alter table public.ho_spot_job_drafts
  drop constraint if exists ho_spot_job_drafts_break_minutes_check;

alter table public.ho_spot_job_drafts
  add constraint ho_spot_job_drafts_break_minutes_check
  check (break_minutes between 0 and 480);

alter table public.hc_jobs
  add column if not exists spot_break_minutes integer;

alter table public.hc_jobs
  drop constraint if exists hc_jobs_spot_break_minutes_check;

alter table public.hc_jobs
  add constraint hc_jobs_spot_break_minutes_check
  check (spot_break_minutes is null or spot_break_minutes between 0 and 480);

create or replace function hc_private.hc_sync_spot_break_minutes()
returns trigger
language plpgsql
security definer
set search_path = public, hc_private, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    return old;
  end if;

  update public.hc_jobs
     set spot_break_minutes = new.break_minutes,
         updated_at = greatest(coalesce(updated_at, now()), now())
   where source_type = 'spot_job'
     and source_id = new.id;

  return new;
end;
$$;

revoke all on function hc_private.hc_sync_spot_break_minutes() from public, anon, authenticated;

drop trigger if exists zz_hc_sync_spot_break_minutes on public.ho_spot_job_drafts;
create trigger zz_hc_sync_spot_break_minutes
after insert or update of break_minutes, status, work_date, start_time, end_time
on public.ho_spot_job_drafts
for each row execute function hc_private.hc_sync_spot_break_minutes();

update public.hc_jobs j
   set spot_break_minutes = d.break_minutes
  from public.ho_spot_job_drafts d
 where j.source_type = 'spot_job'
   and j.source_id = d.id
   and j.spot_break_minutes is distinct from d.break_minutes;

create or replace function hc_private.hc_enforce_spot_assignment_break_minutes()
returns trigger
language plpgsql
security definer
set search_path = public, hc_private, pg_temp
as $$
declare
  v_break integer;
begin
  select d.break_minutes
    into v_break
    from public.ho_spot_job_drafts d
   where d.id = new.spot_job_id;

  if not found then
    raise exception 'Spot job not found';
  end if;

  if new.break_minutes is distinct from v_break then
    raise exception 'Break minutes must match the Hoiku Office spot job (% minutes)', v_break;
  end if;

  return new;
end;
$$;

revoke all on function hc_private.hc_enforce_spot_assignment_break_minutes() from public, anon, authenticated;

drop trigger if exists hc_spot_assignments_enforce_break_minutes on public.hc_spot_assignments;
create trigger hc_spot_assignments_enforce_break_minutes
before insert or update of spot_job_id, break_minutes
on public.hc_spot_assignments
for each row execute function hc_private.hc_enforce_spot_assignment_break_minutes();

create or replace function public.hc_set_spot_job_break_minutes(
  p_spot_job_id uuid,
  p_break_minutes integer
)
returns integer
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_job public.ho_spot_job_drafts%rowtype;
  v_shift_minutes integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if p_break_minutes is null or p_break_minutes < 0 or p_break_minutes > 480 then
    raise exception 'Break minutes must be between 0 and 480';
  end if;

  select *
    into v_job
    from public.ho_spot_job_drafts
   where id = p_spot_job_id
   for update;

  if not found then
    raise exception 'Spot job not found';
  end if;

  if not public.recruitment_can_write(v_job.facility_id) then
    raise exception 'Permission denied';
  end if;

  if v_job.status in ('closed', 'filled', 'cancelled') then
    raise exception 'Closed spot jobs cannot be edited';
  end if;

  if v_job.start_time is not null and v_job.end_time is not null then
    if v_job.end_time <= v_job.start_time then
      raise exception 'Spot job end time must be later than start time';
    end if;

    v_shift_minutes := floor(extract(epoch from (v_job.end_time - v_job.start_time)) / 60)::integer;
    if p_break_minutes >= v_shift_minutes then
      raise exception 'Break minutes must be shorter than the shift';
    end if;
  end if;

  update public.ho_spot_job_drafts
     set break_minutes = p_break_minutes,
         updated_at = now()
   where id = p_spot_job_id;

  return p_break_minutes;
end;
$$;

revoke all on function public.hc_set_spot_job_break_minutes(uuid, integer) from public, anon;
grant execute on function public.hc_set_spot_job_break_minutes(uuid, integer) to authenticated;

create or replace view public.hc_public_job_feed as
select j.id,
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
       j.closing_at,
       f.name as facility_name,
       coalesce(nullif(trim(o.legal_name), ''), o.name) as organization_name,
       f.postal_code,
       f.address,
       j.facility_id,
       j.spot_break_minutes
  from public.hc_jobs j
  join public.ho_facilities f on f.id = j.facility_id and f.organization_id = j.organization_id
  join public.ho_organizations o on o.id = j.organization_id
 where j.status = 'published'
   and f.status = 'active'
   and o.status = 'active'
   and j.published_at is not null
   and (j.closing_at is null or j.closing_at >= now());

create or replace view public.hc_jobseeker_job_feed as
select j.id,
       j.facility_id,
       f.name as facility_name,
       f.facility_type,
       f.prefecture,
       f.city,
       coalesce(f.address_line, f.address) as address,
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
       j.spot_break_minutes
  from public.hc_jobs j
  join public.ho_facilities f on f.id = j.facility_id
 where j.status = 'published'
   and f.status = 'active'
   and (j.closing_at is null or j.closing_at >= now());

create or replace function ho_private.hc_confirm_spot_assignment_canonical(
  p_facility_id uuid,
  p_application_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, ho_private, pg_temp
as $$
declare
  v_break_minutes integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not public.recruitment_can_write(p_facility_id) then
    raise exception 'Permission denied';
  end if;

  select d.break_minutes
    into v_break_minutes
    from public.hc_applications a
    join public.hc_jobs j
      on j.id = a.job_id
     and j.facility_id = a.facility_id
     and j.organization_id = a.organization_id
    join public.ho_spot_job_drafts d
      on d.id = j.source_id
     and d.facility_id = j.facility_id
   where a.id = p_application_id
     and a.facility_id = p_facility_id
     and j.source_type = 'spot_job';

  if not found then
    raise exception 'Spot job source not found for application';
  end if;

  return ho_private.hc_confirm_spot_assignment_impl(
    p_facility_id,
    p_application_id,
    coalesce(v_break_minutes, 0)
  );
end;
$$;

revoke all on function ho_private.hc_confirm_spot_assignment_canonical(uuid, uuid) from public, anon, authenticated;

create or replace function public.hc_confirm_spot_assignment(
  p_facility_id uuid,
  p_application_id uuid,
  p_break_minutes integer default 0
)
returns jsonb
language sql
security invoker
set search_path = public, ho_private, pg_temp
as $$
  -- p_break_minutes is retained only for backwards-compatible clients.
  -- The canonical break is always read from Hoiku Office's spot job by the private implementation.
  select ho_private.hc_confirm_spot_assignment_canonical(p_facility_id, p_application_id);
$$;

revoke all on function public.hc_confirm_spot_assignment(uuid, uuid, integer) from public, anon;
grant execute on function public.hc_confirm_spot_assignment(uuid, uuid, integer) to authenticated;
