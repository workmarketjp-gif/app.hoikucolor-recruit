create or replace function public.hc_set_job_publication_v2(
  p_facility_id uuid,
  p_job_id uuid,
  p_is_public boolean
)
returns public.hc_jobs
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_job public.hc_jobs%rowtype;
begin
  if p_facility_id is null or p_job_id is null then
    raise exception '管理する園と求人を確認してください。' using errcode = '22023';
  end if;

  select j.*
    into v_job
    from public.hc_jobs j
   where j.id = p_job_id
     and j.facility_id = p_facility_id;

  if not found then
    raise exception '選択中の園と求人が一致しません。' using errcode = '42501';
  end if;

  if not ho_private.recruitment_can_write(p_facility_id) then
    raise exception 'この求人を変更する権限がありません。' using errcode = '42501';
  end if;

  return public.hc_set_job_publication(p_job_id, p_is_public);
end;
$function$;

revoke all on function public.hc_set_job_publication_v2(uuid, uuid, boolean) from public;
revoke all on function public.hc_set_job_publication_v2(uuid, uuid, boolean) from anon;
revoke all on function public.hc_set_job_publication_v2(uuid, uuid, boolean) from service_role;
grant execute on function public.hc_set_job_publication_v2(uuid, uuid, boolean) to authenticated;

create or replace function public.hc_set_google_job_visibility_v2(
  p_facility_id uuid,
  p_job_id uuid,
  p_is_enabled boolean
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_job public.hc_jobs%rowtype;
begin
  if p_facility_id is null or p_job_id is null then
    raise exception '管理する園と求人を確認してください。' using errcode = '22023';
  end if;

  select j.*
    into v_job
    from public.hc_jobs j
   where j.id = p_job_id
     and j.facility_id = p_facility_id;

  if not found then
    raise exception '選択中の園と求人が一致しません。' using errcode = '42501';
  end if;

  if not ho_private.recruitment_can_write(p_facility_id) then
    raise exception 'この求人を変更する権限がありません。' using errcode = '42501';
  end if;

  return public.hc_set_google_job_visibility(p_job_id, p_is_enabled);
end;
$function$;

revoke all on function public.hc_set_google_job_visibility_v2(uuid, uuid, boolean) from public;
revoke all on function public.hc_set_google_job_visibility_v2(uuid, uuid, boolean) from anon;
revoke all on function public.hc_set_google_job_visibility_v2(uuid, uuid, boolean) from service_role;
grant execute on function public.hc_set_google_job_visibility_v2(uuid, uuid, boolean) to authenticated;
