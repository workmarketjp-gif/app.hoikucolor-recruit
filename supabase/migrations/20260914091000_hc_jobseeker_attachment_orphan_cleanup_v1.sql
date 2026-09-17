-- Allow a jobseeker to clean up only an unregistered application-copy object.
-- Registered application documents remain immutable, while source document deletion
-- keeps the existing guard that blocks deletion while a submitted copy still points
-- at the source metadata row.

create or replace function ho_private.color_application_document_object_can_delete(object_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
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

    return not exists (
      select 1
      from public.hc_application_documents d
      where d.source_jobseeker_document_id = v_source_document
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
    select exists (
      select 1
      from public.hc_applications a
      where a.id = v_application
        and a.organization_id = v_org
        and a.facility_id = v_facility
        and a.jobseeker_clerk_user_id = v_current_user
    ) into v_owner_application;

    if v_owner_application then
      -- The candidate may delete a copy only before it becomes a submitted
      -- application-document record. Once registered, the immutable copy survives
      -- later Vault deletion and is readable from the application history.
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

  -- Preserve the existing facility-side delete contract for non-candidate paths.
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

alter policy hc_application_documents_storage_delete
on storage.objects
using (
  bucket_id = 'hc-application-documents'
  and ho_private.color_application_document_object_can_delete(name)
);
