create or replace function ho_private.hc_create_application_impl(
  p_facility_id uuid,
  p_job_id uuid,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, ho_private, pg_temp
as $$
declare
  v_org_id uuid;
  v_application_id uuid;
begin
  if not ho_private.recruitment_can_write(p_facility_id) then
    raise exception using errcode = '42501', message = 'RECRUITMENT_FORBIDDEN';
  end if;
  if trim(coalesce(p_payload->>'applicant_name', '')) = '' then
    raise exception using errcode = '22023', message = 'APPLICANT_NAME_REQUIRED';
  end if;
  select j.organization_id into v_org_id from public.hc_jobs j
  where j.id = p_job_id and j.facility_id = p_facility_id and j.status <> 'archived';
  if v_org_id is null then
    raise exception using errcode = 'P0002', message = 'COLOR_JOB_NOT_FOUND';
  end if;
  insert into public.hc_applications (
    organization_id, facility_id, job_id, applicant_name, applicant_name_kana,
    email, phone, qualifications, years_of_experience, desired_start_date,
    message, status, admin_memo
  ) values (
    v_org_id, p_facility_id, p_job_id, trim(p_payload->>'applicant_name'),
    p_payload->>'applicant_name_kana', nullif(trim(coalesce(p_payload->>'email', '')), ''),
    nullif(trim(coalesce(p_payload->>'phone', '')), ''), p_payload->>'qualifications',
    nullif(p_payload->>'years_of_experience', '')::numeric,
    nullif(p_payload->>'desired_start_date', '')::date,
    p_payload->>'message', 'new', p_payload->>'admin_memo'
  ) returning id into v_application_id;
  insert into public.hc_application_events (
    organization_id, facility_id, application_id, event_type,
    from_status, to_status, note, actor_clerk_user_id
  ) values (
    v_org_id, p_facility_id, v_application_id, 'created', null, 'new',
    '応募者を登録', ho_private.current_clerk_user_id()
  );
  return (select to_jsonb(a) from public.hc_applications a where a.id = v_application_id);
end;
$$;
revoke all on function ho_private.hc_create_application_impl(uuid, uuid, jsonb) from public, anon;
grant execute on function ho_private.hc_create_application_impl(uuid, uuid, jsonb) to authenticated, service_role;

create or replace function public.hc_create_application(
  p_facility_id uuid,
  p_job_id uuid,
  p_payload jsonb
)
returns jsonb
language sql
security invoker
set search_path = public, ho_private, pg_temp
as $$ select ho_private.hc_create_application_impl(p_facility_id, p_job_id, p_payload); $$;
revoke all on function public.hc_create_application(uuid, uuid, jsonb) from public, anon;
grant execute on function public.hc_create_application(uuid, uuid, jsonb) to authenticated, service_role;

create or replace function ho_private.hc_jobseeker_submit_application_impl(
  p_job_id uuid,
  p_applicant_name text,
  p_applicant_name_kana text default null,
  p_email text default null,
  p_phone text default null,
  p_qualifications text default null,
  p_years_of_experience numeric default null,
  p_desired_start_date date default null,
  p_message text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_user_id text := auth.jwt() ->> 'sub';
  v_org_id uuid;
  v_facility_id uuid;
  v_application_id uuid;
begin
  if v_user_id is null or btrim(v_user_id) = '' then raise exception 'authentication required'; end if;
  if p_applicant_name is null or btrim(p_applicant_name) = '' then raise exception 'applicant name is required'; end if;
  select j.organization_id, j.facility_id into v_org_id, v_facility_id
  from public.hc_jobs j
  join public.ho_facilities f on f.id = j.facility_id and f.organization_id = j.organization_id
  where j.id = p_job_id and j.status = 'published' and f.status = 'active'
    and (j.closing_at is null or j.closing_at >= now())
  limit 1;
  if v_facility_id is null then raise exception 'job is not available'; end if;
  select a.id into v_application_id from public.hc_applications a
  where a.job_id = p_job_id and a.jobseeker_clerk_user_id = v_user_id
  order by a.applied_at asc limit 1;
  if v_application_id is not null then return v_application_id; end if;
  begin
    insert into public.hc_applications (
      organization_id, facility_id, job_id, applicant_name, applicant_name_kana, email, phone,
      qualifications, years_of_experience, desired_start_date, message, status, source_type, jobseeker_clerk_user_id
    ) values (
      v_org_id, v_facility_id, p_job_id, btrim(p_applicant_name), nullif(btrim(p_applicant_name_kana), ''),
      nullif(btrim(p_email), ''), nullif(btrim(p_phone), ''), nullif(btrim(p_qualifications), ''),
      p_years_of_experience, p_desired_start_date, nullif(btrim(p_message), ''),
      'new', 'hoiku_color_jobseeker', v_user_id
    ) returning id into v_application_id;
  exception when unique_violation then
    select a.id into v_application_id from public.hc_applications a
    where a.job_id = p_job_id and a.jobseeker_clerk_user_id = v_user_id
    order by a.applied_at asc limit 1;
  end;
  if v_application_id is null then raise exception 'application could not be created'; end if;
  return v_application_id;
end;
$$;
revoke all on function ho_private.hc_jobseeker_submit_application_impl(uuid, text, text, text, text, text, numeric, date, text) from public, anon;
grant execute on function ho_private.hc_jobseeker_submit_application_impl(uuid, text, text, text, text, text, numeric, date, text) to authenticated;

create or replace function public.hc_jobseeker_submit_application(
  p_job_id uuid,
  p_applicant_name text,
  p_applicant_name_kana text default null,
  p_email text default null,
  p_phone text default null,
  p_qualifications text default null,
  p_years_of_experience numeric default null,
  p_desired_start_date date default null,
  p_message text default null
)
returns uuid
language sql
security invoker
set search_path = public, ho_private, pg_temp
as $$
  select ho_private.hc_jobseeker_submit_application_impl(
    p_job_id, p_applicant_name, p_applicant_name_kana, p_email, p_phone,
    p_qualifications, p_years_of_experience, p_desired_start_date, p_message
  );
$$;
revoke all on function public.hc_jobseeker_submit_application(uuid, text, text, text, text, text, numeric, date, text) from public, anon;
grant execute on function public.hc_jobseeker_submit_application(uuid, text, text, text, text, text, numeric, date, text) to authenticated;
