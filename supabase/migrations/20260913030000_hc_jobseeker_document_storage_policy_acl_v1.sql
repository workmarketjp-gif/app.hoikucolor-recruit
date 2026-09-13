-- Keep the private hc-application-documents Storage authorization helpers in
-- sync with the production candidate/facility contract and restore the
-- authenticated execution privilege required when Storage RLS evaluates them.
--
-- Source objects are readable/writable only under jobseekers/<current-sub>/...
-- Submitted vault copies are readable only when a registered application
-- document belongs to the current candidate's application. A candidate may
-- create an application-scoped vault object once; once present it cannot be
-- overwritten or deleted by the candidate. Facility access remains governed by
-- the existing recruitment tenant authorization functions.

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
  v_current_user text := nullif(auth.jwt()->>'sub','');
begin
  parts := string_to_array(coalesce(object_name,''), '/');

  if coalesce(array_length(parts,1),0) >= 4 and parts[1] = 'jobseekers' then
    return v_current_user is not null and parts[2] = v_current_user;
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
  v_current_user text := nullif(auth.jwt()->>'sub','');
  v_owner_application boolean := false;
begin
  parts := string_to_array(coalesce(object_name,''), '/');

  if coalesce(array_length(parts,1),0) >= 4 and parts[1] = 'jobseekers' then
    return v_current_user is not null
      and parts[2] = v_current_user
      and not exists (
        select 1
        from public.hc_application_documents d
        where d.source_jobseeker_document_id is not null
          and d.file_path like ('%/vault-' || split_part(object_name,'/',3) || '/%')
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
