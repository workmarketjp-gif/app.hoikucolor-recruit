-- Make Document Vault source deletion recoverable across Storage/network failures.
-- A candidate first creates an owner-bound delete intent, then removes the private
-- Storage object, then finalizes metadata deletion only after Postgres confirms the
-- object is gone. Existing clients using hc_delete_jobseeker_document remain valid.

create table if not exists ho_private.hc_jobseeker_document_delete_intents (
  document_id uuid primary key references public.hc_jobseeker_documents(id) on delete cascade,
  jobseeker_clerk_user_id text not null,
  file_path text not null unique,
  created_at timestamptz not null default now()
);

revoke all on table ho_private.hc_jobseeker_document_delete_intents from public, anon, authenticated;

create or replace function public.hc_prepare_jobseeker_document_delete(p_document_id uuid)
returns text
language plpgsql
security definer
set search_path = public, ho_private, pg_temp
as $function$
declare
  v_user_id text := nullif((select auth.jwt())->>'sub','');
  v_file_path text;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select d.file_path into v_file_path
  from public.hc_jobseeker_documents d
  where d.id = p_document_id
    and d.jobseeker_clerk_user_id = v_user_id;

  if v_file_path is null then
    raise exception 'document not found' using errcode = '42501';
  end if;

  insert into ho_private.hc_jobseeker_document_delete_intents(
    document_id,
    jobseeker_clerk_user_id,
    file_path,
    created_at
  ) values (
    p_document_id,
    v_user_id,
    v_file_path,
    now()
  )
  on conflict (document_id) do update
  set jobseeker_clerk_user_id = excluded.jobseeker_clerk_user_id,
      file_path = excluded.file_path,
      created_at = now();

  return v_file_path;
end;
$function$;

revoke all on function public.hc_prepare_jobseeker_document_delete(uuid) from public, anon;
grant execute on function public.hc_prepare_jobseeker_document_delete(uuid) to authenticated;

create or replace function public.hc_finalize_jobseeker_document_delete(
  p_document_id uuid,
  p_file_path text
)
returns boolean
language plpgsql
security definer
set search_path = public, ho_private, pg_temp
as $function$
declare
  v_user_id text := nullif((select auth.jwt())->>'sub','');
  v_deleted uuid;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from ho_private.hc_jobseeker_document_delete_intents i
    where i.document_id = p_document_id
      and i.jobseeker_clerk_user_id = v_user_id
      and i.file_path = p_file_path
  ) then
    raise exception 'delete intent not found' using errcode = '42501';
  end if;

  if exists (
    select 1
    from storage.objects o
    where o.bucket_id = 'hc-application-documents'
      and o.name = p_file_path
  ) then
    raise exception 'storage object still exists' using errcode = '55000';
  end if;

  delete from public.hc_jobseeker_documents d
  where d.id = p_document_id
    and d.jobseeker_clerk_user_id = v_user_id
    and d.file_path = p_file_path
  returning d.id into v_deleted;

  if v_deleted is null then
    delete from ho_private.hc_jobseeker_document_delete_intents i
    where i.document_id = p_document_id
      and i.jobseeker_clerk_user_id = v_user_id
      and i.file_path = p_file_path;
    return true;
  end if;

  return true;
end;
$function$;

revoke all on function public.hc_finalize_jobseeker_document_delete(uuid, text) from public, anon;
grant execute on function public.hc_finalize_jobseeker_document_delete(uuid, text) to authenticated;

create or replace function ho_private.color_application_document_object_can_delete(object_name text)
returns boolean
language plpgsql
stable
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

    -- Backward-compatible orphan cleanup remains allowed when metadata no longer
    -- exists. A live Vault object requires an explicit owner-bound delete intent.
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

alter policy hc_application_documents_storage_delete
on storage.objects
using (
  bucket_id = 'hc-application-documents'
  and ho_private.color_application_document_object_can_delete(name)
);
