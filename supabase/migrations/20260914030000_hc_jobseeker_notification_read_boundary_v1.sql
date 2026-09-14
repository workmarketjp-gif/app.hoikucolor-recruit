-- Candidate-only notification read model and acknowledgement boundary.
-- Keeps the shared facility notification RPCs intact for app.hoikupoppy.ai while ensuring
-- the jobseeker app can neither acknowledge facility notifications nor surface orphan targets.

create or replace function public.hc_jobseeker_list_notifications(p_limit integer default 30)
returns table(
  id uuid,
  application_id uuid,
  notification_type text,
  title text,
  body text,
  link_url text,
  read_at timestamptz,
  created_at timestamptz
)
language sql
security definer
set search_path to 'public','ho_private','pg_temp'
as $$
  select
    n.id,
    n.application_id,
    n.notification_type,
    n.title,
    n.body,
    n.link_url,
    n.read_at,
    n.created_at
  from public.hc_notifications n
  where n.audience = 'jobseeker'
    and n.recipient_clerk_user_id = ho_private.current_clerk_user_id()
    and (
      n.application_id is null
      or exists (
        select 1
        from public.hc_applications a
        where a.id = n.application_id
          and a.jobseeker_clerk_user_id = ho_private.current_clerk_user_id()
      )
    )
    and (
      n.notification_type <> 'scout_received'
      or exists (
        select 1
        from public.hc_scout_invitations s
        where s.recipient_clerk_user_id = ho_private.current_clerk_user_id()
          and n.event_key = 'jobseeker:scout:' || s.id::text || ':received'
      )
    )
    and (
      n.notification_type not in ('visit_confirmed','visit_declined','visit_cancelled','visit_completed','visit_no_show')
      or exists (
        select 1
        from public.hc_visit_reservations v
        where v.jobseeker_clerk_user_id = ho_private.current_clerk_user_id()
          and n.event_key like 'jobseeker:visit:' || v.id::text || ':%'
      )
    )
    and (
      n.notification_type not in ('spot_confirmed','spot_cancelled','spot_completed','spot_no_show')
      or exists (
        select 1
        from public.hc_spot_assignments s
        where s.jobseeker_clerk_user_id = ho_private.current_clerk_user_id()
          and n.event_key like 'jobseeker:spot:' || s.id::text || ':%'
      )
    )
  order by n.created_at desc
  limit greatest(1, least(coalesce(p_limit, 30), 100));
$$;

create or replace function public.hc_jobseeker_mark_notification_read(p_notification_id uuid)
returns boolean
language plpgsql
security definer
set search_path to 'public','ho_private','pg_temp'
as $$
begin
  update public.hc_notifications n
  set read_at = coalesce(n.read_at, now())
  where n.id = p_notification_id
    and n.audience = 'jobseeker'
    and n.recipient_clerk_user_id = ho_private.current_clerk_user_id();
  return found;
end;
$$;

create or replace function public.hc_jobseeker_mark_all_notifications_read()
returns integer
language plpgsql
security definer
set search_path to 'public','ho_private','pg_temp'
as $$
declare
  v_count integer;
begin
  update public.hc_notifications n
  set read_at = now()
  where n.read_at is null
    and n.audience = 'jobseeker'
    and n.recipient_clerk_user_id = ho_private.current_clerk_user_id();
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.hc_jobseeker_list_notifications(integer) from public, anon;
revoke all on function public.hc_jobseeker_mark_notification_read(uuid) from public, anon;
revoke all on function public.hc_jobseeker_mark_all_notifications_read() from public, anon;
grant execute on function public.hc_jobseeker_list_notifications(integer) to authenticated;
grant execute on function public.hc_jobseeker_mark_notification_read(uuid) to authenticated;
grant execute on function public.hc_jobseeker_mark_all_notifications_read() to authenticated;
