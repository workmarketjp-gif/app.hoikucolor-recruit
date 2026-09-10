-- Hoiku Color reusable jobseeker document vault.
-- Production equivalent was applied as two additive migrations and verified before this consolidated source migration was committed.
-- Files remain in the existing private hc-application-documents bucket.
-- A reusable source object lives under jobseekers/<clerk_user_id>/<document_id>/...
-- When submitted to an application the Storage API copies the object to the application-scoped path,
-- preserving the existing facility document contract and preventing later source-file changes from mutating submitted evidence.

create table if not exists public.hc_jobseeker_documents (
  id uuid primary key default gen_random_uuid(),
  jobseeker_clerk_user_id text not null,
  document_type text not null check (document_type in ('resume','work_history','nursery_teacher_license','kindergarten_license','other')),
  title text not null check (char_length(btrim(title)) between 1 and 200),
  file_path text not null unique,
  mime_type text,
  file_size bigint check (file_size is null or (file_size > 0 and file_size <= 10485760)),
  is_default boolean not null default false,
  uploaded_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint hc_jobseeker_documents_owner_path_check check (file_path like ('jobseekers/' || jobseeker_clerk_user_id || '/%'))
);

create unique index if not exists hc_jobseeker_documents_one_default_per_type
  on public.hc_jobseeker_documents(jobseeker_clerk_user_id, document_type)
  where is_default;
create index if not exists hc_jobseeker_documents_owner_idx
  on public.hc_jobseeker_documents(jobseeker_clerk_user_id, uploaded_at desc);

alter table public.hc_jobseeker_documents enable row level security;
revoke all on public.hc_jobseeker_documents from public, anon;
grant select, insert, update, delete on public.hc_jobseeker_documents to authenticated;

drop policy if exists hc_jobseeker_documents_select_own on public.hc_jobseeker_documents;
create policy hc_jobseeker_documents_select_own on public.hc_jobseeker_documents
  for select to authenticated
  using (jobseeker_clerk_user_id = nullif(auth.jwt()->>'sub',''));
drop policy if exists hc_jobseeker_documents_insert_own on public.hc_jobseeker_documents;
create policy hc_jobseeker_documents_insert_own on public.hc_jobseeker_documents
  for insert to authenticated
  with check (jobseeker_clerk_user_id = nullif(auth.jwt()->>'sub',''));
drop policy if exists hc_jobseeker_documents_update_own on public.hc_jobseeker_documents;
create policy hc_jobseeker_documents_update_own on public.hc_jobseeker_documents
  for update to authenticated
  using (jobseeker_clerk_user_id = nullif(auth.jwt()->>'sub',''))
  with check (jobseeker_clerk_user_id = nullif(auth.jwt()->>'sub',''));
drop policy if exists hc_jobseeker_documents_delete_own on public.hc_jobseeker_documents;
create policy hc_jobseeker_documents_delete_own on public.hc_jobseeker_documents
  for delete to authenticated
  using (jobseeker_clerk_user_id = nullif(auth.jwt()->>'sub',''));

create or replace function ho_private.hc_jobseeker_document_integrity_guard()
returns trigger language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'UPDATE' then
    if new.id is distinct from old.id
       or new.jobseeker_clerk_user_id is distinct from old.jobseeker_clerk_user_id
       or new.file_path is distinct from old.file_path
       or new.uploaded_at is distinct from old.uploaded_at
       or new.created_at is distinct from old.created_at then
      raise exception 'jobseeker document identity and storage path are immutable';
    end if;
    new.updated_at := now();
  end if;
  return new;
end;
$$;
revoke all on function ho_private.hc_jobseeker_document_integrity_guard() from public, anon, authenticated;
drop trigger if exists hc_jobseeker_document_integrity_guard on public.hc_jobseeker_documents;
create trigger hc_jobseeker_document_integrity_guard
before update on public.hc_jobseeker_documents
for each row execute function ho_private.hc_jobseeker_document_integrity_guard();

alter table public.hc_application_documents
  add column if not exists source_jobseeker_document_id uuid references public.hc_jobseeker_documents(id) on delete set null;
create unique index if not exists hc_application_documents_source_once
  on public.hc_application_documents(application_id, source_jobseeker_document_id)
  where source_jobseeker_document_id is not null;

drop policy if exists hc_application_documents_jobseeker_select_own on public.hc_application_documents;
create policy hc_application_documents_jobseeker_select_own on public.hc_application_documents
  for select to authenticated
  using (
    source_jobseeker_document_id is not null
    and exists (
      select 1 from public.hc_applications a
      where a.id = hc_application_documents.application_id
        and a.organization_id = hc_application_documents.organization_id
        and a.facility_id = hc_application_documents.facility_id
        and a.jobseeker_clerk_user_id = nullif(auth.jwt()->>'sub','')
    )
  );

drop policy if exists hc_application_documents_jobseeker_attach_own on public.hc_application_documents;
create policy hc_application_documents_jobseeker_attach_own on public.hc_application_documents
  for insert to authenticated
  with check (
    source_jobseeker_document_id is not null
    and uploaded_by_clerk_user_id = nullif(auth.jwt()->>'sub','')
    and file_path like (
      organization_id::text || '/' || facility_id::text || '/' || application_id::text || '/vault-' || source_jobseeker_document_id::text || '/%'
    )
    and exists (
      select 1
      from public.hc_applications a
      join public.hc_jobseeker_documents d on d.id = hc_application_documents.source_jobseeker_document_id
      where a.id = hc_application_documents.application_id
        and a.organization_id = hc_application_documents.organization_id
        and a.facility_id = hc_application_documents.facility_id
        and a.jobseeker_clerk_user_id = nullif(auth.jwt()->>'sub','')
        and d.jobseeker_clerk_user_id = nullif(auth.jwt()->>'sub','')
        and d.document_type = hc_application_documents.document_type
        and d.title = hc_application_documents.title
        and d.mime_type is not distinct from hc_application_documents.mime_type
        and d.file_size is not distinct from hc_application_documents.file_size
    )
  );

create or replace function public.hc_register_jobseeker_document_attachment(
  p_document_id uuid,
  p_application_id uuid,
  p_destination_path text
)
returns public.hc_application_documents
language plpgsql security invoker
set search_path = public, pg_temp
as $$
declare
  v_user_id text := nullif(auth.jwt()->>'sub','');
  v_document public.hc_jobseeker_documents%rowtype;
  v_application public.hc_applications%rowtype;
  v_expected_prefix text;
  v_result public.hc_application_documents%rowtype;
begin
  if v_user_id is null then raise exception 'authentication required'; end if;

  select * into v_document from public.hc_jobseeker_documents
  where id = p_document_id and jobseeker_clerk_user_id = v_user_id;
  if not found then raise exception 'document not found'; end if;

  select * into v_application from public.hc_applications
  where id = p_application_id and jobseeker_clerk_user_id = v_user_id;
  if not found then raise exception 'application not found'; end if;

  v_expected_prefix := v_application.organization_id::text || '/' || v_application.facility_id::text || '/' || v_application.id::text || '/vault-' || v_document.id::text || '/';
  if p_destination_path is null or p_destination_path not like (v_expected_prefix || '%') then
    raise exception 'invalid destination path';
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
  do update set updated_at = now()
  returning * into v_result;

  return v_result;
end;
$$;
revoke all on function public.hc_register_jobseeker_document_attachment(uuid,uuid,text) from public, anon;
grant execute on function public.hc_register_jobseeker_document_attachment(uuid,uuid,text) to authenticated;

create or replace function public.hc_set_jobseeker_document_default(p_document_id uuid)
returns public.hc_jobseeker_documents
language plpgsql security invoker
set search_path = public, pg_temp
as $$
declare
  v_user_id text := nullif(auth.jwt()->>'sub','');
  v_document public.hc_jobseeker_documents%rowtype;
begin
  if v_user_id is null then raise exception 'authentication required'; end if;
  select * into v_document from public.hc_jobseeker_documents
  where id = p_document_id and jobseeker_clerk_user_id = v_user_id;
  if not found then raise exception 'document not found'; end if;

  update public.hc_jobseeker_documents set is_default = false
  where jobseeker_clerk_user_id = v_user_id
    and document_type = v_document.document_type
    and id <> v_document.id and is_default;
  update public.hc_jobseeker_documents set is_default = true
  where id = v_document.id returning * into v_document;
  return v_document;
end;
$$;
revoke all on function public.hc_set_jobseeker_document_default(uuid) from public, anon;
grant execute on function public.hc_set_jobseeker_document_default(uuid) to authenticated;

-- Extend the existing private Storage authorization helpers. Facility access to normal
-- application paths remains unchanged. Jobseekers can only read/write their own vault
-- source or their own /vault-... application copy. This does not expose the bucket.
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

  if coalesce(array_length(parts,1),0) < 4 then return false; end if;
  begin
    v_org := parts[1]::uuid;
    v_facility := parts[2]::uuid;
    v_application := parts[3]::uuid;
  exception when invalid_text_representation then return false;
  end;

  if v_current_user is not null and coalesce(array_length(parts,1),0) >= 5 and parts[4] like 'vault-%'
     and exists (
       select 1 from public.hc_applications a
       where a.id=v_application and a.organization_id=v_org and a.facility_id=v_facility
         and a.jobseeker_clerk_user_id=v_current_user
     ) then
    return true;
  end if;

  return ho_private.recruitment_can_read(v_facility)
    and exists (
      select 1 from public.hc_applications a
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
begin
  parts := string_to_array(coalesce(object_name,''), '/');

  if coalesce(array_length(parts,1),0) >= 4 and parts[1] = 'jobseekers' then
    return v_current_user is not null
      and parts[2] = v_current_user
      and not exists (
        select 1 from public.hc_application_documents d
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

  if v_current_user is not null and coalesce(array_length(parts,1),0) >= 5 and parts[4] like 'vault-%'
     and exists (
       select 1 from public.hc_applications a
       where a.id=v_application and a.organization_id=v_org and a.facility_id=v_facility
         and a.jobseeker_clerk_user_id=v_current_user
     ) then
    return true;
  end if;

  return ho_private.recruitment_can_write(v_facility)
    and ho_private.tenant_writes_allowed(v_org, v_facility)
    and exists (
      select 1 from public.hc_applications a
      join public.ho_facilities f on f.id=a.facility_id and f.organization_id=a.organization_id
      where a.id=v_application and a.organization_id=v_org and a.facility_id=v_facility
    );
end;
$$;
revoke all on function ho_private.color_application_document_object_can_read(text) from public, anon, authenticated;
revoke all on function ho_private.color_application_document_object_can_write(text) from public, anon, authenticated;
