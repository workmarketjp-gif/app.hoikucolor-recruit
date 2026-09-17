-- Safely reconcile stale Document Vault Storage objects that never obtained canonical metadata.
-- The candidate only receives paths they own, older than one hour, and currently unregistered.
-- Storage DELETE RLS re-checks ownership/metadata at delete time, closing the list/delete TOCTOU window.

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

  if not exists (
    select 1
    from storage.objects o
    where o.bucket_id = 'hc-application-documents'
      and o.name = p_file_path
  ) then
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
  v_result public.hc_application_documents%rowtype;
begin
  if v_user_id is null then raise exception 'authentication required' using errcode = '42501'; end if;

  select * into v_document
  from public.hc_jobseeker_documents
  where id = p_document_id and jobseeker_clerk_user_id = v_user_id;
  if not found then raise exception 'document not found' using errcode = '42501'; end if;

  select * into v_application
  from public.hc_applications
  where id = p_application_id and jobseeker_clerk_user_id = v_user_id;
  if not found then raise exception 'application not found' using errcode = '42501'; end if;

  v_source_file_name := regexp_replace(coalesce(v_document.file_path, ''), '^.*/', '');
  if btrim(v_source_file_name) = '' then raise exception 'invalid source path' using errcode = '22023'; end if;

  v_expected_path := v_application.organization_id::text || '/' || v_application.facility_id::text || '/' || v_application.id::text || '/vault-' || v_document.id::text || '/' || v_source_file_name;
  if p_destination_path is distinct from v_expected_path then
    raise exception 'invalid destination path' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from storage.objects o
    where o.bucket_id = 'hc-application-documents'
      and o.name = p_destination_path
  ) then
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

create or replace function public.hc_jobseeker_list_stale_document_orphans()
returns table(file_path text)
language plpgsql
stable
security definer
set search_path = public, ho_private, pg_temp
as $function$
declare
  v_user_id text := nullif((select auth.jwt())->>'sub','');
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  return query
  with source_orphans as (
    select o.name as file_path, coalesce(o.updated_at, o.created_at) as touched_at
    from storage.objects o
    where o.bucket_id = 'hc-application-documents'
      and o.name like ('jobseekers/' || v_user_id || '/%')
      and coalesce(array_length(string_to_array(o.name, '/'), 1), 0) = 4
      and coalesce(o.updated_at, o.created_at) < now() - interval '1 hour'
      and not exists (
        select 1
        from public.hc_jobseeker_documents d
        where d.jobseeker_clerk_user_id = v_user_id
          and (d.file_path = o.name or d.id::text = split_part(o.name, '/', 3))
      )
  ),
  application_orphans as (
    select o.name as file_path, coalesce(o.updated_at, o.created_at) as touched_at
    from storage.objects o
    join public.hc_applications a
      on a.organization_id::text = split_part(o.name, '/', 1)
     and a.facility_id::text = split_part(o.name, '/', 2)
     and a.id::text = split_part(o.name, '/', 3)
     and a.jobseeker_clerk_user_id = v_user_id
    where o.bucket_id = 'hc-application-documents'
      and coalesce(array_length(string_to_array(o.name, '/'), 1), 0) = 5
      and split_part(o.name, '/', 4) like 'vault-%'
      and coalesce(o.updated_at, o.created_at) < now() - interval '1 hour'
      and not exists (
        select 1
        from public.hc_application_documents d
        where d.application_id = a.id
          and d.file_path = o.name
      )
  )
  select candidates.file_path
  from (
    select * from source_orphans
    union all
    select * from application_orphans
  ) candidates
  order by candidates.touched_at asc, candidates.file_path asc
  limit 50;
end;
$function$;

revoke all on function public.hc_jobseeker_list_stale_document_orphans() from public, anon;
grant execute on function public.hc_jobseeker_list_stale_document_orphans() to authenticated, service_role;
