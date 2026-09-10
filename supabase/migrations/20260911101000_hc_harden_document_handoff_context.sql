create or replace function ho_private.hc_document_handoff_context_impl(p_document_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, ho_private, pg_temp
as $function$
declare
  d public.hc_application_documents%rowtype;
  a public.hc_applications%rowtype;
  s public.ho_staff_members%rowtype;
begin
  select * into d from public.hc_application_documents where id = p_document_id;
  if d.id is null then raise exception using errcode='P0002', message='COLOR_DOCUMENT_NOT_FOUND'; end if;

  if not ho_private.recruitment_can_write(d.facility_id) then
    raise exception using errcode='42501', message='COLOR_DOCUMENT_HANDOFF_FORBIDDEN';
  end if;
  if not ho_private.tenant_writes_allowed(d.organization_id, d.facility_id) then
    raise exception using errcode='42501', message='TENANT_READ_ONLY';
  end if;

  select * into a from public.hc_applications
  where id = d.application_id and organization_id = d.organization_id and facility_id = d.facility_id;
  if a.id is null then raise exception using errcode='P0002', message='COLOR_APPLICATION_NOT_FOUND'; end if;
  if a.hired_staff_id is null then raise exception using errcode='22023', message='COLOR_APPLICATION_NOT_HIRED'; end if;

  select * into s from public.ho_staff_members
  where id = a.hired_staff_id and organization_id = d.organization_id and facility_id = d.facility_id;
  if s.id is null then raise exception using errcode='P0002', message='COLOR_HIRED_STAFF_NOT_FOUND'; end if;

  return jsonb_build_object(
    'document_id', d.id,
    'organization_id', d.organization_id,
    'facility_id', d.facility_id,
    'application_id', d.application_id,
    'document_type', d.document_type,
    'title', d.title,
    'file_path', d.file_path,
    'mime_type', d.mime_type,
    'file_size', d.file_size,
    'transferred_staff_document_id', d.transferred_staff_document_id,
    'hired_staff_id', a.hired_staff_id,
    'applicant_name', a.applicant_name
  );
end;
$function$;

revoke all on function ho_private.hc_document_handoff_context_impl(uuid) from public, anon;
grant execute on function ho_private.hc_document_handoff_context_impl(uuid) to authenticated;

create or replace function public.hc_document_handoff_context(p_document_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = public, ho_private, pg_temp
as $function$
  select ho_private.hc_document_handoff_context_impl(p_document_id);
$function$;

revoke all on function public.hc_document_handoff_context(uuid) from public, anon;
grant execute on function public.hc_document_handoff_context(uuid) to authenticated;
