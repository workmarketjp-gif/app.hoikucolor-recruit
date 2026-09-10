create or replace function ho_private.hc_email_outbox_summary_impl(p_facility_id uuid)
returns jsonb language plpgsql stable security definer
set search_path=public,vault,ho_private,pg_temp as $function$
declare v_runtime_enabled boolean:=false; v_sender_configured boolean:=false; v_secret_configured boolean:=false;
begin
  if not ho_private.recruitment_can_read(p_facility_id) then raise exception using errcode='42501',message='RECRUITMENT_FORBIDDEN'; end if;
  select coalesce(r.enabled,false) into v_runtime_enabled from public.hc_email_dispatch_runtime r where r.singleton=true;
  select exists(select 1 from vault.decrypted_secrets s where s.name='hc_email_from' and nullif(trim(s.decrypted_secret),'') is not null) into v_sender_configured;
  select exists(select 1 from vault.decrypted_secrets s where s.name='hc_email_dispatch_secret' and nullif(trim(s.decrypted_secret),'') is not null) into v_secret_configured;
  return (select jsonb_build_object('pending',count(*) filter(where q.status='pending'),'failed',count(*) filter(where q.status='failed'),'sent',count(*) filter(where q.status='sent'),'oldestPendingAt',min(q.created_at) filter(where q.status in ('pending','failed')),'runtimeEnabled',v_runtime_enabled,'senderConfigured',v_sender_configured,'dispatchSecretConfigured',v_secret_configured,'deliveryReady',v_runtime_enabled and v_sender_configured and v_secret_configured) from public.hc_email_outbox q where q.facility_id=p_facility_id);
end;$function$;
revoke all on function ho_private.hc_email_outbox_summary_impl(uuid) from public,anon;
grant execute on function ho_private.hc_email_outbox_summary_impl(uuid) to authenticated;
create or replace function public.hc_email_outbox_summary(p_facility_id uuid) returns jsonb language sql stable security invoker set search_path=public,vault,ho_private,pg_temp as $function$ select ho_private.hc_email_outbox_summary_impl(p_facility_id); $function$;
revoke all on function public.hc_email_outbox_summary(uuid) from public,anon; grant execute on function public.hc_email_outbox_summary(uuid) to authenticated;

create or replace function ho_private.hc_email_worker_status_impl(p_facility_id uuid) returns jsonb language plpgsql stable security definer set search_path=public,ho_private,pg_temp as $function$
begin
  if not ho_private.recruitment_can_read(p_facility_id) then raise exception using errcode='42501',message='RECRUITMENT_FORBIDDEN'; end if;
  return (select jsonb_build_object('enabled',r.enabled,'lastHealthAt',r.last_health_at,'lastDispatchAt',r.last_dispatch_at,'lastErrorCode',r.last_error_code) from public.hc_email_dispatch_runtime r where r.singleton=true);
end;$function$;
revoke all on function ho_private.hc_email_worker_status_impl(uuid) from public,anon; grant execute on function ho_private.hc_email_worker_status_impl(uuid) to authenticated;
create or replace function public.hc_email_worker_status(p_facility_id uuid) returns jsonb language sql stable security invoker set search_path=public,ho_private,pg_temp as $function$ select ho_private.hc_email_worker_status_impl(p_facility_id); $function$;
revoke all on function public.hc_email_worker_status(uuid) from public,anon; grant execute on function public.hc_email_worker_status(uuid) to authenticated;

create or replace function ho_private.hc_mark_notification_read_impl(p_notification_id uuid) returns boolean language plpgsql security definer set search_path=public,ho_private,pg_temp as $function$
begin
  update public.hc_notifications n set read_at=coalesce(n.read_at,now()) where n.id=p_notification_id and n.recipient_clerk_user_id=ho_private.current_clerk_user_id() and ho_private.recruitment_can_read(n.facility_id);
  return found;
end;$function$;
revoke all on function ho_private.hc_mark_notification_read_impl(uuid) from public,anon; grant execute on function ho_private.hc_mark_notification_read_impl(uuid) to authenticated;
create or replace function public.hc_mark_notification_read(p_notification_id uuid) returns boolean language sql security invoker set search_path=public,ho_private,pg_temp as $function$ select ho_private.hc_mark_notification_read_impl(p_notification_id); $function$;
revoke all on function public.hc_mark_notification_read(uuid) from public,anon; grant execute on function public.hc_mark_notification_read(uuid) to authenticated;

create or replace function ho_private.hc_retry_failed_emails_impl(p_facility_id uuid) returns integer language plpgsql security definer set search_path=public,ho_private,pg_temp as $function$
declare v_count integer;
begin
  if not ho_private.recruitment_can_write(p_facility_id) then raise exception using errcode='42501',message='RECRUITMENT_FORBIDDEN'; end if;
  update public.hc_email_outbox q set status='pending',next_attempt_at=now(),last_error=null,claimed_at=null,claimed_by=null,updated_at=now() where q.facility_id=p_facility_id and q.status='failed' and q.attempts<5;
  get diagnostics v_count=row_count; return v_count;
end;$function$;
revoke all on function ho_private.hc_retry_failed_emails_impl(uuid) from public,anon; grant execute on function ho_private.hc_retry_failed_emails_impl(uuid) to authenticated;
create or replace function public.hc_retry_failed_emails(p_facility_id uuid) returns integer language sql security invoker set search_path=public,ho_private,pg_temp as $function$ select ho_private.hc_retry_failed_emails_impl(p_facility_id); $function$;
revoke all on function public.hc_retry_failed_emails(uuid) from public,anon; grant execute on function public.hc_retry_failed_emails(uuid) to authenticated;
