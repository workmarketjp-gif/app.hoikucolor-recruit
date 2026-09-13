-- Candidate-safe dashboard attention summary.
-- Production migration: hc_jobseeker_attention_summary_v1.
-- Counts only the current candidate's unanswered interviews, unread facility-message notifications and active pending scouts.

create or replace function public.hc_jobseeker_attention_summary()
returns jsonb
language sql
stable
security definer
set search_path = public, ho_private, pg_temp
as $$
with actor as (
  select ho_private.current_clerk_user_id() as clerk_user_id
),
unanswered_interviews as (
  select
    i.id as interview_id,
    a.id as application_id,
    i.scheduled_at,
    f.name as facility_name
  from public.hc_interviews i
  join public.hc_applications a
    on a.id = i.application_id
   and a.organization_id = i.organization_id
   and a.facility_id = i.facility_id
  join public.ho_facilities f
    on f.id = i.facility_id
   and f.organization_id = i.organization_id
  left join public.hc_interview_candidate_responses r
    on r.interview_id = i.id
  cross join actor
  where actor.clerk_user_id is not null
    and a.jobseeker_clerk_user_id = actor.clerk_user_id
    and i.status = 'scheduled'
    and r.interview_id is null
),
unread_messages as (
  select
    n.id as notification_id,
    n.application_id,
    n.created_at,
    f.name as facility_name
  from public.hc_notifications n
  join public.ho_facilities f
    on f.id = n.facility_id
   and f.organization_id = n.organization_id
  cross join actor
  where actor.clerk_user_id is not null
    and n.recipient_clerk_user_id = actor.clerk_user_id
    and n.audience = 'jobseeker'
    and n.notification_type = 'message_received'
    and n.read_at is null
    and n.application_id is not null
),
pending_scouts as (
  select
    s.id as scout_id,
    s.job_id,
    s.sent_at,
    s.expires_at,
    f.name as facility_name
  from public.hc_scout_invitations s
  join public.ho_facilities f
    on f.id = s.facility_id
   and f.organization_id = s.organization_id
  cross join actor
  where actor.clerk_user_id is not null
    and s.recipient_clerk_user_id = actor.clerk_user_id
    and s.status = 'pending'
    and s.expires_at > now()
)
select jsonb_build_object(
  'unanswered_interviews_count', (select count(*) from unanswered_interviews),
  'unread_messages_count', (select count(*) from unread_messages),
  'pending_scouts_count', (select count(*) from pending_scouts),
  'next_interview', (
    select jsonb_build_object(
      'application_id', application_id,
      'interview_id', interview_id,
      'scheduled_at', scheduled_at,
      'facility_name', facility_name,
      'link_url', '/applications?application_id=' || application_id::text || '&interview_id=' || interview_id::text || '#interview-' || interview_id::text
    )
    from unanswered_interviews
    order by scheduled_at asc
    limit 1
  ),
  'next_message', (
    select jsonb_build_object(
      'notification_id', notification_id,
      'application_id', application_id,
      'created_at', created_at,
      'facility_name', facility_name,
      'link_url', '/applications?application_id=' || application_id::text || '#application-messages'
    )
    from unread_messages
    order by created_at desc
    limit 1
  ),
  'next_scout', (
    select jsonb_build_object(
      'scout_id', scout_id,
      'job_id', job_id,
      'sent_at', sent_at,
      'expires_at', expires_at,
      'facility_name', facility_name,
      'link_url', '/scouts?scout_id=' || scout_id::text || '#scout-inbox'
    )
    from pending_scouts
    order by sent_at desc
    limit 1
  )
);
$$;

revoke all on function public.hc_jobseeker_attention_summary() from public, anon;
grant execute on function public.hc_jobseeker_attention_summary() to authenticated, service_role;

create or replace function public.hc_jobseeker_mark_application_messages_read(p_application_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, ho_private, pg_temp
as $$
declare
  v_actor text := ho_private.current_clerk_user_id();
  v_count integer := 0;
begin
  if v_actor is null then
    raise exception 'ログインが必要です。' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.hc_applications a
    where a.id = p_application_id
      and a.jobseeker_clerk_user_id = v_actor
  ) then
    raise exception 'この応募のメッセージを確認する権限がありません。' using errcode = '42501';
  end if;

  update public.hc_notifications n
  set read_at = coalesce(n.read_at, now())
  where n.application_id = p_application_id
    and n.recipient_clerk_user_id = v_actor
    and n.audience = 'jobseeker'
    and n.notification_type = 'message_received'
    and n.read_at is null;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.hc_jobseeker_mark_application_messages_read(uuid) from public, anon;
grant execute on function public.hc_jobseeker_mark_application_messages_read(uuid) to authenticated, service_role;
