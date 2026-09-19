create or replace function ho_private.hc_candidate_application_terminal_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_authorized_actor text := nullif(current_setting('hc.candidate_withdrawal_actor', true), '');
begin
  if old.source_type = 'hoiku_color_jobseeker' then
    if old.status = 'withdrawn' and new.status is distinct from 'withdrawn' then
      raise exception 'HC_CANDIDATE_WITHDRAWAL_TERMINAL'
        using errcode = '23514';
    end if;

    if new.status = 'withdrawn' and old.status is distinct from 'withdrawn' then
      if v_authorized_actor is null
         or v_authorized_actor is distinct from old.jobseeker_clerk_user_id then
        raise exception 'HC_CANDIDATE_WITHDRAWAL_RPC_REQUIRED'
          using errcode = '42501';
      end if;
    end if;
  end if;

  return new;
end;
$$;

revoke all on function ho_private.hc_candidate_application_terminal_guard() from public, anon, authenticated, service_role;

drop trigger if exists hc_candidate_application_terminal_guard on public.hc_applications;
create trigger hc_candidate_application_terminal_guard
before update of status on public.hc_applications
for each row
execute function ho_private.hc_candidate_application_terminal_guard();

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

revoke all on function ho_private.hc_jobseeker_withdraw_application_impl(uuid,text) from public, anon, authenticated, service_role;

create or replace function public.hc_jobseeker_withdraw_application(
  p_application_id uuid,
  p_reason text default null
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select ho_private.hc_jobseeker_withdraw_application_impl(p_application_id, p_reason);
$$;

revoke all on function public.hc_jobseeker_withdraw_application(uuid,text) from public, anon, authenticated, service_role;
grant execute on function public.hc_jobseeker_withdraw_application(uuid,text) to authenticated;
