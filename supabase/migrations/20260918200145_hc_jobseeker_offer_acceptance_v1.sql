-- Source sync only. Production already applied this migration as 20260918200145.

alter table public.hc_applications
  add column if not exists candidate_offer_response text,
  add column if not exists candidate_offer_responded_at timestamptz,
  add column if not exists candidate_offer_message text;

alter table public.hc_applications
  drop constraint if exists hc_applications_candidate_offer_response_check;
alter table public.hc_applications
  add constraint hc_applications_candidate_offer_response_check
  check (candidate_offer_response is null or candidate_offer_response in ('accepted','declined'));

alter table public.hc_applications
  drop constraint if exists hc_applications_candidate_offer_message_length_check;
alter table public.hc_applications
  add constraint hc_applications_candidate_offer_message_length_check
  check (candidate_offer_message is null or char_length(candidate_offer_message) <= 1000);

create or replace function ho_private.hc_candidate_offer_response_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_offer_actor text := nullif(current_setting('hc.candidate_offer_actor', true), '');
  v_withdraw_actor text := nullif(current_setting('hc.candidate_withdrawal_actor', true), '');
  v_fields_changed boolean;
begin
  if old.source_type <> 'hoiku_color_jobseeker' then
    return new;
  end if;

  if old.status = 'offered'
     and new.status in ('new','reviewing','interview')
     and new.status is distinct from old.status then
    new.candidate_offer_response := null;
    new.candidate_offer_responded_at := null;
    new.candidate_offer_message := null;
  end if;

  v_fields_changed :=
    new.candidate_offer_response is distinct from old.candidate_offer_response
    or new.candidate_offer_responded_at is distinct from old.candidate_offer_responded_at
    or new.candidate_offer_message is distinct from old.candidate_offer_message;

  if v_fields_changed then
    if coalesce(v_offer_actor, v_withdraw_actor, '') is distinct from old.jobseeker_clerk_user_id then
      raise exception 'HC_CANDIDATE_OFFER_RESPONSE_RPC_REQUIRED'
        using errcode = '42501';
    end if;

    if new.candidate_offer_response = 'accepted' and new.status <> 'offered' then
      raise exception 'HC_OFFER_ACCEPTANCE_REQUIRES_OFFERED_STATUS'
        using errcode = '23514';
    end if;

    if new.candidate_offer_response = 'declined' and new.status <> 'withdrawn' then
      raise exception 'HC_OFFER_DECLINE_REQUIRES_WITHDRAWN_STATUS'
        using errcode = '23514';
    end if;
  end if;

  if new.status = 'hired'
     and old.status is distinct from 'hired'
     and coalesce(old.candidate_offer_response, new.candidate_offer_response) <> 'accepted' then
    raise exception 'HC_CANDIDATE_OFFER_ACCEPTANCE_REQUIRED'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function ho_private.hc_candidate_offer_response_guard()
  from public, anon, authenticated, service_role;

drop trigger if exists hc_candidate_application_offer_response_guard
  on public.hc_applications;
create trigger hc_candidate_application_offer_response_guard
before update of status, candidate_offer_response, candidate_offer_responded_at, candidate_offer_message
on public.hc_applications
for each row
execute function ho_private.hc_candidate_offer_response_guard();

create or replace function public.hc_jobseeker_accept_offer(
  p_application_id uuid,
  p_message text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor text := nullif(auth.jwt() ->> 'sub', '');
  v_app public.hc_applications%rowtype;
  v_message text := nullif(btrim(coalesce(p_message, '')), '');
  v_sent_message text;
begin
  if v_actor is null then
    raise exception 'HC_JOBSEEKER_AUTH_REQUIRED'
      using errcode = '42501';
  end if;

  if v_message is not null and char_length(v_message) > 1000 then
    raise exception 'HC_OFFER_RESPONSE_MESSAGE_TOO_LONG'
      using errcode = '22023';
  end if;

  select a.* into v_app
  from public.hc_applications a
  where a.id = p_application_id
    and a.source_type = 'hoiku_color_jobseeker'
    and a.jobseeker_clerk_user_id = v_actor
  for update;

  if v_app.id is null then
    raise exception 'APPLICATION_NOT_FOUND'
      using errcode = 'P0002';
  end if;

  if v_app.status <> 'offered' then
    raise exception 'HC_OFFER_ACCEPTANCE_NOT_ALLOWED'
      using errcode = '23514',
            detail = 'Current status: ' || coalesce(v_app.status, '<null>');
  end if;

  if v_app.candidate_offer_response = 'accepted' then
    return jsonb_build_object(
      'application_id', v_app.id,
      'status', v_app.status,
      'offer_response', 'accepted',
      'offer_responded_at', v_app.candidate_offer_responded_at,
      'message', v_app.candidate_offer_message,
      'already_accepted', true
    );
  end if;

  perform set_config('hc.candidate_offer_actor', v_actor, true);

  update public.hc_applications a
  set candidate_offer_response = 'accepted',
      candidate_offer_responded_at = now(),
      candidate_offer_message = v_message,
      updated_at = now()
  where a.id = v_app.id;

  insert into public.hc_application_events(
    organization_id,
    facility_id,
    application_id,
    event_type,
    from_status,
    to_status,
    note,
    actor_clerk_user_id
  ) values (
    v_app.organization_id,
    v_app.facility_id,
    v_app.id,
    'candidate_offer_accepted',
    'offered',
    'offered',
    v_message,
    v_actor
  );

  v_sent_message := '内定を承諾しました。' || case when v_message is not null then E'\n連絡事項: ' || v_message else '' end;
  perform public.hc_send_message(v_app.id, v_sent_message);

  return jsonb_build_object(
    'application_id', v_app.id,
    'status', 'offered',
    'offer_response', 'accepted',
    'offer_responded_at', (select candidate_offer_responded_at from public.hc_applications where id=v_app.id),
    'message', v_message,
    'already_accepted', false
  );
end;
$$;

revoke all on function public.hc_jobseeker_accept_offer(uuid,text)
  from public, anon, authenticated, service_role;
grant execute on function public.hc_jobseeker_accept_offer(uuid,text)
  to authenticated;

create or replace function ho_private.hc_jobseeker_withdraw_application_impl(
  p_application_id uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor text := nullif(auth.jwt() ->> 'sub', '');
  v_app public.hc_applications%rowtype;
  v_job_source_type text;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_action_type text;
  v_cancelled_interviews integer := 0;
  v_cancelled_visits integer := 0;
begin
  if v_actor is null then
    raise exception 'HC_JOBSEEKER_AUTH_REQUIRED'
      using errcode = '42501';
  end if;

  if v_reason is not null and char_length(v_reason) > 1000 then
    raise exception 'HC_WITHDRAWAL_REASON_TOO_LONG'
      using errcode = '22023';
  end if;

  select a.* into v_app
  from public.hc_applications a
  where a.id = p_application_id
    and a.source_type = 'hoiku_color_jobseeker'
    and a.jobseeker_clerk_user_id = v_actor
  for update;

  if v_app.id is null then
    raise exception 'APPLICATION_NOT_FOUND'
      using errcode = 'P0002';
  end if;

  if v_app.status = 'withdrawn' then
    return jsonb_build_object(
      'application_id', v_app.id,
      'status', v_app.status,
      'previous_status', v_app.status,
      'action_type', 'already_withdrawn',
      'cancelled_interviews', 0,
      'cancelled_visits', 0
    );
  end if;

  if v_app.status not in ('new', 'reviewing', 'interview', 'offered') then
    raise exception 'HC_APPLICATION_WITHDRAWAL_NOT_ALLOWED'
      using errcode = '23514',
            detail = 'Current status: ' || coalesce(v_app.status, '<null>');
  end if;

  select j.source_type into v_job_source_type
  from public.hc_jobs j
  where j.id = v_app.job_id
    and j.organization_id = v_app.organization_id
    and j.facility_id = v_app.facility_id;

  if v_job_source_type is null then
    raise exception 'APPLICATION_JOB_TENANT_MISMATCH'
      using errcode = '23514';
  end if;

  if v_job_source_type = 'spot_job' then
    raise exception 'HC_SPOT_APPLICATION_USE_SPOT_LIFECYCLE'
      using errcode = '23514';
  end if;

  v_action_type := case
    when v_app.status = 'offered' then 'candidate_offer_declined'
    else 'candidate_application_withdrawn'
  end;

  perform set_config('hc.candidate_withdrawal_actor', v_actor, true);

  update public.hc_applications a
  set status = 'withdrawn',
      candidate_offer_response = case when v_app.status='offered' then 'declined' else a.candidate_offer_response end,
      candidate_offer_responded_at = case when v_app.status='offered' then now() else a.candidate_offer_responded_at end,
      candidate_offer_message = case when v_app.status='offered' then v_reason else a.candidate_offer_message end,
      updated_at = now()
  where a.id = v_app.id;

  update public.hc_interviews i
  set status = 'cancelled',
      updated_at = now()
  where i.application_id = v_app.id
    and i.organization_id = v_app.organization_id
    and i.facility_id = v_app.facility_id
    and i.status = 'scheduled';
  get diagnostics v_cancelled_interviews = row_count;

  update public.hc_visit_reservations r
  set status = 'cancelled',
      cancelled_at = coalesce(r.cancelled_at, now()),
      updated_at = now()
  where r.application_id = v_app.id
    and r.organization_id = v_app.organization_id
    and r.facility_id = v_app.facility_id
    and r.status in ('requested', 'confirmed');
  get diagnostics v_cancelled_visits = row_count;

  insert into public.hc_application_events(
    organization_id,
    facility_id,
    application_id,
    event_type,
    from_status,
    to_status,
    note,
    actor_clerk_user_id
  ) values (
    v_app.organization_id,
    v_app.facility_id,
    v_app.id,
    v_action_type,
    v_app.status,
    'withdrawn',
    v_reason,
    v_actor
  );

  return jsonb_build_object(
    'application_id', v_app.id,
    'status', 'withdrawn',
    'previous_status', v_app.status,
    'action_type', v_action_type,
    'cancelled_interviews', v_cancelled_interviews,
    'cancelled_visits', v_cancelled_visits
  );
end;
$$;

create or replace function public.hc_jobseeker_get_application_detail(p_application_id uuid)
returns jsonb
language sql
stable
security definer
set search_path to 'public', 'ho_private', 'pg_temp'
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
      'candidate_offer_response', a.candidate_offer_response,
      'candidate_offer_responded_at', a.candidate_offer_responded_at,
      'candidate_offer_message', a.candidate_offer_message,
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
