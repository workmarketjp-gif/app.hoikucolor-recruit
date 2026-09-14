-- Serialize Document Vault metadata registration against stale-orphan cleanup.
-- Registration and candidate cleanup take the same transaction advisory lock per
-- Storage object. Registration also locks the storage.objects row until metadata
-- is durable, so an orphan delete cannot race between existence-check and insert.

create or replace function ho_private.color_document_object_xact_lock(p_object_name text)
returns void
language plpgsql
volatile
security definer
set search_path = public, ho_private, pg_temp
as $function$
begin
  if btrim(coalesce(p_object_name, '')) = '' then
    raise exception 'invalid object name' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('hc-color-document:' || p_object_name, 0)
  );
end;
$function$;

revoke all on function ho_private.color_document_object_xact_lock(text) from public, anon, authenticated;

create or replace function public.hc_register_jobseeker_document_source(
  p_document_id uuid,
  p_document_type text,
  p_title text,
  p_file_path text,
  p_mime_type text,
  p_file_size bigint
)
returns public.hc_jobseeker_documents
language plpgsql
security definer
set search_path = public, ho_private, pg_temp
as $function$
declare
  v_user_id text := nullif((select auth.jwt())->>'sub','');
  v_parts text[];
  v_storage_object_id uuid;
  v_result public.hc_jobseeker_documents%rowtype;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  v_parts := string_to_array(coalesce(p_file_path,''), '/');
  if coalesce(array_length(v_parts,1),0) <> 4
     or v_parts[1] <> 'jobseekers'
     or v_parts[2] <> v_user_id
     or v_parts[3] <> p_document_id::text
     or btrim(coalesce(v_parts[4],'')) = '' then
    raise exception 'invalid source path' using errcode = '22023';
  end if;

  if p_document_type not in ('resume','work_history','nursery_teacher_license','kindergarten_license','other') then
    raise exception 'invalid document type' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_title,''))) < 1 or char_length(btrim(p_title)) > 200 then
    raise exception 'invalid title' using errcode = '22023';
  end if;
  if p_mime_type not in ('application/pdf','image/jpeg','image/png') then
    raise exception 'invalid mime type' using errcode = '22023';
  end if;
  if p_file_size is null or p_file_size < 1 or p_file_size > 10485760 then
    raise exception 'invalid file size' using errcode = '22023';
  end if;

  perform ho_private.color_document_object_xact_lock(p_file_path);

  select o.id into v_storage_object_id
  from storage.objects o
  where o.bucket_id = 'hc-application-documents'
    and o.name = p_file_path
  for update;

  if v_storage_object_id is null then
    raise exception 'storage object missing' using errcode = '55000';
  end if;

  insert into public.hc_jobseeker_documents(
    id, jobseeker_clerk_user_id, document_type, title, file_path, mime_type, file_size, is_default
  ) values (
    p_document_id, v_user_id, p_document_type, btrim(p_title), p_file_path, p_mime_type, p_file_size, false
  )
  on conflict (id) do nothing
  returning * into v_result;

  if not found then
    select * into v_result
    from public.hc_jobseeker_documents d
    where d.id = p_document_id
      and d.jobseeker_clerk_user_id = v_user_id;

    if not found
       or v_result.file_path is distinct from p_file_path
       or v_result.document_type is distinct from p_document_type then
      raise exception 'document already exists with different metadata' using errcode = '23505';
    end if;
  end if;

  return v_result;
end;
$function$;

revoke all on function public.hc_register_jobseeker_document_source(uuid, text, text, text, text, bigint) from public, anon;
grant execute on function public.hc_register_jobseeker_document_source(uuid, text, text, text, text, bigint) to authenticated, service_role;

create or replace function public.hc_register_jobseeker_document_attachment(
  p_document_id uuid,
  p_application_id uuid,
  p_destination_path text
)
returns public.hc_application_documents
language plpgsql
security definer
set search_path = public, ho_private, pg_temp
as $function$
declare
  v_user_id text := nullif((select auth.jwt())->>'sub', '');
  v_document public.hc_jobseeker_documents%rowtype;
  v_application public.hc_applications%rowtype;
  v_source_file_name text;
  v_expected_path text;
  v_storage_object_id uuid;
  v_result public.hc_application_documents%rowtype;
begin
  if v_user_id is null then raise exception 'authentication required' using errcode = '42501'; end if;

  select * into v_document
  from public.hc_jobseeker_documents
  where id = p_document_id and jobseeker_clerk_user_id = v_user_id
  for share;
  if not found then raise exception 'document not found' using errcode = '42501'; end if;

  select * into v_application
  from public.hc_applications
  where id = p_application_id and jobseeker_clerk_user_id = v_user_id
  for share;
  if not found then raise exception 'application not found' using errcode = '42501'; end if;

  v_source_file_name := regexp_replace(coalesce(v_document.file_path, ''), '^.*/', '');
  if btrim(v_source_file_name) = '' then raise exception 'invalid source path' using errcode = '22023'; end if;

  v_expected_path := v_application.organization_id::text || '/' || v_application.facility_id::text || '/' || v_application.id::text || '/vault-' || v_document.id::text || '/' || v_source_file_name;
  if p_destination_path is distinct from v_expected_path then
    raise exception 'invalid destination path' using errcode = '22023';
  end if;

  perform ho_private.color_document_object_xact_lock(p_destination_path);

  select o.id into v_storage_object_id
  from storage.objects o
  where o.bucket_id = 'hc-application-documents'
    and o.name = p_destination_path
  for update;

  if v_storage_object_id is null then
    raise exception 'storage object missing' using errcode = '55000';
  end if;

  insert into public.hc_application_documents(
    organization_id, facility_id, application_id, document_type, title, file_path,
    mime_type, file_size, source_jobseeker_document_id, uploaded_by_clerk_user_id, uploaded_at
  ) values (
    v_application.organization_id, v_application.facility_id, v_application.id,
    v_document.document_type, v_document.title, p_destination_path,
    v_document.mime_type, v_document.file_size, v_document.id, v_user_id, v_document.uploaded_at
  )
  on conflict (application_id, source_jobseeker_document_id) where source_jobseeker_document_id is not null
  do nothing
  returning * into v_result;

  if not found then
    select * into v_result
    from public.hc_application_documents d
    where d.application_id = p_application_id
      and d.source_jobseeker_document_id = p_document_id;
    if not found or v_result.file_path is distinct from p_destination_path then
      raise exception 'attachment already exists with a different path' using errcode = '23505';
    end if;
  end if;

  return v_result;
end;
$function$;

revoke all on function public.hc_register_jobseeker_document_attachment(uuid, uuid, text) from public, anon;
grant execute on function public.hc_register_jobseeker_document_attachment(uuid, uuid, text) to authenticated, service_role;

create or replace function ho_private.color_application_document_object_can_delete(object_name text)
returns boolean
language plpgsql
volatile
security definer
set search_path = public, ho_private, pg_temp
as $function$
declare
  parts text[];
  v_org uuid;
  v_facility uuid;
  v_application uuid;
  v_source_document uuid;
  v_current_user text := nullif((select auth.jwt())->>'sub','');
  v_owner_application boolean := false;
begin
  parts := string_to_array(coalesce(object_name,''), '/');

  if coalesce(array_length(parts,1),0) >= 1 and parts[1] = 'jobseekers' then
    if coalesce(array_length(parts,1),0) <> 4
       or v_current_user is null
       or parts[2] <> v_current_user
       or btrim(coalesce(parts[4],'')) = '' then
      return false;
    end if;

    begin
      v_source_document := parts[3]::uuid;
    exception when invalid_text_representation then
      return false;
    end;

    perform ho_private.color_document_object_xact_lock(object_name);

    return not exists (
      select 1
      from public.hc_jobseeker_documents d
      where d.id = v_source_document
        and d.jobseeker_clerk_user_id = v_current_user
        and d.file_path = object_name
    ) or exists (
      select 1
      from ho_private.hc_jobseeker_document_delete_intents i
      where i.document_id = v_source_document
        and i.jobseeker_clerk_user_id = v_current_user
        and i.file_path = object_name
    );
  end if;

  if coalesce(array_length(parts,1),0) < 4 then
    return false;
  end if;

  begin
    v_org := parts[1]::uuid;
    v_facility := parts[2]::uuid;
    v_application := parts[3]::uuid;
  exception when invalid_text_representation then
    return false;
  end;

  if v_current_user is not null
     and coalesce(array_length(parts,1),0) = 5
     and parts[4] like 'vault-%' then
    perform ho_private.color_document_object_xact_lock(object_name);

    select exists (
      select 1
      from public.hc_applications a
      where a.id = v_application
        and a.organization_id = v_org
        and a.facility_id = v_facility
        and a.jobseeker_clerk_user_id = v_current_user
    ) into v_owner_application;

    if v_owner_application then
      return not exists (
        select 1
        from public.hc_application_documents d
        where d.application_id = v_application
          and d.organization_id = v_org
          and d.facility_id = v_facility
          and d.file_path = object_name
      );
    end if;
  end if;

  return ho_private.recruitment_can_write(v_facility)
    and ho_private.tenant_writes_allowed(v_org, v_facility)
    and exists (
      select 1
      from public.hc_applications a
      join public.ho_facilities f
        on f.id = a.facility_id
       and f.organization_id = a.organization_id
      where a.id = v_application
        and a.organization_id = v_org
        and a.facility_id = v_facility
    );
end;
$function$;

revoke all on function ho_private.color_application_document_object_can_delete(text) from public, anon;
grant execute on function ho_private.color_application_document_object_can_delete(text) to authenticated, service_role;
