-- Delete Document Vault metadata through an owner-bound RPC and return the
-- canonical Storage path from the database instead of trusting a client-supplied
-- file_path. The source Storage object is removed by the authenticated client
-- after this transaction commits; submitted application copies remain intact
-- because source_jobseeker_document_id uses ON DELETE SET NULL.

create or replace function public.hc_delete_jobseeker_document(p_document_id uuid)
returns text
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_user_id text := nullif((select auth.jwt())->>'sub','');
  v_file_path text;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  delete from public.hc_jobseeker_documents d
  where d.id = p_document_id
    and d.jobseeker_clerk_user_id = v_user_id
  returning d.file_path into v_file_path;

  if v_file_path is null then
    raise exception 'document not found' using errcode = '42501';
  end if;

  return v_file_path;
end;
$$;

revoke all on function public.hc_delete_jobseeker_document(uuid) from public, anon;
grant execute on function public.hc_delete_jobseeker_document(uuid) to authenticated;

do $$
declare
  v_def text;
  v_security_definer boolean;
begin
  select pg_get_functiondef(p.oid), p.prosecdef
    into v_def, v_security_definer
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.proname='hc_delete_jobseeker_document'
    and pg_get_function_identity_arguments(p.oid)='p_document_id uuid';

  if v_def is null
     or v_security_definer
     or v_def !~ 'jobseeker_clerk_user_id = v_user_id'
     or v_def !~ 'returning d.file_path into v_file_path' then
    raise exception 'Document Vault owner-bound delete RPC is incomplete';
  end if;

  if has_function_privilege('anon','public.hc_delete_jobseeker_document(uuid)','EXECUTE') then
    raise exception 'anon must not execute Document Vault delete RPC';
  end if;
end $$;
