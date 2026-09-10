create or replace function ho_private.hc_publish_from_market_job_impl(p_facility_id uuid, p_hm_job_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, ho_private, pg_temp
as $function$
declare
  v_org_id uuid;
  v_nursery_id uuid;
  v_job_id uuid;
begin
  if not ho_private.recruitment_can_write(p_facility_id) then
    raise exception using errcode = '42501', message = 'RECRUITMENT_FORBIDDEN';
  end if;

  select f.organization_id into v_org_id
  from public.ho_facilities f
  where f.id = p_facility_id and f.status = 'active';

  if v_org_id is null then
    raise exception using errcode = 'P0002', message = 'FACILITY_NOT_FOUND';
  end if;

  if not ho_private.tenant_writes_allowed(v_org_id, p_facility_id) then
    raise exception using errcode = '42501', message = 'TENANT_READ_ONLY';
  end if;

  v_nursery_id := ho_private.market_linked_nursery(p_facility_id);
  if v_nursery_id is null then
    raise exception using errcode = 'P0001', message = 'MARKET_NOT_LINKED';
  end if;

  if not exists (
    select 1 from public.hm_recruitment_jobs m
    where m.id = p_hm_job_id and m.nursery_id = v_nursery_id
  ) then
    raise exception using errcode = 'P0002', message = 'MARKET_JOB_NOT_FOUND';
  end if;

  perform ho_private.hc_sync_hm_recruitment_job(p_hm_job_id);

  select j.id into v_job_id
  from public.hc_jobs j
  where j.facility_id = p_facility_id
    and j.organization_id = v_org_id
    and j.source_type = 'market'
    and j.source_id = p_hm_job_id;

  if v_job_id is null then
    raise exception using errcode = 'P0002', message = 'COLOR_JOB_NOT_FOUND';
  end if;

  perform public.hc_set_job_publication(v_job_id, true);
  return (select to_jsonb(j) from public.hc_jobs j where j.id = v_job_id);
end;
$function$;

revoke all on function ho_private.hc_publish_from_market_job_impl(uuid,uuid) from public, anon;
grant execute on function ho_private.hc_publish_from_market_job_impl(uuid,uuid) to authenticated;

create or replace function public.hc_publish_from_market_job(p_facility_id uuid, p_hm_job_id uuid)
returns jsonb
language sql
security invoker
set search_path = public, ho_private, pg_temp
as $function$
  select ho_private.hc_publish_from_market_job_impl(p_facility_id, p_hm_job_id);
$function$;

revoke all on function public.hc_publish_from_market_job(uuid,uuid) from public, anon;
grant execute on function public.hc_publish_from_market_job(uuid,uuid) to authenticated;

create or replace function ho_private.hc_upsert_job_impl(p_facility_id uuid, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, ho_private, pg_temp
as $function$
declare
  v_org_id uuid;
  v_id uuid := nullif(p_payload->>'id', '')::uuid;
  v_status text := coalesce(nullif(p_payload->>'status', ''), 'draft');
  v_existing_source_type text;
  v_closing_at timestamptz := nullif(p_payload->>'closing_at', '')::timestamptz;
begin
  if not ho_private.recruitment_can_write(p_facility_id) then
    raise exception using errcode = '42501', message = 'RECRUITMENT_FORBIDDEN';
  end if;

  select f.organization_id into v_org_id
  from public.ho_facilities f
  where f.id = p_facility_id and f.status = 'active';

  if v_org_id is null then
    raise exception using errcode = 'P0002', message = 'FACILITY_NOT_FOUND';
  end if;

  if not ho_private.tenant_writes_allowed(v_org_id, p_facility_id) then
    raise exception using errcode = '42501', message = 'TENANT_READ_ONLY';
  end if;

  if trim(coalesce(p_payload->>'title', '')) = '' then
    raise exception using errcode = '22023', message = 'JOB_TITLE_REQUIRED';
  end if;

  if v_status not in ('draft','published','closed','archived') then
    raise exception using errcode = '22023', message = 'JOB_STATUS_INVALID';
  end if;

  if v_status = 'published' and v_closing_at is not null and v_closing_at < now() then
    raise exception using errcode = '22023', message = 'JOB_ALREADY_CLOSED';
  end if;

  if v_id is not null then
    select j.source_type into v_existing_source_type
    from public.hc_jobs j
    where j.id = v_id and j.facility_id = p_facility_id;

    if v_existing_source_type is null then
      raise exception using errcode = 'P0002', message = 'COLOR_JOB_NOT_FOUND';
    end if;

    if v_existing_source_type <> 'manual' then
      raise exception using errcode = '42501', message = 'SYNCED_JOB_READ_ONLY_USE_PUBLICATION_SWITCH';
    end if;
  end if;

  if v_id is null then
    insert into public.hc_jobs (
      organization_id, facility_id, source_type, title, description,
      employment_type, salary_type, salary_min, salary_max, salary_note,
      working_hours, holidays, required_qualification, benefits,
      number_of_positions, status, published_at, closing_at, created_by, updated_by
    ) values (
      v_org_id,
      p_facility_id,
      'manual',
      trim(p_payload->>'title'),
      coalesce(p_payload->>'description', ''),
      p_payload->>'employment_type',
      p_payload->>'salary_type',
      nullif(p_payload->>'salary_min', '')::integer,
      nullif(p_payload->>'salary_max', '')::integer,
      p_payload->>'salary_note',
      p_payload->>'working_hours',
      p_payload->>'holidays',
      p_payload->>'required_qualification',
      p_payload->>'benefits',
      greatest(coalesce(nullif(p_payload->>'number_of_positions', '')::integer, 1), 1),
      v_status,
      case when v_status = 'published' then now() else null end,
      v_closing_at,
      ho_private.current_clerk_user_id(),
      ho_private.current_clerk_user_id()
    ) returning id into v_id;
  else
    update public.hc_jobs j set
      title = coalesce(nullif(trim(p_payload->>'title'), ''), j.title),
      description = coalesce(p_payload->>'description', j.description),
      employment_type = coalesce(p_payload->>'employment_type', j.employment_type),
      salary_type = coalesce(p_payload->>'salary_type', j.salary_type),
      salary_min = coalesce(nullif(p_payload->>'salary_min', '')::integer, j.salary_min),
      salary_max = coalesce(nullif(p_payload->>'salary_max', '')::integer, j.salary_max),
      salary_note = coalesce(p_payload->>'salary_note', j.salary_note),
      working_hours = coalesce(p_payload->>'working_hours', j.working_hours),
      holidays = coalesce(p_payload->>'holidays', j.holidays),
      required_qualification = coalesce(p_payload->>'required_qualification', j.required_qualification),
      benefits = coalesce(p_payload->>'benefits', j.benefits),
      number_of_positions = greatest(coalesce(nullif(p_payload->>'number_of_positions', '')::integer, j.number_of_positions), 1),
      status = v_status,
      published_at = case when v_status = 'published' then coalesce(j.published_at, now()) else null end,
      closing_at = coalesce(v_closing_at, j.closing_at),
      updated_by = ho_private.current_clerk_user_id(),
      updated_at = now()
    where j.id = v_id
      and j.facility_id = p_facility_id
      and j.source_type = 'manual';

    if not found then
      raise exception using errcode = 'P0002', message = 'COLOR_JOB_NOT_FOUND';
    end if;
  end if;

  return (select to_jsonb(j) from public.hc_jobs j where j.id = v_id and j.facility_id = p_facility_id);
end;
$function$;

revoke all on function ho_private.hc_upsert_job_impl(uuid,jsonb) from public, anon;
grant execute on function ho_private.hc_upsert_job_impl(uuid,jsonb) to authenticated;

create or replace function public.hc_upsert_job(p_facility_id uuid, p_payload jsonb)
returns jsonb
language sql
security invoker
set search_path = public, ho_private, pg_temp
as $function$
  select ho_private.hc_upsert_job_impl(p_facility_id, p_payload);
$function$;

revoke all on function public.hc_upsert_job(uuid,jsonb) from public, anon;
grant execute on function public.hc_upsert_job(uuid,jsonb) to authenticated;