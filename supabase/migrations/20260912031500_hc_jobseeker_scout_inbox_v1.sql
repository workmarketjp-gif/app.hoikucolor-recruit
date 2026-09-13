create table if not exists public.hc_scout_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.ho_organizations(id) on delete cascade,
  facility_id uuid not null references public.ho_facilities(id) on delete cascade,
  job_id uuid references public.hc_jobs(id) on delete set null,
  recipient_clerk_user_id text not null,
  invitation_message text not null default '',
  status text not null default 'pending' check (status in ('pending','accepted','declined','cancelled')),
  sent_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '14 days'),
  responded_at timestamptz,
  accepted_at timestamptz,
  declined_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint hc_scout_invitations_expiry_after_send check (expires_at > sent_at),
  constraint hc_scout_invitations_message_length check (length(invitation_message) <= 2000)
);

create index if not exists hc_scout_invitations_recipient_sent_idx on public.hc_scout_invitations(recipient_clerk_user_id, sent_at desc);
create index if not exists hc_scout_invitations_facility_sent_idx on public.hc_scout_invitations(facility_id, sent_at desc);
create unique index if not exists hc_scout_invitations_pending_unique_idx
  on public.hc_scout_invitations(organization_id, recipient_clerk_user_id, coalesce(job_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where status = 'pending';

alter table public.hc_scout_invitations enable row level security;
drop policy if exists hc_scout_invitations_candidate_own on public.hc_scout_invitations;
create policy hc_scout_invitations_candidate_own on public.hc_scout_invitations
for select to authenticated using (recipient_clerk_user_id = auth.jwt()->>'sub');
revoke all on table public.hc_scout_invitations from public, anon, authenticated;
grant select, insert, update, delete on table public.hc_scout_invitations to service_role;

create or replace function hc_private.hc_create_scout_invitation(p_organization_id uuid,p_facility_id uuid,p_job_id uuid,p_jobseeker_clerk_user_id text,p_invitation_message text default '',p_expires_at timestamptz default null)
returns uuid language plpgsql security definer set search_path = public, hc_private, pg_temp as $$
declare v_id uuid; v_expires_at timestamptz := coalesce(p_expires_at, now() + interval '14 days');
begin
  if coalesce(p_jobseeker_clerk_user_id,'') = '' then raise exception 'jobseeker is required' using errcode='22023'; end if;
  if not exists(select 1 from public.ho_organizations o where o.id=p_organization_id and o.status='active') then raise exception 'organization is not active' using errcode='22023'; end if;
  if not exists(select 1 from public.ho_facilities f where f.id=p_facility_id and f.organization_id=p_organization_id and f.status='active') then raise exception 'facility is not available for this organization' using errcode='22023'; end if;
  if p_job_id is not null and not exists(select 1 from public.hc_jobs j where j.id=p_job_id and j.organization_id=p_organization_id and j.facility_id=p_facility_id and j.status='published') then raise exception 'job is not an active published job for this facility' using errcode='22023'; end if;
  if v_expires_at <= now() or v_expires_at > now() + interval '90 days' then raise exception 'invalid scout expiry' using errcode='22023'; end if;
  if not hc_private.hc_jobseeker_is_scoutable_for_org(p_jobseeker_clerk_user_id,p_organization_id) then raise exception 'jobseeker is not scoutable for this organization' using errcode='42501'; end if;
  insert into public.hc_scout_invitations(organization_id,facility_id,job_id,recipient_clerk_user_id,invitation_message,expires_at)
  values(p_organization_id,p_facility_id,p_job_id,p_jobseeker_clerk_user_id,left(coalesce(p_invitation_message,''),2000),v_expires_at) returning id into v_id;
  insert into public.hc_notifications(organization_id,facility_id,recipient_clerk_user_id,notification_type,title,body,link_url,audience,event_key)
  values(p_organization_id,p_facility_id,p_jobseeker_clerk_user_id,'scout_received','匿名スカウトが届きました','園から見学・応募のお誘いが届いています。','/profile','jobseeker','jobseeker:scout:'||v_id::text||':received') on conflict do nothing;
  return v_id;
end;
$$;

create or replace function public.hc_jobseeker_list_scouts()
returns table(scout_id uuid,organization_name text,facility_name text,job_id uuid,job_title text,employment_type text,invitation_message text,scout_status text,sent_at timestamptz,expires_at timestamptz,responded_at timestamptz)
language sql stable security definer set search_path = public, pg_temp as $$
  select s.id,o.name,f.name,s.job_id,j.title,j.employment_type,s.invitation_message,
    case when s.status='pending' and s.expires_at<=now() then 'expired' else s.status end,
    s.sent_at,s.expires_at,s.responded_at
  from public.hc_scout_invitations s
  join public.ho_organizations o on o.id=s.organization_id
  join public.ho_facilities f on f.id=s.facility_id
  left join public.hc_jobs j on j.id=s.job_id
  where s.recipient_clerk_user_id=auth.jwt()->>'sub'
  order by (case when s.status='pending' and s.expires_at>now() then 0 else 1 end),s.sent_at desc;
$$;

create or replace function public.hc_jobseeker_respond_scout(p_scout_id uuid,p_decision text)
returns text language plpgsql security definer set search_path = public, pg_temp as $$
declare v_clerk_user_id text := auth.jwt()->>'sub'; v_row public.hc_scout_invitations%rowtype; v_decision text := lower(btrim(coalesce(p_decision,'')));
begin
  if coalesce(v_clerk_user_id,'')='' then raise exception 'authentication required' using errcode='42501'; end if;
  if v_decision not in ('accepted','declined') then raise exception 'decision must be accepted or declined' using errcode='22023'; end if;
  select * into v_row from public.hc_scout_invitations where id=p_scout_id and recipient_clerk_user_id=v_clerk_user_id for update;
  if not found then raise exception 'scout invitation not found' using errcode='P0002'; end if;
  if v_row.status<>'pending' then raise exception 'scout invitation already responded' using errcode='22023'; end if;
  if v_row.expires_at<=now() then raise exception 'scout invitation expired' using errcode='22023'; end if;
  update public.hc_scout_invitations set status=v_decision,responded_at=now(),accepted_at=case when v_decision='accepted' then now() else null end,declined_at=case when v_decision='declined' then now() else null end,updated_at=now() where id=p_scout_id;
  return v_decision;
end;
$$;

create or replace function hc_private.hc_accepted_scout_identity(p_scout_id uuid,p_organization_id uuid)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select case when s.status='accepted' and s.organization_id=p_organization_id then jsonb_build_object('scout_id',s.id,'name',p.name,'name_kana',p.name_kana,'email',p.email,'phone',p.phone,'qualifications',p.qualifications,'years_of_experience',p.years_of_experience,'desired_start_date',p.desired_start_date) else null end
  from public.hc_scout_invitations s join public.hc_jobseeker_profiles p on p.clerk_user_id=s.recipient_clerk_user_id where s.id=p_scout_id;
$$;

revoke all on function hc_private.hc_create_scout_invitation(uuid,uuid,uuid,text,text,timestamptz) from public,anon,authenticated;
revoke all on function hc_private.hc_accepted_scout_identity(uuid,uuid) from public,anon,authenticated;
grant execute on function hc_private.hc_create_scout_invitation(uuid,uuid,uuid,text,text,timestamptz) to service_role;
grant execute on function hc_private.hc_accepted_scout_identity(uuid,uuid) to service_role;
revoke all on function public.hc_jobseeker_list_scouts() from public,anon;
revoke all on function public.hc_jobseeker_respond_scout(uuid,text) from public,anon;
grant execute on function public.hc_jobseeker_list_scouts() to authenticated,service_role;
grant execute on function public.hc_jobseeker_respond_scout(uuid,text) to authenticated,service_role;
comment on table public.hc_scout_invitations is 'Anonymous scout invitation lifecycle. Candidate identity remains private until explicit acceptance; browser access is via narrow candidate RPCs only.';
comment on function hc_private.hc_accepted_scout_identity(uuid,uuid) is 'Consent boundary for future facility-side scout handling. Returns candidate contact identity only after candidate accepted and only for the matching organization. Service-role/private use only.';
