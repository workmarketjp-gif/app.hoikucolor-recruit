create table if not exists public.hc_jobseeker_privacy_settings (
  jobseeker_clerk_user_id text primary key,
  scout_opt_in boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.hc_jobseeker_blocked_organizations (
  id uuid primary key default gen_random_uuid(),
  jobseeker_clerk_user_id text not null,
  organization_id uuid not null references public.ho_organizations(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (jobseeker_clerk_user_id, organization_id)
);

alter table public.hc_jobseeker_privacy_settings enable row level security;
alter table public.hc_jobseeker_privacy_settings force row level security;
alter table public.hc_jobseeker_blocked_organizations enable row level security;
alter table public.hc_jobseeker_blocked_organizations force row level security;

drop policy if exists hc_jobseeker_privacy_settings_own on public.hc_jobseeker_privacy_settings;
create policy hc_jobseeker_privacy_settings_own on public.hc_jobseeker_privacy_settings
for all to authenticated
using (jobseeker_clerk_user_id = auth.jwt()->>'sub')
with check (jobseeker_clerk_user_id = auth.jwt()->>'sub');

drop policy if exists hc_jobseeker_blocked_organizations_own on public.hc_jobseeker_blocked_organizations;
create policy hc_jobseeker_blocked_organizations_own on public.hc_jobseeker_blocked_organizations
for all to authenticated
using (jobseeker_clerk_user_id = auth.jwt()->>'sub')
with check (jobseeker_clerk_user_id = auth.jwt()->>'sub');

revoke all on table public.hc_jobseeker_privacy_settings from anon, authenticated;
revoke all on table public.hc_jobseeker_blocked_organizations from anon, authenticated;
grant select, insert, update, delete on table public.hc_jobseeker_privacy_settings to service_role;
grant select, insert, update, delete on table public.hc_jobseeker_blocked_organizations to service_role;

create or replace function hc_private.hc_jobseeker_is_org_blocked(p_jobseeker_clerk_user_id text, p_organization_id uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.hc_jobseeker_blocked_organizations b
    where b.jobseeker_clerk_user_id = p_jobseeker_clerk_user_id and b.organization_id = p_organization_id
  ) or exists (
    select 1
    from public.ho_people p
    join public.ho_facility_memberships m on m.person_id = p.id
    where p.clerk_user_id = p_jobseeker_clerk_user_id
      and m.organization_id = p_organization_id
      and m.status = 'active'
      and (m.end_date is null or m.end_date >= current_date)
      and (m.ended_at is null or m.ended_at > now())
  );
$$;

create or replace function hc_private.hc_jobseeker_is_scoutable_for_org(p_jobseeker_clerk_user_id text, p_organization_id uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select s.scout_opt_in from public.hc_jobseeker_privacy_settings s where s.jobseeker_clerk_user_id = p_jobseeker_clerk_user_id), false)
    and not hc_private.hc_jobseeker_is_org_blocked(p_jobseeker_clerk_user_id, p_organization_id);
$$;

create or replace function hc_private.hc_jobseeker_anonymous_scout_snapshot(p_jobseeker_clerk_user_id text, p_organization_id uuid)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select case
    when not hc_private.hc_jobseeker_is_scoutable_for_org(p_jobseeker_clerk_user_id, p_organization_id) then null
    else (
      select jsonb_build_object(
        'prefecture', p.prefecture,
        'desired_positions', p.desired_positions,
        'desired_employment_types', p.desired_employment_types,
        'qualifications', p.qualifications,
        'years_of_experience', p.years_of_experience,
        'desired_start_date', p.desired_start_date
      )
      from public.hc_jobseeker_profiles p
      where p.clerk_user_id = p_jobseeker_clerk_user_id
    )
  end;
$$;

revoke all on function hc_private.hc_jobseeker_is_org_blocked(text, uuid) from public, anon, authenticated;
revoke all on function hc_private.hc_jobseeker_is_scoutable_for_org(text, uuid) from public, anon, authenticated;
revoke all on function hc_private.hc_jobseeker_anonymous_scout_snapshot(text, uuid) from public, anon, authenticated;
grant execute on function hc_private.hc_jobseeker_is_org_blocked(text, uuid) to service_role;
grant execute on function hc_private.hc_jobseeker_is_scoutable_for_org(text, uuid) to service_role;
grant execute on function hc_private.hc_jobseeker_anonymous_scout_snapshot(text, uuid) to service_role;

create or replace function public.hc_jobseeker_get_scout_privacy()
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_clerk_user_id text := auth.jwt()->>'sub';
  v_scout_opt_in boolean;
  v_manual_blocks jsonb := '[]'::jsonb;
  v_automatic_blocks jsonb := '[]'::jsonb;
begin
  if coalesce(v_clerk_user_id, '') = '' then raise exception 'authentication required' using errcode = '42501'; end if;
  select coalesce((select s.scout_opt_in from public.hc_jobseeker_privacy_settings s where s.jobseeker_clerk_user_id = v_clerk_user_id), false) into v_scout_opt_in;
  select coalesce(jsonb_agg(jsonb_build_object('organization_id',o.id,'organization_name',o.name,'source','manual') order by o.name),'[]'::jsonb)
  into v_manual_blocks
  from public.hc_jobseeker_blocked_organizations b join public.ho_organizations o on o.id=b.organization_id
  where b.jobseeker_clerk_user_id=v_clerk_user_id;
  select coalesce(jsonb_agg(jsonb_build_object('organization_id',x.organization_id,'organization_name',x.organization_name,'source','current_employer') order by x.organization_name),'[]'::jsonb)
  into v_automatic_blocks
  from (
    select distinct m.organization_id,o.name organization_name
    from public.ho_people p join public.ho_facility_memberships m on m.person_id=p.id join public.ho_organizations o on o.id=m.organization_id
    where p.clerk_user_id=v_clerk_user_id and m.status='active'
      and (m.end_date is null or m.end_date>=current_date) and (m.ended_at is null or m.ended_at>now())
  ) x;
  return jsonb_build_object('scout_opt_in',v_scout_opt_in,'manual_blocks',v_manual_blocks,'automatic_blocks',v_automatic_blocks,'identity_fields_shared_before_consent',false);
end;
$$;

create or replace function public.hc_jobseeker_set_scout_opt_in(p_enabled boolean)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare v_clerk_user_id text := auth.jwt()->>'sub';
begin
  if coalesce(v_clerk_user_id,'')='' then raise exception 'authentication required' using errcode='42501'; end if;
  insert into public.hc_jobseeker_privacy_settings(jobseeker_clerk_user_id,scout_opt_in,updated_at)
  values(v_clerk_user_id,coalesce(p_enabled,false),now())
  on conflict(jobseeker_clerk_user_id) do update set scout_opt_in=excluded.scout_opt_in,updated_at=now();
  return coalesce(p_enabled,false);
end;
$$;

create or replace function public.hc_jobseeker_search_blockable_organizations(p_query text, p_limit integer default 10)
returns table(organization_id uuid, organization_name text) language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_clerk_user_id text := auth.jwt()->>'sub';
  v_query text := btrim(coalesce(p_query,''));
  v_limit integer := least(greatest(coalesce(p_limit,10),1),20);
begin
  if coalesce(v_clerk_user_id,'')='' then raise exception 'authentication required' using errcode='42501'; end if;
  if length(v_query)<2 then return; end if;
  return query select distinct o.id,o.name from public.ho_organizations o
  where o.status='active' and o.name ilike '%'||v_query||'%'
    and exists(select 1 from public.hc_jobs j where j.organization_id=o.id)
  order by o.name limit v_limit;
end;
$$;

create or replace function public.hc_jobseeker_add_blocked_organization(p_organization_id uuid)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare v_clerk_user_id text := auth.jwt()->>'sub';
begin
  if coalesce(v_clerk_user_id,'')='' then raise exception 'authentication required' using errcode='42501'; end if;
  if p_organization_id is null or not exists(
    select 1 from public.ho_organizations o where o.id=p_organization_id and o.status='active'
      and exists(select 1 from public.hc_jobs j where j.organization_id=o.id)
  ) then raise exception 'organization is not available for blocking' using errcode='22023'; end if;
  insert into public.hc_jobseeker_blocked_organizations(jobseeker_clerk_user_id,organization_id)
  values(v_clerk_user_id,p_organization_id) on conflict(jobseeker_clerk_user_id,organization_id) do nothing;
  return true;
end;
$$;

create or replace function public.hc_jobseeker_remove_blocked_organization(p_organization_id uuid)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare v_clerk_user_id text := auth.jwt()->>'sub';
begin
  if coalesce(v_clerk_user_id,'')='' then raise exception 'authentication required' using errcode='42501'; end if;
  delete from public.hc_jobseeker_blocked_organizations where jobseeker_clerk_user_id=v_clerk_user_id and organization_id=p_organization_id;
  return found;
end;
$$;

revoke all on function public.hc_jobseeker_get_scout_privacy() from public, anon;
revoke all on function public.hc_jobseeker_set_scout_opt_in(boolean) from public, anon;
revoke all on function public.hc_jobseeker_search_blockable_organizations(text, integer) from public, anon;
revoke all on function public.hc_jobseeker_add_blocked_organization(uuid) from public, anon;
revoke all on function public.hc_jobseeker_remove_blocked_organization(uuid) from public, anon;
grant execute on function public.hc_jobseeker_get_scout_privacy() to authenticated, service_role;
grant execute on function public.hc_jobseeker_set_scout_opt_in(boolean) to authenticated, service_role;
grant execute on function public.hc_jobseeker_search_blockable_organizations(text, integer) to authenticated, service_role;
grant execute on function public.hc_jobseeker_add_blocked_organization(uuid) to authenticated, service_role;
grant execute on function public.hc_jobseeker_remove_blocked_organization(uuid) to authenticated, service_role;

comment on function hc_private.hc_jobseeker_anonymous_scout_snapshot(text, uuid) is 'Anonymous scout projection: deliberately excludes name, kana, email, phone, Clerk ID, self introduction and employer identity. Returns null unless scout opt-in is enabled and the requesting organization is not manually or automatically blocked.';
