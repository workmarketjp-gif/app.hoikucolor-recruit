-- Speed up and harden Document Vault source-object checks.
--
-- Vault source objects use the canonical path:
--   jobseekers/<clerk-sub>/<document-uuid>/<filename>
-- Application-scoped copies persist the same UUID in
-- hc_application_documents.source_jobseeker_document_id. Use that canonical
-- foreign key instead of a leading-wildcard file_path scan when Storage RLS
-- decides whether the candidate may overwrite/delete a source object.

create index if not exists hc_application_documents_source_jobseeker_document_idx
  on public.hc_application_documents(source_jobseeker_document_id)
  where source_jobseeker_document_id is not null;

create or replace function ho_private.color_application_document_object_can_write(object_name text)
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
  v_current_user text := nullif(auth.jwt()->>'sub','');
  v_owner_application boolean := false;
begin
  parts := string_to_array(coalesce(object_name,''), '/');

  if coalesce(array_length(parts,1),0) >= 4 and parts[1] = 'jobseekers' then
    if v_current_user is null or parts[2] <> v_current_user then
      return false;
    end if;

    begin
      v_source_document := parts[3]::uuid;
    exception when invalid_text_representation then
      return false;
    end;

    return not exists (
      select 1
      from public.hc_application_documents d
      where d.source_jobseeker_document_id = v_source_document
    );
  end if;

  if coalesce(array_length(parts,1),0) < 4 then return false; end if;
  begin
    v_org := parts[1]::uuid;
    v_facility := parts[2]::uuid;
    v_application := parts[3]::uuid;
  exception when invalid_text_representation then return false;
  end;

  if v_current_user is not null
     and coalesce(array_length(parts,1),0) >= 5
     and parts[4] like 'vault-%' then
    select exists (
      select 1 from public.hc_applications a
      where a.id=v_application
        and a.organization_id=v_org
        and a.facility_id=v_facility
        and a.jobseeker_clerk_user_id=v_current_user
    ) into v_owner_application;

    if v_owner_application then
      -- Candidates may create the application-scoped evidence copy exactly
      -- once. Once present, overwrite/delete stays denied so a submitted copy
      -- cannot be silently replaced after the facility received it.
      return not exists (
        select 1
        from storage.objects o
        where o.bucket_id = 'hc-application-documents'
          and o.name = object_name
      );
    end if;
  end if;

  return ho_private.recruitment_can_write(v_facility)
    and ho_private.tenant_writes_allowed(v_org, v_facility)
    and exists (
      select 1
      from public.hc_applications a
      join public.ho_facilities f on f.id=a.facility_id and f.organization_id=a.organization_id
      where a.id=v_application and a.organization_id=v_org and a.facility_id=v_facility
    );
end;
$$;

revoke all on function ho_private.color_application_document_object_can_write(text) from public, anon;
grant execute on function ho_private.color_application_document_object_can_write(text) to authenticated;

do $$
declare
  v_definition text;
begin
  if not exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'hc_application_documents'
      and indexname = 'hc_application_documents_source_jobseeker_document_idx'
  ) then
    raise exception 'Document Vault source-document index is missing';
  end if;

  select pg_get_functiondef(p.oid)
    into v_definition
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'ho_private'
    and p.proname = 'color_application_document_object_can_write'
    and pg_get_function_identity_arguments(p.oid) = 'object_name text';

  if v_definition is null
     or v_definition !~ 'source_jobseeker_document_id[[:space:]]*=[[:space:]]*v_source_document'
     or v_definition !~ 'parts\\[3\\]::uuid'
     or lower(v_definition) like '%d.file_path like%' then
    raise exception 'Document Vault source-object lookup hardening is incomplete';
  end if;
end $$;
