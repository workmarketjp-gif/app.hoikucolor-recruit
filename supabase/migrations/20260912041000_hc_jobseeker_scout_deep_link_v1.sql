create or replace function hc_private.hc_create_scout_invitation(
  p_organization_id uuid,
  p_facility_id uuid,
  p_job_id uuid,
  p_jobseeker_clerk_user_id text,
  p_invitation_message text default '',
  p_expires_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = public, hc_private, pg_temp
as $$
declare
  v_id uuid;
  v_expires_at timestamptz := coalesce(p_expires_at, now() + interval '14 days');
begin
  if coalesce(p_jobseeker_clerk_user_id,'') = '' then
    raise exception 'jobseeker is required' using errcode='22023';
  end if;
  if not exists(select 1 from public.ho_organizations o where o.id=p_organization_id and o.status='active') then
    raise exception 'organization is not active' using errcode='22023';
  end if;
  if not exists(select 1 from public.ho_facilities f where f.id=p_facility_id and f.organization_id=p_organization_id and f.status='active') then
    raise exception 'facility is not available for this organization' using errcode='22023';
  end if;
  if p_job_id is not null and not exists(
    select 1 from public.hc_jobs j
    where j.id=p_job_id and j.organization_id=p_organization_id and j.facility_id=p_facility_id and j.status='published'
  ) then
    raise exception 'job is not an active published job for this facility' using errcode='22023';
  end if;
  if v_expires_at <= now() or v_expires_at > now() + interval '90 days' then
    raise exception 'invalid scout expiry' using errcode='22023';
  end if;
  if not hc_private.hc_jobseeker_is_scoutable_for_org(p_jobseeker_clerk_user_id,p_organization_id) then
    raise exception 'jobseeker is not scoutable for this organization' using errcode='42501';
  end if;

  insert into public.hc_scout_invitations(
    organization_id, facility_id, job_id, recipient_clerk_user_id, invitation_message, expires_at
  ) values(
    p_organization_id, p_facility_id, p_job_id, p_jobseeker_clerk_user_id,
    left(coalesce(p_invitation_message,''),2000), v_expires_at
  ) returning id into v_id;

  insert into public.hc_notifications(
    organization_id, facility_id, recipient_clerk_user_id,
    notification_type, title, body, link_url, audience, event_key
  ) values(
    p_organization_id,
    p_facility_id,
    p_jobseeker_clerk_user_id,
    'scout_received',
    '匿名スカウトが届きました',
    '園から見学・応募のお誘いが届いています。',
    '/profile?scout_id=' || v_id::text || '#scout-inbox',
    'jobseeker',
    'jobseeker:scout:' || v_id::text || ':received'
  ) on conflict do nothing;

  return v_id;
end;
$$;

revoke all on function hc_private.hc_create_scout_invitation(uuid,uuid,uuid,text,text,timestamptz) from public, anon, authenticated;
grant execute on function hc_private.hc_create_scout_invitation(uuid,uuid,uuid,text,text,timestamptz) to service_role;

update public.hc_notifications
set link_url = '/profile?scout_id=' || substring(event_key from 'jobseeker:scout:([0-9a-fA-F-]{36}):received') || '#scout-inbox'
where audience = 'jobseeker'
  and notification_type = 'scout_received'
  and event_key ~ '^jobseeker:scout:[0-9a-fA-F-]{36}:received$';
