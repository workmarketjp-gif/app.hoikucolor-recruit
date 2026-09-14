-- Candidate-side spot-work lifecycle notifications.
-- Facility-side app.hoikupoppy.ai implementation remains unchanged.

alter table public.hc_notifications
  drop constraint if exists hc_notifications_notification_type_check;

alter table public.hc_notifications
  add constraint hc_notifications_notification_type_check
  check (notification_type in (
    'application_created','application_status_changed','interview_scheduled','interview_cancelled',
    'application_hired','message_received','visit_confirmed','visit_declined','visit_cancelled',
    'visit_completed','visit_no_show','spot_confirmed','spot_cancelled','spot_completed','spot_no_show',
    'scout_received'
  ));

create or replace function ho_private.hc_spot_assignment_jobseeker_notification_trigger()
returns trigger
language plpgsql
security definer
set search_path = public, ho_private, pg_temp
as $$
declare
  v_facility_name text;
  v_type text;
  v_title text;
  v_body text;
begin
  if tg_op = 'UPDATE' and old.status is not distinct from new.status then
    return new;
  end if;

  if new.status not in ('confirmed','cancelled','completed','no_show') then
    return new;
  end if;

  select f.name
    into v_facility_name
  from public.ho_facilities f
  where f.id = new.facility_id
    and f.organization_id = new.organization_id;

  v_type := case new.status
    when 'confirmed' then 'spot_confirmed'
    when 'cancelled' then 'spot_cancelled'
    when 'completed' then 'spot_completed'
    else 'spot_no_show'
  end;

  v_title := case new.status
    when 'confirmed' then 'スポット勤務が確定しました'
    when 'cancelled' then 'スポット勤務がキャンセルされました'
    when 'completed' then 'スポット勤務が完了しました'
    else 'スポット勤務が未勤務として記録されました'
  end;

  v_body := coalesce(v_facility_name, '園') || '／' ||
    to_char(new.work_date, 'YYYY年MM月DD日') || ' ' ||
    to_char(new.start_time, 'HH24:MI') || '〜' ||
    to_char(new.end_time, 'HH24:MI');

  perform ho_private.hc_notify_jobseeker(
    new.organization_id,
    new.facility_id,
    new.application_id,
    new.jobseeker_clerk_user_id,
    v_type,
    v_title,
    v_body,
    '/spot-jobs?assignment_id=' || new.id::text || '#spot-assignment-' || new.id::text,
    'jobseeker:spot:' || new.id::text || ':' || new.status
  );

  return new;
end;
$$;

revoke all on function ho_private.hc_spot_assignment_jobseeker_notification_trigger() from public, anon, authenticated;

drop trigger if exists hc_spot_assignments_notify_jobseeker on public.hc_spot_assignments;
create trigger hc_spot_assignments_notify_jobseeker
after insert or update of status on public.hc_spot_assignments
for each row execute function ho_private.hc_spot_assignment_jobseeker_notification_trigger();
