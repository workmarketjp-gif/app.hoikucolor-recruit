-- Harden the candidate Document Vault -> application attachment handoff.
-- Candidate application-copy objects must use one deterministic path, belong to
-- the same candidate/application/source document, exist in private Storage, and
-- match the source object's byte size before metadata can be registered.

create or replace function ho_private.color_application_document_object_can_read(object_name text)
returns boolean
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare
  parts text[];
  v_org uuid;
  v_facility uuid;
  v_application uuid;
  v_source_document uuid;
  v_current_user text := nullif((select auth.jwt())->>'sub','');
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

    return true;
  end if;

  if coalesce(array_length(parts,1),0) < 5 then return false; end if;
  begin
    v_org := parts[1]::uuid;
    v_facility := parts[2]::uuid;
    v_application := parts[3]::uuid;
  exception when invalid_text_representation then
    return false;
  end;

  -- Before hc_application_documents metadata exists, permit the owning candidate
  -- to SELECT exactly the deterministic copied-object path. This lets the INSERT
  -- RLS policy verify that the Storage copy really exists without widening access
  -- to another candidate, another application, another source document or filename.
  if v_current_user is not null
     and coalesce(array_length(parts,1),0) = 5
     and parts[4] like 'vault-%' then
    begin
      v_source_document := substring(parts[4] from 7)::uuid;
    exception when invalid_text_representation then
      v_source_document := null;
    end;

    if v_source_document is not null
       and exists (
         select 1
         from public.hc_applications a
         join public.hc_jobseeker_documents d
           on d.id = v_source_document
          and d.jobseeker_clerk_user_id = v_current_user
         where a.id = v_application
           and a.organization_id = v_org
           and a.facility_id = v_facility
           and a.jobseeker_clerk_user_id = v_current_user
           and regexp_replace(d.file_path, '^.*/', '') = parts[5]
       ) then
      return true;
    end if;
  end if;

  -- Submitted copies stay readable by the owning candidate even after the source
  -- Vault row is later deleted and source_jobseeker_document_id becomes NULL.
  if v_current_user is not null
     and parts[4] like 'vault-%'
     and exists (
       select 1
       from public.hc_applications a
       join public.hc_application_documents d
         on d.application_id = a.id
        and d.organization_id = a.organization_id
        and d.facility_id = a.facility_id
        and d.file_path = object_name
       where a.id = v_application
         and a.organization_id = v_org
         and a.facility_id = v_facility
         and a.jobseeker_clerk_user_id = v_current_user
     ) then
    return true;
  end if;

  return ho_private.recruitment_can_read(v_facility)
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
$$;

revoke all on function ho_private.color_application_document_object_can_read(text) from public, anon;
grant execute on function ho_private.color_application_document_object_can_read(text) to authenticated;

drop policy if exists hc_application_documents_jobseeker_attach_own
  on public.hc_application_documents;

create policy hc_application_documents_jobseeker_attach_own
on public.hc_application_documents
for insert
to authenticated
with check (
  source_jobseeker_document_id is not null
  and uploaded_by_clerk_user_id = nullif((select auth.jwt())->>'sub', '')
  and coalesce(array_length(string_to_array(file_path, '/'), 1), 0) = 5
  and btrim(split_part(file_path, '/', 5)) <> ''
  and exists (
    select 1
    from public.hc_applications a
    join public.hc_jobseeker_documents d
      on d.id = hc_application_documents.source_jobseeker_document_id
    join storage.objects src
      on src.bucket_id = 'hc-application-documents'
     and src.name = d.file_path
    join storage.objects dst
      on dst.bucket_id = 'hc-application-documents'
     and dst.name = hc_application_documents.file_path
    where a.id = hc_application_documents.application_id
      and a.organization_id = hc_application_documents.organization_id
      and a.facility_id = hc_application_documents.facility_id
      and a.jobseeker_clerk_user_id = nullif((select auth.jwt())->>'sub', '')
      and d.jobseeker_clerk_user_id = nullif((select auth.jwt())->>'sub', '')
      and d.document_type = hc_application_documents.document_type
      and d.title = hc_application_documents.title
      and not (d.mime_type is distinct from hc_application_documents.mime_type)
      and not (d.file_size is distinct from hc_application_documents.file_size)
      and hc_application_documents.file_path = (
        a.organization_id::text || '/' || a.facility_id::text || '/' || a.id::text ||
        '/vault-' || d.id::text || '/' || regexp_replace(d.file_path, '^.*/', '')
      )
      and coalesce(src.metadata->>'size', '') ~ '^[0-9]+$'
      and coalesce(dst.metadata->>'size', '') ~ '^[0-9]+$'
      and (src.metadata->>'size')::bigint = (dst.metadata->>'size')::bigint
      and (d.file_size is null or (src.metadata->>'size')::bigint = d.file_size)
  )
);

create or replace function public.hc_register_jobseeker_document_attachment(
  p_document_id uuid,
  p_application_id uuid,
  p_destination_path text
)
returns public.hc_application_documents
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_user_id text := nullif((select auth.jwt())->>'sub', '');
  v_document public.hc_jobseeker_documents%rowtype;
  v_application public.hc_applications%rowtype;
  v_source_file_name text;
  v_expected_path text;
  v_result public.hc_application_documents%rowtype;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select * into v_document
  from public.hc_jobseeker_documents
  where id = p_document_id
    and jobseeker_clerk_user_id = v_user_id;
  if not found then
    raise exception 'document not found' using errcode = '42501';
  end if;

  select * into v_application
  from public.hc_applications
  where id = p_application_id
    and jobseeker_clerk_user_id = v_user_id;
  if not found then
    raise exception 'application not found' using errcode = '42501';
  end if;

  v_source_file_name := regexp_replace(coalesce(v_document.file_path, ''), '^.*/', '');
  if btrim(v_source_file_name) = '' then
    raise exception 'invalid source path' using errcode = '22023';
  end if;

  v_expected_path := v_application.organization_id::text || '/' ||
                     v_application.facility_id::text || '/' ||
                     v_application.id::text || '/vault-' ||
                     v_document.id::text || '/' || v_source_file_name;

  if p_destination_path is distinct from v_expected_path then
    raise exception 'invalid destination path' using errcode = '22023';
  end if;

  insert into public.hc_application_documents(
    organization_id,
    facility_id,
    application_id,
    document_type,
    title,
    file_path,
    mime_type,
    file_size,
    source_jobseeker_document_id,
    uploaded_by_clerk_user_id,
    uploaded_at
  ) values (
    v_application.organization_id,
    v_application.facility_id,
    v_application.id,
    v_document.document_type,
    v_document.title,
    p_destination_path,
    v_document.mime_type,
    v_document.file_size,
    v_document.id,
    v_user_id,
    v_document.uploaded_at
  )
  on conflict (application_id, source_jobseeker_document_id)
    where source_jobseeker_document_id is not null
  do nothing
  returning * into v_result;

  if not found then
    select * into v_result
    from public.hc_application_documents d
    where d.application_id = p_application_id
      and d.source_jobseeker_document_id = p_document_id;

    if not found or v_result.file_path is distinct from p_destination_path then
      raise exception 'attachment already exists with a different path'
        using errcode = '23505';
    end if;
  end if;

  return v_result;
end;
$$;

revoke all on function public.hc_register_jobseeker_document_attachment(uuid, uuid, text)
  from public, anon;
grant execute on function public.hc_register_jobseeker_document_attachment(uuid, uuid, text)
  to authenticated, service_role;
