-- Bind facility-side application messaging to the facility that is currently active in the browser.
-- Canonical message/thread business logic remains in the existing v2/v1 functions.

create or replace function public.hc_admin_get_or_create_message_thread_v3(
  p_facility_id uuid,
  p_application_id uuid
)
returns table(
  id uuid,
  application_id uuid,
  job_id uuid,
  created_at timestamptz,
  updated_at timestamptz,
  last_message_at timestamptz
)
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not exists (
    select 1
      from public.hc_applications a
     where a.id = p_application_id
       and a.facility_id = p_facility_id
  ) or not ho_private.recruitment_can_read(p_facility_id) then
    raise exception 'APPLICATION_FACILITY_MISMATCH' using errcode = '42501';
  end if;

  return query
  select * from public.hc_admin_get_or_create_message_thread_v2(p_application_id);
end;
$$;

create or replace function public.hc_admin_list_messages_v3(
  p_facility_id uuid,
  p_application_id uuid
)
returns table(
  id uuid,
  thread_id uuid,
  sender_role text,
  body text,
  created_at timestamptz
)
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not exists (
    select 1
      from public.hc_applications a
     where a.id = p_application_id
       and a.facility_id = p_facility_id
  ) or not ho_private.recruitment_can_read(p_facility_id) then
    raise exception 'APPLICATION_FACILITY_MISMATCH' using errcode = '42501';
  end if;

  return query
  select * from public.hc_admin_list_messages_v2(p_application_id);
end;
$$;

create or replace function public.hc_admin_send_message_v3(
  p_facility_id uuid,
  p_application_id uuid,
  p_body text
)
returns table(
  id uuid,
  thread_id uuid,
  sender_role text,
  body text,
  created_at timestamptz
)
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not exists (
    select 1
      from public.hc_applications a
     where a.id = p_application_id
       and a.facility_id = p_facility_id
  ) or not ho_private.recruitment_can_write(p_facility_id) then
    raise exception 'APPLICATION_FACILITY_MISMATCH' using errcode = '42501';
  end if;

  return query
  select * from public.hc_admin_send_message_v2(p_application_id, p_body);
end;
$$;

create or replace function public.hc_admin_mark_application_message_notifications_read_v2(
  p_facility_id uuid,
  p_application_id uuid
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not exists (
    select 1
      from public.hc_applications a
     where a.id = p_application_id
       and a.facility_id = p_facility_id
  ) or not ho_private.recruitment_can_read(p_facility_id) then
    raise exception 'APPLICATION_FACILITY_MISMATCH' using errcode = '42501';
  end if;

  return public.hc_admin_mark_application_message_notifications_read_v1(p_application_id);
end;
$$;

revoke all on function public.hc_admin_get_or_create_message_thread_v3(uuid, uuid) from public, anon, service_role;
revoke all on function public.hc_admin_list_messages_v3(uuid, uuid) from public, anon, service_role;
revoke all on function public.hc_admin_send_message_v3(uuid, uuid, text) from public, anon, service_role;
revoke all on function public.hc_admin_mark_application_message_notifications_read_v2(uuid, uuid) from public, anon, service_role;

grant execute on function public.hc_admin_get_or_create_message_thread_v3(uuid, uuid) to authenticated;
grant execute on function public.hc_admin_list_messages_v3(uuid, uuid) to authenticated;
grant execute on function public.hc_admin_send_message_v3(uuid, uuid, text) to authenticated;
grant execute on function public.hc_admin_mark_application_message_notifications_read_v2(uuid, uuid) to authenticated;
