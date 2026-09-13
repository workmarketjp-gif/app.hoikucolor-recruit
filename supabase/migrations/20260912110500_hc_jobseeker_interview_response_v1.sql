-- Candidate-safe interview response boundary.
-- Production migration: hc_jobseeker_interview_response_v1.
-- Candidates can accept a scheduled interview or request rescheduling without mutating facility-owned interview fields.

create table if not exists public.hc_interview_candidate_responses (
  interview_id uuid primary key references public.hc_interviews(id) on delete cascade,
  application_id uuid not null,
  organization_id uuid not null,
  facility_id uuid not null,
  job_id uuid not null,
  jobseeker_clerk_user_id text not null,
  response_status text not null check (response_status in ('accepted','reschedule_requested')),
  candidate_message text,
  responded_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint hc_interview_candidate_responses_application_identity_fkey
    foreign key (application_id, organization_id, facility_id, job_id, jobseeker_clerk_user_id)
    references public.hc_applications(id, organization_id, facility_id, job_id, jobseeker_clerk_user_id)
    on delete cascade,
  constraint hc_interview_candidate_responses_message_check
    check (candidate_message is null or char_length(candidate_message) <= 1000)
);

alter table public.hc_interview_candidate_responses enable row level security;
revoke all on table public.hc_interview_candidate_responses from public, anon, authenticated;
grant select on table public.hc_interview_candidate_responses to service_role;

create or replace function public.hc_jobseeker_respond_interview(
  p_interview_id uuid,
  p_response_status text,
  p_candidate_message text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, ho_private, pg_temp
as $$
declare
  v_actor text := ho_private.current_clerk_user_id();
  v_interview public.hc_interviews%rowtype;
  v_application public.hc_applications%rowtype;
  v_status text := trim(coalesce(p_response_status, ''));
  v_message text := nullif(trim(coalesce(p_candidate_message, '')), '');
  v_previous public.hc_interview_candidate_responses%rowtype;
  v_changed boolean := true;
begin
  if v_actor is null then
    raise exception 'ログインが必要です。' using errcode = '42501';
  end if;
  if v_status not in ('accepted','reschedule_requested') then
    raise exception '面接への回答が不正です。';
  end if;
  if v_message is not null and char_length(v_message) > 1000 then
    raise exception '連絡事項は1000文字以内で入力してください。';
  end if;
  if v_status = 'reschedule_requested' and v_message is null then
    raise exception '日程変更を希望する場合は、希望日時や都合のよい時間帯を入力してください。';
  end if;

  select i.* into v_interview
  from public.hc_interviews i
  join public.hc_applications a
    on a.id = i.application_id
   and a.organization_id = i.organization_id
   and a.facility_id = i.facility_id
  where i.id = p_interview_id
    and a.jobseeker_clerk_user_id = v_actor
  for update of i;

  if not found then
    raise exception 'この面接へ回答する権限がありません。' using errcode = '42501';
  end if;
  if v_interview.status <> 'scheduled' then
    raise exception 'この面接は現在回答できません。';
  end if;

  select * into v_application from public.hc_applications where id = v_interview.application_id;
  select * into v_previous from public.hc_interview_candidate_responses where interview_id = v_interview.id;
  if found and v_previous.response_status = v_status and coalesce(v_previous.candidate_message, '') = coalesce(v_message, '') then
    v_changed := false;
  end if;

  insert into public.hc_interview_candidate_responses(
    interview_id, application_id, organization_id, facility_id, job_id, jobseeker_clerk_user_id,
    response_status, candidate_message, responded_at, updated_at
  ) values (
    v_interview.id, v_interview.application_id, v_interview.organization_id, v_interview.facility_id,
    v_application.job_id, v_actor, v_status, v_message, now(), now()
  )
  on conflict (interview_id) do update set
    response_status = excluded.response_status,
    candidate_message = excluded.candidate_message,
    responded_at = excluded.responded_at,
    updated_at = excluded.updated_at,
    jobseeker_clerk_user_id = excluded.jobseeker_clerk_user_id;

  if v_changed then
    perform public.hc_send_message(
      v_interview.application_id,
      case
        when v_status = 'accepted' then
          '面接日時を確認しました。この日時で参加します。' || coalesce(E'\n連絡事項: ' || v_message, '')
        else
          '面接日程の変更を希望します。' || E'\n希望・連絡事項: ' || v_message
      end
    );
  end if;

  return jsonb_build_object(
    'interview_id', v_interview.id,
    'application_id', v_interview.application_id,
    'response_status', v_status,
    'candidate_message', v_message,
    'responded_at', now(),
    'message_sent', v_changed
  );
end;
$$;

revoke all on function public.hc_jobseeker_respond_interview(uuid,text,text) from public, anon;
grant execute on function public.hc_jobseeker_respond_interview(uuid,text,text) to authenticated, service_role;

create or replace function public.hc_jobseeker_get_application_detail(p_application_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, ho_private, pg_temp
as $$
  select jsonb_build_object(
    'application', jsonb_build_object(
      'id', a.id,
      'job_id', a.job_id,
      'applicant_name', a.applicant_name,
      'status', a.status,
      'desired_start_date', a.desired_start_date,
      'message', a.message,
      'applied_at', a.applied_at,
      'updated_at', a.updated_at,
      'job_title', j.title,
      'employment_type', j.employment_type,
      'facility_name', f.name,
      'prefecture', f.prefecture,
      'city', f.city
    ),
    'interviews', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id,
        'application_id', i.application_id,
        'scheduled_at', i.scheduled_at,
        'duration_minutes', i.duration_minutes,
        'location', i.location,
        'meeting_url', i.meeting_url,
        'status', i.status,
        'updated_at', i.updated_at,
        'candidate_response_status', r.response_status,
        'candidate_response_message', r.candidate_message,
        'candidate_responded_at', r.responded_at
      ) order by i.scheduled_at desc)
      from public.hc_interviews i
      left join public.hc_interview_candidate_responses r on r.interview_id = i.id
      where i.application_id = a.id
        and i.organization_id = a.organization_id
        and i.facility_id = a.facility_id
    ), '[]'::jsonb),
    'visits', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id,
        'application_id', r.application_id,
        'job_id', r.job_id,
        'experience_type', r.experience_type,
        'starts_at', r.starts_at,
        'ends_at', r.ends_at,
        'status', r.status,
        'candidate_message', r.candidate_message,
        'confirmed_at', r.confirmed_at,
        'cancelled_at', r.cancelled_at,
        'completed_at', r.completed_at,
        'updated_at', r.updated_at
      ) order by r.starts_at desc)
      from public.hc_visit_reservations r
      where r.jobseeker_clerk_user_id = ho_private.current_clerk_user_id()
        and r.organization_id = a.organization_id
        and r.facility_id = a.facility_id
        and r.job_id = a.job_id
        and (r.application_id = a.id or r.application_id is null)
    ), '[]'::jsonb)
  )
  from public.hc_applications a
  join public.hc_jobs j
    on j.id = a.job_id
   and j.organization_id = a.organization_id
   and j.facility_id = a.facility_id
  join public.ho_facilities f
    on f.id = a.facility_id
   and f.organization_id = a.organization_id
  where a.id = p_application_id
    and a.jobseeker_clerk_user_id = ho_private.current_clerk_user_id();
$$;

revoke all on function public.hc_jobseeker_get_application_detail(uuid) from public, anon;
grant execute on function public.hc_jobseeker_get_application_detail(uuid) to authenticated, service_role;
