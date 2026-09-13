-- Harden reusable Document Vault source paths so the metadata row UUID and
-- Storage object UUID segment cannot diverge. This keeps Storage RLS source-link
-- checks aligned with the canonical client path jobseekers/<sub>/<document-uuid>/<filename>.

alter table public.hc_jobseeker_documents
  drop constraint if exists hc_jobseeker_documents_canonical_path_check;

alter table public.hc_jobseeker_documents
  add constraint hc_jobseeker_documents_canonical_path_check
  check (
    file_path like ('jobseekers/' || jobseeker_clerk_user_id || '/' || id::text || '/%')
    and coalesce(array_length(string_to_array(file_path, '/'), 1), 0) = 4
    and btrim(split_part(file_path, '/', 4)) <> ''
  );

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
  v_current_user text := nullif(auth.jwt()->>'sub','');
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
      join public.ho_facilities f on f.id=a.facility_id and f.organization_id=a.organization_id
      where a.id=v_application and a.organization_id=v_org and a.facility_id=v_facility
    );
end;
$$;

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

revoke all on function ho_private.color_application_document_object_can_read(text) from public, anon;
revoke all on function ho_private.color_application_document_object_can_write(text) from public, anon;
grant execute on function ho_private.color_application_document_object_can_read(text) to authenticated;
grant execute on function ho_private.color_application_document_object_can_write(text) to authenticated;

do $$
declare
  v_read text;
  v_write text;
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.hc_jobseeker_documents'::regclass
      and conname = 'hc_jobseeker_documents_canonical_path_check'
  ) then
    raise exception 'Document Vault canonical source-path constraint is missing';
  end if;

  select pg_get_functiondef(p.oid) into v_read
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='ho_private'
    and p.proname='color_application_document_object_can_read'
    and pg_get_function_identity_arguments(p.oid)='object_name text';

  select pg_get_functiondef(p.oid) into v_write
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='ho_private'
    and p.proname='color_application_document_object_can_write'
    and pg_get_function_identity_arguments(p.oid)='object_name text';

  if v_read is null or v_write is null
     or v_read !~ 'array_length\(parts, *1\).*<> *4'
     or v_write !~ 'array_length\(parts, *1\).*<> *4'
     or v_read !~ 'parts\[3\]::uuid'
     or v_write !~ 'parts\[3\]::uuid' then
    raise exception 'Document Vault canonical Storage path hardening is incomplete';
  end if;
end $$;
