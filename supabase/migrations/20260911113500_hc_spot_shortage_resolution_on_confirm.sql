do $migration$
declare
  v_oid oid;
  v_def text;
  v_original text;
  v_old text := $old$
  insert into public.hc_spot_assignments(
    organization_id,facility_id,application_id,job_id,spot_job_id,
    jobseeker_clerk_user_id,ho_staff_member_id,ho_shift_assignment_id,
    work_date,start_time,end_time,break_minutes,hourly_rate,status,confirmed_by
  ) values (
    v_app.organization_id,v_app.facility_id,v_app.id,v_job.id,v_spot.id,
    v_app.jobseeker_clerk_user_id,v_staff.id,v_shift.id,
    v_spot.work_date,v_spot.start_time,v_spot.end_time,v_shift.break_minutes,v_rate,'confirmed',v_actor
  ) returning * into v_assignment;

  update public.hc_applications a set status='hired',updated_at=now() where a.id=v_app.id;
$old$;
  v_new text := $new$
  insert into public.hc_spot_assignments(
    organization_id,facility_id,application_id,job_id,spot_job_id,
    jobseeker_clerk_user_id,ho_staff_member_id,ho_shift_assignment_id,
    work_date,start_time,end_time,break_minutes,hourly_rate,status,confirmed_by
  ) values (
    v_app.organization_id,v_app.facility_id,v_app.id,v_job.id,v_spot.id,
    v_app.jobseeker_clerk_user_id,v_staff.id,v_shift.id,
    v_spot.work_date,v_spot.start_time,v_spot.end_time,v_shift.break_minutes,v_rate,'confirmed',v_actor
  ) returning * into v_assignment;

  -- A confirmed HC spot worker is now a real HO shift assignment. Keep the
  -- originating shortage record consistent immediately instead of waiting for
  -- a later shortage recalculation pass.
  if v_spot.shift_shortage_id is not null then
    update public.ho_shift_shortages ss
       set assigned_staff = coalesce(ss.assigned_staff, ss.scheduled_staff_count, 0) + 1,
           scheduled_staff_count = coalesce(ss.scheduled_staff_count, ss.assigned_staff, 0) + 1,
           shortage_count = greatest(coalesce(ss.shortage_count, 0) - 1, 0),
           status = case when coalesce(ss.shortage_count, 0) <= 1 then 'resolved' else 'open' end,
           updated_at = now()
     where ss.id = v_spot.shift_shortage_id
       and ss.organization_id = v_app.organization_id
       and ss.facility_id = v_app.facility_id
       and ss.status = 'open';
  end if;

  update public.hc_applications a set status='hired',updated_at=now() where a.id=v_app.id;
$new$;
begin
  select p.oid into v_oid
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='ho_private' and p.proname='hc_confirm_spot_assignment_impl'
    and pg_get_function_identity_arguments(p.oid)='p_facility_id uuid, p_application_id uuid, p_break_minutes integer';
  if v_oid is null then raise exception 'hc_confirm_spot_assignment_impl not found'; end if;
  v_def := pg_get_functiondef(v_oid);
  v_original := v_def;
  v_def := replace(v_def, v_old, v_new);
  if v_def = v_original then raise exception 'expected spot assignment insert block not found'; end if;
  execute v_def;
end;
$migration$;
