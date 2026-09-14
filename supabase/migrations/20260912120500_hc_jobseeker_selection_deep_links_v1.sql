-- Mirror of the production migration applied on 2026-09-13 NZ time.
-- Sends candidate workflow notifications directly to the relevant interview or message section.

create or replace function ho_private.hc_interview_jobseeker_notification_trigger()
returns trigger
language plpgsql
security definer
set search_path to 'public','ho_private','pg_temp'
as $$
declare
  v_app public.hc_applications%rowtype;
  v_facility_name text;
  v_when text;
  v_type text;
  v_title text;
  v_event_key text;
  v_link text;
begin
  select * into v_app
  from public.hc_applications a
  where a.id=new.application_id
    and a.organization_id=new.organization_id
    and a.facility_id=new.facility_id;
  if v_app.id is null or v_app.jobseeker_clerk_user_id is null then return new; end if;

  if tg_op='UPDATE'
     and old.scheduled_at is not distinct from new.scheduled_at
     and old.status is not distinct from new.status
     and old.location is not distinct from new.location
     and old.meeting_url is not distinct from new.meeting_url then
    return new;
  end if;

  select f.name into v_facility_name from public.ho_facilities f where f.id=new.facility_id;
  v_when := to_char(new.scheduled_at at time zone 'Asia/Tokyo','YYYY年MM月DD日 HH24:MI');

  if new.status='cancelled' then
    v_type := 'interview_cancelled';
    v_title := '面接予定がキャンセルされました';
  else
    v_type := 'interview_scheduled';
    v_title := case when tg_op='UPDATE' then '面接予定が更新されました' else '面接予定が決まりました' end;
  end if;

  v_event_key := 'jobseeker:interview:' || new.id::text || ':' || new.status || ':' || extract(epoch from new.updated_at)::bigint::text;
  v_link := '/applications?application_id=' || new.application_id::text || '&interview_id=' || new.id::text || '#interview-' || new.id::text;

  perform ho_private.hc_notify_jobseeker(
    new.organization_id,new.facility_id,new.application_id,v_app.jobseeker_clerk_user_id,
    v_type,v_title,
    coalesce(v_facility_name,'応募先の園') || '／' || v_when ||
      case when new.location is not null then '／' || new.location else '' end,
    v_link,v_event_key
  );
  return new;
end;
$$;

create or replace function ho_private.hc_message_jobseeker_notification_trigger()
returns trigger
language plpgsql
security definer
set search_path to 'public','ho_private','pg_temp'
as $$
declare
  v_thread public.hc_message_threads%rowtype;
  v_facility_name text;
  v_link text;
begin
  if new.sender_role <> 'facility' then return new; end if;
  select * into v_thread from public.hc_message_threads t where t.id=new.thread_id;
  if v_thread.id is null then return new; end if;
  select f.name into v_facility_name from public.ho_facilities f where f.id=v_thread.facility_id;
  v_link := '/applications?application_id=' || v_thread.application_id::text || '#application-messages';

  perform ho_private.hc_notify_jobseeker(
    v_thread.organization_id,v_thread.facility_id,v_thread.application_id,v_thread.jobseeker_clerk_user_id,
    'message_received','園からメッセージが届きました',
    coalesce(v_facility_name,'応募先の園') || '：' || left(regexp_replace(new.body,E'[\\n\\r]+',' ','g'),160),
    v_link,'jobseeker:message:' || new.id::text
  );
  return new;
end;
$$;

revoke all on function ho_private.hc_interview_jobseeker_notification_trigger() from public, anon, authenticated;
revoke all on function ho_private.hc_message_jobseeker_notification_trigger() from public, anon, authenticated;
