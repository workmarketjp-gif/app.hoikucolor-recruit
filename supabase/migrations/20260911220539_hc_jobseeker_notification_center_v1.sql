-- Mirror of the production migration applied to Hoiku Poppy AI on 2026-09-12 NZ time.
-- Adds an explicit jobseeker notification audience, recipient-only read paths,
-- idempotent event keys, and candidate-facing workflow notification triggers.

alter table public.hc_notifications
  add column if not exists audience text not null default 'facility',
  add column if not exists event_key text;

alter table public.hc_notifications
  drop constraint if exists hc_notifications_audience_check,
  add constraint hc_notifications_audience_check
    check (audience in ('facility','jobseeker'));

alter table public.hc_notifications
  drop constraint if exists hc_notifications_notification_type_check,
  add constraint hc_notifications_notification_type_check
    check (notification_type in (
      'application_created','application_status_changed','interview_scheduled','interview_cancelled',
      'application_hired','message_received','visit_confirmed','visit_declined','visit_cancelled',
      'visit_completed','visit_no_show','spot_confirmed'
    ));

create unique index if not exists hc_notifications_event_key_uidx
  on public.hc_notifications(event_key)
  where event_key is not null;

create index if not exists hc_notifications_recipient_unread_idx
  on public.hc_notifications(recipient_clerk_user_id, created_at desc)
  where read_at is null;

create or replace function ho_private.hc_notify_jobseeker(
  p_organization_id uuid,
  p_facility_id uuid,
  p_application_id uuid,
  p_recipient_clerk_user_id text,
  p_type text,
  p_title text,
  p_body text,
  p_link_url text,
  p_event_key text
)
returns void
language plpgsql
security definer
set search_path to 'public','ho_private','pg_temp'
as $$
declare v_recipient text := nullif(trim(coalesce(p_recipient_clerk_user_id,'')), '');
begin
  if v_recipient is null then return; end if;

  if p_application_id is not null and not exists (
    select 1
    from public.hc_applications a
    where a.id = p_application_id
      and a.organization_id = p_organization_id
      and a.facility_id = p_facility_id
      and a.jobseeker_clerk_user_id = v_recipient
  ) then
    raise exception using errcode='42501', message='JOBSEEKER_NOTIFICATION_RECIPIENT_MISMATCH';
  end if;

  insert into public.hc_notifications (
    organization_id, facility_id, recipient_clerk_user_id, application_id,
    notification_type, title, body, link_url, audience, event_key
  ) values (
    p_organization_id, p_facility_id, v_recipient, p_application_id,
    p_type, left(p_title,200), left(p_body,2000), coalesce(nullif(p_link_url,''),'/applications'),
    'jobseeker', nullif(trim(coalesce(p_event_key,'')),'')
  )
  on conflict (event_key) where event_key is not null do nothing;
end;
$$;

create or replace function ho_private.hc_mark_notification_read_impl(p_notification_id uuid)
returns boolean
language plpgsql
security definer
set search_path to 'public','ho_private','pg_temp'
as $$
begin
  update public.hc_notifications n
  set read_at = coalesce(n.read_at, now())
  where n.id = p_notification_id
    and n.recipient_clerk_user_id = ho_private.current_clerk_user_id()
    and (n.audience = 'jobseeker' or ho_private.recruitment_can_read(n.facility_id));
  return found;
end;
$$;

create or replace function ho_private.hc_mark_all_notifications_read_impl()
returns integer
language plpgsql
security definer
set search_path to 'public','ho_private','pg_temp'
as $$
declare v_count integer;
begin
  update public.hc_notifications n
  set read_at = now()
  where n.read_at is null
    and n.recipient_clerk_user_id = ho_private.current_clerk_user_id()
    and (n.audience = 'jobseeker' or ho_private.recruitment_can_read(n.facility_id));
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.hc_mark_notification_read(p_notification_id uuid)
returns boolean
language sql
set search_path to 'public','ho_private','pg_temp'
as $$ select ho_private.hc_mark_notification_read_impl(p_notification_id); $$;

create or replace function public.hc_mark_all_notifications_read()
returns integer
language sql
set search_path to 'public','ho_private','pg_temp'
as $$ select ho_private.hc_mark_all_notifications_read_impl(); $$;

revoke all on function ho_private.hc_notify_jobseeker(uuid,uuid,uuid,text,text,text,text,text,text) from public, anon, authenticated;
revoke all on function ho_private.hc_mark_notification_read_impl(uuid) from public, anon;
revoke all on function ho_private.hc_mark_all_notifications_read_impl() from public, anon;
grant execute on function ho_private.hc_mark_notification_read_impl(uuid) to authenticated;
grant execute on function ho_private.hc_mark_all_notifications_read_impl() to authenticated;

revoke all on function public.hc_mark_notification_read(uuid) from public, anon;
revoke all on function public.hc_mark_all_notifications_read() from public, anon;
grant execute on function public.hc_mark_notification_read(uuid) to authenticated;
grant execute on function public.hc_mark_all_notifications_read() to authenticated;

revoke insert, update, delete on public.hc_notifications from authenticated;
grant select on public.hc_notifications to authenticated;

drop policy if exists hc_notifications_select_own on public.hc_notifications;
create policy hc_notifications_select_own
on public.hc_notifications for select to authenticated
using (
  recipient_clerk_user_id = ho_private.current_clerk_user_id()
  and (audience = 'jobseeker' or ho_private.recruitment_can_read(facility_id))
);

create or replace function ho_private.hc_application_jobseeker_notification_trigger()
returns trigger
language plpgsql
security definer
set search_path to 'public','ho_private','pg_temp'
as $$
declare v_facility_name text; v_status_label text; v_type text;
begin
  if new.jobseeker_clerk_user_id is null or old.status is not distinct from new.status then return new; end if;
  if new.status not in ('reviewing','offered','hired','rejected') then return new; end if;
  select f.name into v_facility_name from public.ho_facilities f where f.id=new.facility_id and f.organization_id=new.organization_id;
  v_status_label := case new.status when 'reviewing' then '書類確認中' when 'offered' then '内定' when 'hired' then '採用' when 'rejected' then '選考終了' else new.status end;
  v_type := case when new.status='hired' then 'application_hired' else 'application_status_changed' end;
  perform ho_private.hc_notify_jobseeker(
    new.organization_id,new.facility_id,new.id,new.jobseeker_clerk_user_id,v_type,
    case when new.status='offered' then '内定のお知らせ' when new.status='hired' then '採用が確定しました' else '選考状況が更新されました' end,
    coalesce(v_facility_name,'応募先の園') || '：' || v_status_label,
    '/applications','jobseeker:application:' || new.id::text || ':status:' || new.status
  );
  return new;
end;
$$;

create or replace function ho_private.hc_interview_jobseeker_notification_trigger()
returns trigger
language plpgsql
security definer
set search_path to 'public','ho_private','pg_temp'
as $$
declare
  v_app public.hc_applications%rowtype; v_facility_name text; v_when text; v_type text; v_title text; v_event_key text;
begin
  select * into v_app from public.hc_applications a
  where a.id=new.application_id and a.organization_id=new.organization_id and a.facility_id=new.facility_id;
  if v_app.id is null or v_app.jobseeker_clerk_user_id is null then return new; end if;
  if tg_op='UPDATE' and old.scheduled_at is not distinct from new.scheduled_at and old.status is not distinct from new.status
    and old.location is not distinct from new.location and old.meeting_url is not distinct from new.meeting_url then return new; end if;
  select f.name into v_facility_name from public.ho_facilities f where f.id=new.facility_id;
  v_when := to_char(new.scheduled_at at time zone 'Asia/Tokyo','YYYY年MM月DD日 HH24:MI');
  if new.status='cancelled' then v_type:='interview_cancelled'; v_title:='面接予定がキャンセルされました';
  else v_type:='interview_scheduled'; v_title:=case when tg_op='UPDATE' then '面接予定が更新されました' else '面接予定が決まりました' end; end if;
  v_event_key := 'jobseeker:interview:' || new.id::text || ':' || new.status || ':' || extract(epoch from new.updated_at)::bigint::text;
  perform ho_private.hc_notify_jobseeker(new.organization_id,new.facility_id,new.application_id,v_app.jobseeker_clerk_user_id,
    v_type,v_title,coalesce(v_facility_name,'応募先の園') || '／' || v_when || case when new.location is not null then '／' || new.location else '' end,
    '/applications',v_event_key);
  return new;
end;
$$;

create or replace function ho_private.hc_message_jobseeker_notification_trigger()
returns trigger
language plpgsql
security definer
set search_path to 'public','ho_private','pg_temp'
as $$
declare v_thread public.hc_message_threads%rowtype; v_facility_name text;
begin
  if new.sender_role <> 'facility' then return new; end if;
  select * into v_thread from public.hc_message_threads t where t.id=new.thread_id;
  if v_thread.id is null then return new; end if;
  select f.name into v_facility_name from public.ho_facilities f where f.id=v_thread.facility_id;
  perform ho_private.hc_notify_jobseeker(v_thread.organization_id,v_thread.facility_id,v_thread.application_id,v_thread.jobseeker_clerk_user_id,
    'message_received','園からメッセージが届きました',
    coalesce(v_facility_name,'応募先の園') || '：' || left(regexp_replace(new.body,E'[\\n\\r]+',' ','g'),160),
    '/applications','jobseeker:message:' || new.id::text);
  return new;
end;
$$;

create or replace function ho_private.hc_visit_jobseeker_notification_trigger()
returns trigger
language plpgsql
security definer
set search_path to 'public','ho_private','pg_temp'
as $$
declare v_facility_name text; v_type text; v_title text; v_label text; v_when text;
begin
  if old.status is not distinct from new.status then return new; end if;
  if new.status not in ('confirmed','declined','cancelled','completed','no_show') then return new; end if;
  select f.name into v_facility_name from public.ho_facilities f where f.id=new.facility_id;
  v_label := case new.experience_type when 'visit' then '園見学' when 'half_day_trial' then '半日体験' when 'full_day_trial' then '1日体験' else '見学・体験' end;
  v_when := to_char(new.starts_at at time zone 'Asia/Tokyo','YYYY年MM月DD日 HH24:MI');
  v_type := case new.status when 'confirmed' then 'visit_confirmed' when 'declined' then 'visit_declined' when 'cancelled' then 'visit_cancelled' when 'completed' then 'visit_completed' else 'visit_no_show' end;
  v_title := case new.status when 'confirmed' then v_label || 'が確定しました' when 'declined' then v_label || 'の日程を調整できませんでした' when 'cancelled' then v_label || 'がキャンセルされました' when 'completed' then v_label || 'が完了しました' else v_label || 'の状況が更新されました' end;
  perform ho_private.hc_notify_jobseeker(new.organization_id,new.facility_id,new.application_id,new.jobseeker_clerk_user_id,
    v_type,v_title,coalesce(v_facility_name,'園') || '／' || v_when,'/applications','jobseeker:visit:' || new.id::text || ':' || new.status);
  return new;
end;
$$;

create or replace function ho_private.hc_spot_assignment_jobseeker_notification_trigger()
returns trigger
language plpgsql
security definer
set search_path to 'public','ho_private','pg_temp'
as $$
declare v_facility_name text; v_app_id uuid;
begin
  if new.status <> 'confirmed' then return new; end if;
  select f.name into v_facility_name from public.ho_facilities f where f.id=new.facility_id;
  v_app_id := new.application_id;
  perform ho_private.hc_notify_jobseeker(new.organization_id,new.facility_id,v_app_id,new.jobseeker_clerk_user_id,
    'spot_confirmed','スポット勤務が確定しました',
    coalesce(v_facility_name,'園') || '／' || to_char(new.work_date,'YYYY年MM月DD日') || ' ' || to_char(new.start_time,'HH24:MI') || '〜' || to_char(new.end_time,'HH24:MI'),
    '/applications','jobseeker:spot:' || new.id::text || ':confirmed');
  return new;
end;
$$;

revoke all on function ho_private.hc_application_jobseeker_notification_trigger() from public, anon, authenticated;
revoke all on function ho_private.hc_interview_jobseeker_notification_trigger() from public, anon, authenticated;
revoke all on function ho_private.hc_message_jobseeker_notification_trigger() from public, anon, authenticated;
revoke all on function ho_private.hc_visit_jobseeker_notification_trigger() from public, anon, authenticated;
revoke all on function ho_private.hc_spot_assignment_jobseeker_notification_trigger() from public, anon, authenticated;

drop trigger if exists hc_applications_notify_jobseeker on public.hc_applications;
create trigger hc_applications_notify_jobseeker after update of status on public.hc_applications
for each row execute function ho_private.hc_application_jobseeker_notification_trigger();

drop trigger if exists hc_interviews_notify_jobseeker on public.hc_interviews;
create trigger hc_interviews_notify_jobseeker after insert or update of scheduled_at,status,location,meeting_url on public.hc_interviews
for each row execute function ho_private.hc_interview_jobseeker_notification_trigger();

drop trigger if exists hc_messages_notify_jobseeker on public.hc_messages;
create trigger hc_messages_notify_jobseeker after insert on public.hc_messages
for each row execute function ho_private.hc_message_jobseeker_notification_trigger();

drop trigger if exists hc_visit_reservations_notify_jobseeker on public.hc_visit_reservations;
create trigger hc_visit_reservations_notify_jobseeker after update of status on public.hc_visit_reservations
for each row execute function ho_private.hc_visit_jobseeker_notification_trigger();

drop trigger if exists hc_spot_assignments_notify_jobseeker on public.hc_spot_assignments;
create trigger hc_spot_assignments_notify_jobseeker after insert on public.hc_spot_assignments
for each row execute function ho_private.hc_spot_assignment_jobseeker_notification_trigger();
