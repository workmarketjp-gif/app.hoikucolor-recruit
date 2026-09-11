-- Keep Hoiku Color reusable applicant documents compatible with the canonical Hoiku Office staff-document store.
-- Also preserve an applicant's read access to the immutable application copy after the reusable vault source is deleted.

update storage.buckets
set allowed_mime_types = array['application/pdf','image/jpeg','image/png']::text[]
where id = 'hc-application-documents';

alter table public.hc_jobseeker_documents
  drop constraint if exists hc_jobseeker_documents_mime_type_handoff_check;
alter table public.hc_jobseeker_documents
  add constraint hc_jobseeker_documents_mime_type_handoff_check
  check (mime_type is null or mime_type in ('application/pdf','image/jpeg','image/png'));

alter table public.hc_application_documents
  drop constraint if exists hc_application_documents_mime_type_handoff_check;
alter table public.hc_application_documents
  add constraint hc_application_documents_mime_type_handoff_check
  check (mime_type is null or mime_type in ('application/pdf','image/jpeg','image/png'));

-- A submitted /vault-... application copy is immutable evidence for that application.
-- The reusable source FK intentionally becomes NULL when the user removes the source from their vault,
-- so read access must be based on application ownership + immutable submitted path, not FK survival.
drop policy if exists hc_application_documents_jobseeker_select_own on public.hc_application_documents;
create policy hc_application_documents_jobseeker_select_own
on public.hc_application_documents
for select to authenticated
using (
  file_path like (
    organization_id::text || '/' || facility_id::text || '/' || application_id::text || '/vault-%/%'
  )
  and exists (
    select 1
    from public.hc_applications a
    where a.id = hc_application_documents.application_id
      and a.organization_id = hc_application_documents.organization_id
      and a.facility_id = hc_application_documents.facility_id
      and a.jobseeker_clerk_user_id = nullif(auth.jwt()->>'sub','')
  )
);

-- Re-state the storage read helper so the same invariant protects object access.
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
revoke all on function ho_private.color_application_document_object_can_read(text) from public, anon, authenticated;
