create or replace function public.hc_jobseeker_get_scout_privacy()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_clerk_user_id text := auth.jwt()->>'sub';
  v_scout_opt_in boolean;
  v_manual_blocks jsonb := '[]'::jsonb;
  v_automatic_blocks jsonb := '[]'::jsonb;
begin
  if coalesce(v_clerk_user_id, '') = '' then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select coalesce((
    select s.scout_opt_in
    from public.hc_jobseeker_privacy_settings s
    where s.jobseeker_clerk_user_id = v_clerk_user_id
  ), false)
  into v_scout_opt_in;

  select coalesce(jsonb_agg(jsonb_build_object(
    'organization_id', o.id,
    'organization_name', o.name,
    'source', 'manual'
  ) order by o.name), '[]'::jsonb)
  into v_manual_blocks
  from public.hc_jobseeker_blocked_organizations b
  join public.ho_organizations o on o.id = b.organization_id
  where b.jobseeker_clerk_user_id = v_clerk_user_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'organization_id', x.organization_id,
    'organization_name', x.organization_name,
    'source', 'current_employer'
  ) order by x.organization_name), '[]'::jsonb)
  into v_automatic_blocks
  from (
    select distinct m.organization_id, o.name as organization_name
    from public.ho_people p
    join public.ho_facility_memberships m on m.person_id = p.id
    join public.ho_organizations o on o.id = m.organization_id
    where p.clerk_user_id = v_clerk_user_id
      and m.status = 'active'
      and (m.end_date is null or m.end_date >= current_date)
      and (m.ended_at is null or m.ended_at > now())
  ) x;

  return jsonb_build_object(
    'scout_opt_in', v_scout_opt_in,
    'manual_blocks', v_manual_blocks,
    'automatic_blocks', v_automatic_blocks,
    'identity_fields_shared_before_consent', false
  );
end;
$$;

revoke all on function public.hc_jobseeker_get_scout_privacy() from public, anon;
grant execute on function public.hc_jobseeker_get_scout_privacy() to authenticated, service_role;
