-- Hoiku Color spot application -> Hoiku Office temporary staff + shift handoff.
-- Production-safe design:
-- * canonical assignment table supports required_count > 1
-- * spot applications remain separate from permanent-hire hired_staff_id integrity
-- * only users who have BOTH HC recruitment access and HO shift-write access may confirm
-- * shift writes reuse Hoiku Office's atomic shift persistence path

create table if not exists public.hc_spot_assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.ho_organizations(id) on delete cascade,
  facility_id uuid not null,
  application_id uuid not null unique references public.hc_applications(id) on delete cascade,
  job_id uuid not null references public.hc_jobs(id) on delete restrict,
  spot_job_id uuid not null references public.ho_spot_job_drafts(id) on delete restrict,
  jobseeker_clerk_user_id text not null,
  ho_staff_member_id uuid not null references public.ho_staff_members(id) on delete restrict,
  ho_shift_assignment_id uuid not null unique references public.ho_shift_assignments(id) on delete restrict,
  work_date date not null,
  start_time time without time zone not null,
  end_time time without time zone not null,
  break_minutes integer not null default 0,
  hourly_rate numeric(10,2) not null,
  status text not null default 'confirmed',
  confirmed_by text not null,
  confirmed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint hc_spot_assignments_facility_org_fk foreign key (facility_id, organization_id)
    references public.ho_facilities(id, organization_id) on delete cascade,
  constraint hc_spot_assignments_time_check check (end_time > start_time),
  constraint hc_spot_assignments_break_check check (break_minutes >= 0),
  constraint hc_spot_assignments_rate_check check (hourly_rate > 0),
  constraint hc_spot_assignments_status_check check (status in ('confirmed','cancelled','completed','no_show'))
);

comment on table public.hc_spot_assignments is
  'Canonical HC spot-work handoff records. Supports multiple workers per HO spot job.';

create index if not exists hc_spot_assignments_spot_job_idx
  on public.hc_spot_assignments (spot_job_id, status);
create index if not exists hc_spot_assignments_jobseeker_facility_idx
  on public.hc_spot_assignments (jobseeker_clerk_user_id, facility_id, confirmed_at desc);

alter table public.hc_spot_assignments enable row level security;

revoke all on table public.hc_spot_assignments from anon;
revoke all on table public.hc_spot_assignments from authenticated;
grant select on table public.hc_spot_assignments to authenticated;

drop policy if exists hc_spot_assignments_facility_select on public.hc_spot_assignments;
create policy hc_spot_assignments_facility_select
  on public.hc_spot_assignments
  for select to authenticated
  using (ho_private.recruitment_can_read(facility_id));

drop policy if exists hc_spot_assignments_jobseeker_select_own on public.hc_spot_assignments;
create policy hc_spot_assignments_jobseeker_select_own
  on public.hc_spot_assignments
  for select to authenticated
  using (jobseeker_clerk_user_id = (auth.jwt() ->> 'sub'));

drop policy if exists hc_spot_assignments_facility_insert on public.hc_spot_assignments;
drop policy if exists hc_spot_assignments_readonly_guard on public.hc_spot_assignments;

create or replace function public.hc_confirm_spot_assignment(
  p_facility_id uuid,
  p_application_id uuid,
  p_break_minutes integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public, ho_private, pg_temp
as $function$
declare
  v_actor text := ho_private.current_clerk_user_id();
  v_app public.hc_applications%rowtype;
  v_job public.hc_jobs%rowtype;
  v_spot public.ho_spot_job_drafts%rowtype;
  v_existing public.hc_spot_assignments%rowtype;
  v_staff public.ho_staff_members%rowtype;
  v_shift public.ho_shift_assignments%rowtype;
  v_assignment public.hc_spot_assignments%rowtype;
  v_shift_result jsonb;
  v_confirmed_count integer := 0;
  v_shift_minutes integer;
  v_shortage_role text;
  v_staff_code text;
  v_filled boolean := false;
  v_rate numeric(10,2);
begin
  if v_actor is null or btrim(v_actor) = '' then
    raise exception using errcode='42501',message='AUTH_REQUIRED';
  end if;
  if not ho_private.recruitment_can_write(p_facility_id) then
    raise exception using errcode='42501',message='RECRUITMENT_FORBIDDEN';
  end if;
  -- Recruitment/marketing-only access is deliberately insufficient to alter Office rosters.
  if not ho_private.current_user_can_write() then
    raise exception using errcode='42501',message='OFFICE_SHIFT_WRITE_FORBIDDEN';
  end if;
  if p_break_minutes is null or p_break_minutes < 0 then
    raise exception using errcode='22023',message='BREAK_MINUTES_INVALID';
  end if;

  select * into v_app
  from public.hc_applications a
  where a.id=p_application_id and a.facility_id=p_facility_id
  for update;
  if v_app.id is null then raise exception using errcode='P0002',message='APPLICATION_NOT_FOUND'; end if;
  if v_app.organization_id <> ho_private.current_user_organization_id()
     or not ho_private.has_facility_access(v_app.facility_id) then
    raise exception using errcode='42501',message='SPOT_APPLICATION_TENANT_FORBIDDEN';
  end if;
  if v_app.jobseeker_clerk_user_id is null or btrim(v_app.jobseeker_clerk_user_id)='' then
    raise exception using errcode='23514',message='SPOT_APPLICATION_REQUIRES_JOBSEEKER_IDENTITY';
  end if;

  select * into v_existing
  from public.hc_spot_assignments x
  where x.application_id=v_app.id;
  if v_existing.id is not null then
    return jsonb_build_object(
      'spotAssignment',to_jsonb(v_existing),
      'alreadyConfirmed',true,
      'filled',exists(select 1 from public.ho_spot_job_drafts s where s.id=v_existing.spot_job_id and s.status='closed')
    );
  end if;

  if v_app.status in ('rejected','withdrawn','hired') then
    raise exception using errcode='23514',message='SPOT_APPLICATION_NOT_CONFIRMABLE';
  end if;

  select * into v_job
  from public.hc_jobs j
  where j.id=v_app.job_id and j.organization_id=v_app.organization_id and j.facility_id=v_app.facility_id
  for update;
  if v_job.id is null then raise exception using errcode='23514',message='APPLICATION_JOB_TENANT_MISMATCH'; end if;
  if v_job.source_type<>'spot_job' or v_job.source_id is null then
    raise exception using errcode='22023',message='NOT_A_SPOT_JOB';
  end if;

  select * into v_spot
  from public.ho_spot_job_drafts s
  where s.id=v_job.source_id and s.organization_id=v_app.organization_id and s.facility_id=v_app.facility_id
  for update;
  if v_spot.id is null then raise exception using errcode='23514',message='SPOT_JOB_SOURCE_MISMATCH'; end if;

  v_rate:=coalesce(v_spot.hourly_wage,v_spot.hourly_rate)::numeric(10,2);
  if v_spot.status<>'published' or v_job.status<>'published' then
    raise exception using errcode='23514',message='SPOT_JOB_NOT_PUBLISHED';
  end if;
  if v_spot.work_date is null or v_spot.start_time is null or v_spot.end_time is null
     or v_spot.end_time<=v_spot.start_time or coalesce(v_rate,0)<=0 then
    raise exception using errcode='23514',message='SPOT_JOB_SCHEDULE_INVALID';
  end if;

  v_shift_minutes:=floor(extract(epoch from (v_spot.end_time-v_spot.start_time))/60)::integer;
  if p_break_minutes>=v_shift_minutes then
    raise exception using errcode='22023',message='BREAK_MINUTES_TOO_LARGE';
  end if;

  select count(*)::integer into v_confirmed_count
  from public.hc_spot_assignments x
  where x.spot_job_id=v_spot.id and x.status in ('confirmed','completed');
  if v_confirmed_count>=v_spot.required_count then
    raise exception using errcode='23514',message='SPOT_JOB_CAPACITY_FILLED';
  end if;

  -- Reuse an Office staff record from an earlier spot shift for this HC identity.
  select s.* into v_staff
  from public.hc_spot_assignments x
  join public.ho_staff_members s on s.id=x.ho_staff_member_id
  where x.organization_id=v_app.organization_id
    and x.facility_id=v_app.facility_id
    and x.jobseeker_clerk_user_id=v_app.jobseeker_clerk_user_id
    and s.organization_id=v_app.organization_id
    and s.facility_id=v_app.facility_id
    and s.status='active'
  order by x.confirmed_at desc
  limit 1;

  -- Or reuse a permanent Office staff record previously linked by the standard HC hire flow.
  if v_staff.id is null then
    select s.* into v_staff
    from public.hc_applications a2
    join public.ho_staff_members s on s.id=a2.hired_staff_id
    where a2.organization_id=v_app.organization_id
      and a2.facility_id=v_app.facility_id
      and a2.jobseeker_clerk_user_id=v_app.jobseeker_clerk_user_id
      and a2.hired_staff_id is not null
      and s.organization_id=v_app.organization_id
      and s.facility_id=v_app.facility_id
      and s.status='active'
    order by a2.updated_at desc
    limit 1;
  end if;

  if v_staff.id is null then
    v_staff_code:='HC-SP-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));
    insert into public.ho_staff_members(
      organization_id,facility_id,staff_code,full_name,full_name_kana,kana,
      employment_type,full_time_or_part_time,position_title,job_title,
      qualification,hire_date,status,is_licensed_nursery_teacher,
      invitation_email,invitation_status,memo
    ) values (
      v_app.organization_id,v_app.facility_id,v_staff_code,v_app.applicant_name,
      v_app.applicant_name_kana,v_app.applicant_name_kana,
      'temporary','非常勤','スポット保育士','スポット保育士',
      v_app.qualifications,v_spot.work_date,'active',
      position('保育士' in coalesce(v_app.qualifications,''))>0,
      v_app.email,'not_invited','Hoiku Colorスポット勤務から一時職員登録'
    ) returning * into v_staff;
  end if;

  -- Office's atomic cell writer replaces a whole staff/day cell. Never overwrite an existing day assignment.
  if exists (
    select 1 from public.ho_shift_assignments sa
    where sa.organization_id=v_app.organization_id
      and sa.facility_id=v_app.facility_id
      and sa.staff_id=v_staff.id
      and sa.work_date=v_spot.work_date
      and sa.status<>'cancelled'
  ) then
    raise exception using errcode='23514',message='SPOT_WORKER_SHIFT_CONFLICT';
  end if;

  if v_spot.shift_shortage_id is not null then
    select ss.role_type into v_shortage_role
    from public.ho_shift_shortages ss
    where ss.id=v_spot.shift_shortage_id
      and ss.organization_id=v_app.organization_id
      and ss.facility_id=v_app.facility_id;
  end if;

  -- Preserve Office workflow revisions, day resolutions and minimum-break enforcement.
  v_shift_result:=public.ho_upsert_shift_cell_atomic(
    p_facility_id,
    jsonb_build_object(
      'staff_id',v_staff.id,
      'work_date',v_spot.work_date,
      'start_time',v_spot.start_time,
      'end_time',v_spot.end_time,
      'break_minutes',p_break_minutes,
      'assignment_role',coalesce(nullif(v_shortage_role,''),'スポット'),
      'status','confirmed',
      'source','manual',
      'memo','Hoiku Colorスポット勤務確定 / application '||v_app.id::text
    )
  );

  select * into v_shift
  from public.ho_shift_assignments sa
  where sa.id=(v_shift_result->'assignment'->>'id')::uuid
    and sa.organization_id=v_app.organization_id
    and sa.facility_id=v_app.facility_id
    and sa.staff_id=v_staff.id;
  if v_shift.id is null then raise exception using errcode='P0002',message='SPOT_SHIFT_WRITE_FAILED'; end if;

  insert into public.hc_spot_assignments(
    organization_id,facility_id,application_id,job_id,spot_job_id,
    jobseeker_clerk_user_id,ho_staff_member_id,ho_shift_assignment_id,
    work_date,start_time,end_time,break_minutes,hourly_rate,status,confirmed_by
  ) values (
    v_app.organization_id,v_app.facility_id,v_app.id,v_job.id,v_spot.id,
    v_app.jobseeker_clerk_user_id,v_staff.id,v_shift.id,
    v_spot.work_date,v_spot.start_time,v_spot.end_time,
    v_shift.break_minutes,v_rate,'confirmed',v_actor
  ) returning * into v_assignment;

  -- Existing HC integrity intentionally forbids hired_staff_id for spot jobs.
  -- The canonical staff/shift link is hc_spot_assignments instead.
  update public.hc_applications a
  set status='hired',updated_at=now()
  where a.id=v_app.id;

  insert into public.hc_application_events(
    organization_id,facility_id,application_id,event_type,from_status,to_status,note,actor_clerk_user_id
  ) values (
    v_app.organization_id,v_app.facility_id,v_app.id,'spot_work_confirmed',v_app.status,'hired',
    'Hoiku Officeシフトへ配置: '||v_shift.id::text||' / 一時職員: '||v_staff.id::text,
    v_actor
  );

  v_confirmed_count:=v_confirmed_count+1;
  v_filled:=v_confirmed_count>=v_spot.required_count;
  if v_filled then
    update public.ho_spot_job_drafts s
    set status='closed',updated_at=now()
    where s.id=v_spot.id;
  end if;

  return jsonb_build_object(
    'spotAssignment',to_jsonb(v_assignment),
    'application',(select to_jsonb(a) from public.hc_applications a where a.id=v_app.id),
    'staff',to_jsonb(v_staff),
    'shiftAssignment',to_jsonb(v_shift),
    'alreadyConfirmed',false,
    'filled',v_filled,
    'confirmedCount',v_confirmed_count,
    'requiredCount',v_spot.required_count
  );
end;
$function$;

revoke all on function public.hc_confirm_spot_assignment(uuid,uuid,integer) from public;
revoke all on function public.hc_confirm_spot_assignment(uuid,uuid,integer) from anon;
grant execute on function public.hc_confirm_spot_assignment(uuid,uuid,integer) to authenticated;
