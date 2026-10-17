-- Hoiku Color Candidate Web — résumé (履歴書) / work-history (職務経歴書) builder v1.
-- Production migration version: 20261017055551 (applied 2026-10-17 with the user's approval).
-- Production already has this migration. Repository sync must NOT re-apply it there.
--
-- Structured data is the source of truth; generated PDFs are ordinary Vault documents
-- (hc_jobseeker_documents, types resume / work_history) and reuse the existing private
-- Storage, default and immutable application-snapshot flow.
--
-- Reused, NOT duplicated (hc_jobseeker_profiles): name, name_kana, email, phone,
-- prefecture, qualifications, years_of_experience, self_intro, classroom_experience
-- (担当年齢), leadership_roles (リーダー・管理職).
-- Added here: résumé-only personal fields, education history, employment history with
-- per-position childcare detail, summary / self-PR / strengths / motivation.
--
-- Access: tables are owner-scoped by RLS on the Clerk JWT `sub` and are read-only to
-- `authenticated`; every write goes through the JWT-owned RPC below, which never
-- accepts a caller-supplied identity. Rows cascade with the candidate profile, so the
-- existing account-deletion worker (which deletes hc_jobseeker_profiles) erases them.
begin;

do $$
begin
  if to_regclass('public.hc_jobseeker_profiles') is null
     or to_regprocedure('hc_private.assert_jobseeker_mutation_allowed_v1(text)') is null
     or to_regprocedure('hc_private.hc_candidate_owned_row_account_freeze_v1()') is null then
    raise exception 'HC_RESUME_BUILDER_PREREQUISITE_MISSING';
  end if;
end $$;

create table if not exists public.hc_jobseeker_resumes (
  clerk_user_id text primary key
    references public.hc_jobseeker_profiles(clerk_user_id) on delete cascade,
  birth_date date check (birth_date is null or birth_date >= date '1930-01-01'),
  gender text check (gender is null or char_length(gender) <= 20),
  postal_code text check (postal_code is null or postal_code ~ '^[0-9]{3}-?[0-9]{4}$'),
  address text check (address is null or char_length(address) <= 200),
  address_kana text check (address_kana is null or char_length(address_kana) <= 200),
  contact_address text check (contact_address is null or char_length(contact_address) <= 200),
  qualification_acquired jsonb not null default '{}'::jsonb
    check (jsonb_typeof(qualification_acquired) = 'object'),
  work_summary text check (work_summary is null or char_length(work_summary) <= 1500),
  self_pr text check (self_pr is null or char_length(self_pr) <= 2000),
  strengths text check (strengths is null or char_length(strengths) <= 1000),
  motivation text check (motivation is null or char_length(motivation) <= 1500),
  personal_requests text check (personal_requests is null or char_length(personal_requests) <= 500),
  revision integer not null default 0 check (revision >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.hc_jobseeker_resume_entries (
  id uuid primary key,
  clerk_user_id text not null
    references public.hc_jobseeker_resumes(clerk_user_id) on delete cascade,
  kind text not null check (kind in ('education','employment')),
  sort_order smallint not null check (sort_order between 0 and 59),
  start_ym text check (start_ym is null or start_ym ~ '^(19|20)[0-9]{2}-(0[1-9]|1[0-2])$'),
  end_ym text check (end_ym is null or end_ym ~ '^(19|20)[0-9]{2}-(0[1-9]|1[0-2])$'),
  is_current boolean not null default false,
  organization text not null check (char_length(btrim(organization)) between 1 and 200),
  department text check (department is null or char_length(department) <= 200),
  education_status text check (education_status is null or education_status in ('卒業','卒業見込み','修了','中退','在学中')),
  facility_type text check (facility_type is null or char_length(facility_type) <= 50),
  employment_type text check (employment_type is null or char_length(employment_type) <= 50),
  job_title text check (job_title is null or char_length(job_title) <= 100),
  age_groups text[] not null default '{}'::text[] check (cardinality(age_groups) <= 12),
  class_lead boolean not null default false,
  management_role text check (management_role is null or char_length(management_role) <= 100),
  children_count text check (children_count is null or char_length(children_count) <= 50),
  duties text check (duties is null or char_length(duties) <= 2000),
  achievements text check (achievements is null or char_length(achievements) <= 2000),
  leaving_reason text check (leaving_reason is null or char_length(leaving_reason) <= 200),
  created_at timestamptz not null default now(),
  constraint hc_jobseeker_resume_entries_order_unique unique (clerk_user_id, kind, sort_order),
  constraint hc_jobseeker_resume_entries_period_check check (start_ym is null or end_ym is null or end_ym >= start_ym),
  constraint hc_jobseeker_resume_entries_kind_fields_check check (
    kind = 'employment' or (facility_type is null and employment_type is null and job_title is null
      and cardinality(age_groups) = 0 and not class_lead and management_role is null
      and children_count is null and achievements is null and leaving_reason is null)
  )
);

create index if not exists hc_jobseeker_resume_entries_owner_idx
  on public.hc_jobseeker_resume_entries(clerk_user_id, kind, sort_order);

alter table public.hc_jobseeker_resumes enable row level security;
alter table public.hc_jobseeker_resume_entries enable row level security;

-- Browser roles may only read their own rows; all writes go through the RPC.
revoke all on table public.hc_jobseeker_resumes from public, anon, authenticated;
revoke all on table public.hc_jobseeker_resume_entries from public, anon, authenticated;
grant select on table public.hc_jobseeker_resumes to authenticated;
grant select on table public.hc_jobseeker_resume_entries to authenticated;

drop policy if exists hc_jobseeker_resumes_select_own on public.hc_jobseeker_resumes;
create policy hc_jobseeker_resumes_select_own on public.hc_jobseeker_resumes
  for select to authenticated
  using (clerk_user_id = nullif(((select auth.jwt()) ->> 'sub'), ''));

drop policy if exists hc_jobseeker_resume_entries_select_own on public.hc_jobseeker_resume_entries;
create policy hc_jobseeker_resume_entries_select_own on public.hc_jobseeker_resume_entries
  for select to authenticated
  using (clerk_user_id = nullif(((select auth.jwt()) ->> 'sub'), ''));

-- Same account-deletion write freeze as every other candidate-owned table.
drop trigger if exists hc_account_deletion_freeze_jobseeker_resumes on public.hc_jobseeker_resumes;
create trigger hc_account_deletion_freeze_jobseeker_resumes
before insert or update or delete on public.hc_jobseeker_resumes
for each row execute function hc_private.hc_candidate_owned_row_account_freeze_v1('clerk_user_id');

drop trigger if exists hc_account_deletion_freeze_jobseeker_resume_entries on public.hc_jobseeker_resume_entries;
create trigger hc_account_deletion_freeze_jobseeker_resume_entries
before insert or update or delete on public.hc_jobseeker_resume_entries
for each row execute function hc_private.hc_candidate_owned_row_account_freeze_v1('clerk_user_id');

create or replace function hc_private.jobseeker_resume_json_v1(p_actor text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'revision', coalesce(r.revision, 0),
    'updated_at', r.updated_at,
    'birth_date', r.birth_date,
    'gender', r.gender,
    'postal_code', r.postal_code,
    'address', r.address,
    'address_kana', r.address_kana,
    'contact_address', r.contact_address,
    'qualification_acquired', coalesce(r.qualification_acquired, '{}'::jsonb),
    'work_summary', r.work_summary,
    'self_pr', r.self_pr,
    'strengths', r.strengths,
    'motivation', r.motivation,
    'personal_requests', r.personal_requests,
    'education', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e.id, 'start_ym', e.start_ym, 'end_ym', e.end_ym, 'is_current', e.is_current,
        'organization', e.organization, 'department', e.department,
        'education_status', e.education_status
      ) order by e.sort_order)
      from public.hc_jobseeker_resume_entries e
      where e.clerk_user_id = p_actor and e.kind = 'education'
    ), '[]'::jsonb),
    'employment', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e.id, 'start_ym', e.start_ym, 'end_ym', e.end_ym, 'is_current', e.is_current,
        'organization', e.organization, 'department', e.department,
        'facility_type', e.facility_type, 'employment_type', e.employment_type,
        'job_title', e.job_title, 'age_groups', to_jsonb(e.age_groups),
        'class_lead', e.class_lead, 'management_role', e.management_role,
        'children_count', e.children_count, 'duties', e.duties,
        'achievements', e.achievements, 'leaving_reason', e.leaving_reason
      ) order by e.sort_order)
      from public.hc_jobseeker_resume_entries e
      where e.clerk_user_id = p_actor and e.kind = 'employment'
    ), '[]'::jsonb)
  )
  from (select 1) one
  left join public.hc_jobseeker_resumes r on r.clerk_user_id = p_actor
$$;

revoke all on function hc_private.jobseeker_resume_json_v1(text) from public, anon, authenticated, service_role;

create or replace function public.hc_jobseeker_get_resume()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor text := nullif((select auth.jwt()) ->> 'sub', '');
begin
  if v_actor is null then
    raise exception 'HC_JOBSEEKER_AUTH_REQUIRED' using errcode = '42501';
  end if;
  return hc_private.jobseeker_resume_json_v1(v_actor);
end;
$$;

revoke all on function public.hc_jobseeker_get_resume() from public, anon, authenticated, service_role;
grant execute on function public.hc_jobseeker_get_resume() to authenticated;

create or replace function hc_private.resume_text_v1(p_value jsonb, p_max integer)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v text;
begin
  if p_value is null or jsonb_typeof(p_value) = 'null' then return null; end if;
  if jsonb_typeof(p_value) <> 'string' then
    raise exception 'HC_RESUME_INVALID_TEXT' using errcode = '22023';
  end if;
  v := nullif(btrim(p_value #>> '{}'), '');
  if v is not null and char_length(v) > p_max then
    raise exception 'HC_RESUME_TEXT_TOO_LONG' using errcode = '22023';
  end if;
  return v;
end;
$$;

revoke all on function hc_private.resume_text_v1(jsonb, integer) from public, anon, authenticated, service_role;

-- Whole-document autosave. The client sends the complete résumé with the revision it
-- last loaded; a stale revision (another tab/device saved first) is rejected instead of
-- silently overwriting newer work.
create or replace function public.hc_jobseeker_save_resume(
  p_expected_revision integer,
  p_resume jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor text := nullif((select auth.jwt()) ->> 'sub', '');
  v_current integer;
  v_entry jsonb;
  v_kind text;
  v_index integer;
  v_birth date;
  v_ack jsonb;
  v_key text;
  v_age jsonb;
  v_ages text[];
begin
  if v_actor is null then
    raise exception 'HC_JOBSEEKER_AUTH_REQUIRED' using errcode = '42501';
  end if;
  perform hc_private.assert_jobseeker_mutation_allowed_v1(v_actor);

  if p_resume is null or jsonb_typeof(p_resume) <> 'object' or pg_column_size(p_resume) > 200000 then
    raise exception 'HC_RESUME_INVALID_PAYLOAD' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_resume -> 'education', '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_resume -> 'employment', '[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(p_resume -> 'education', '[]'::jsonb)) > 20
     or jsonb_array_length(coalesce(p_resume -> 'employment', '[]'::jsonb)) > 30 then
    raise exception 'HC_RESUME_TOO_MANY_ENTRIES' using errcode = '22023';
  end if;

  v_ack := coalesce(p_resume -> 'qualification_acquired', '{}'::jsonb);
  if jsonb_typeof(v_ack) <> 'object' then
    raise exception 'HC_RESUME_INVALID_PAYLOAD' using errcode = '22023';
  end if;
  if (select count(*) from jsonb_object_keys(v_ack)) > 50 then
    raise exception 'HC_RESUME_TOO_MANY_ENTRIES' using errcode = '22023';
  end if;
  for v_key in select jsonb_object_keys(v_ack) loop
    if char_length(v_key) > 100
       or jsonb_typeof(v_ack -> v_key) <> 'string'
       or (v_ack ->> v_key) !~ '^(19|20)[0-9]{2}-(0[1-9]|1[0-2])$' then
      raise exception 'HC_RESUME_INVALID_QUALIFICATION_DATE' using errcode = '22023';
    end if;
  end loop;

  begin
    v_birth := nullif(p_resume ->> 'birth_date', '')::date;
  exception when others then
    raise exception 'HC_RESUME_INVALID_BIRTH_DATE' using errcode = '22023';
  end;
  if v_birth is not null and (v_birth < date '1930-01-01' or v_birth > current_date) then
    raise exception 'HC_RESUME_INVALID_BIRTH_DATE' using errcode = '22023';
  end if;

  -- A résumé always belongs to an existing candidate profile (cascade on deletion).
  insert into public.hc_jobseeker_profiles(clerk_user_id)
  values (v_actor)
  on conflict (clerk_user_id) do nothing;

  insert into public.hc_jobseeker_resumes(clerk_user_id)
  values (v_actor)
  on conflict (clerk_user_id) do nothing;

  select r.revision into v_current
  from public.hc_jobseeker_resumes r
  where r.clerk_user_id = v_actor
  for update;

  if p_expected_revision is distinct from v_current then
    raise exception 'HC_RESUME_REVISION_CONFLICT' using errcode = '40001';
  end if;

  update public.hc_jobseeker_resumes set
    birth_date = v_birth,
    gender = hc_private.resume_text_v1(p_resume -> 'gender', 20),
    postal_code = hc_private.resume_text_v1(p_resume -> 'postal_code', 8),
    address = hc_private.resume_text_v1(p_resume -> 'address', 200),
    address_kana = hc_private.resume_text_v1(p_resume -> 'address_kana', 200),
    contact_address = hc_private.resume_text_v1(p_resume -> 'contact_address', 200),
    qualification_acquired = v_ack,
    work_summary = hc_private.resume_text_v1(p_resume -> 'work_summary', 1500),
    self_pr = hc_private.resume_text_v1(p_resume -> 'self_pr', 2000),
    strengths = hc_private.resume_text_v1(p_resume -> 'strengths', 1000),
    motivation = hc_private.resume_text_v1(p_resume -> 'motivation', 1500),
    personal_requests = hc_private.resume_text_v1(p_resume -> 'personal_requests', 500),
    revision = v_current + 1,
    updated_at = now()
  where clerk_user_id = v_actor;

  delete from public.hc_jobseeker_resume_entries e where e.clerk_user_id = v_actor;

  foreach v_kind in array array['education','employment'] loop
    v_index := 0;
    for v_entry in select value from jsonb_array_elements(coalesce(p_resume -> v_kind, '[]'::jsonb)) loop
      if jsonb_typeof(v_entry) <> 'object' then
        raise exception 'HC_RESUME_INVALID_ENTRY' using errcode = '22023';
      end if;
      v_ages := '{}'::text[];
      if v_kind = 'employment' then
        v_age := coalesce(v_entry -> 'age_groups', '[]'::jsonb);
        if jsonb_typeof(v_age) <> 'array' or jsonb_array_length(v_age) > 12
           or exists (select 1 from jsonb_array_elements(v_age) a
                      where jsonb_typeof(a.value) <> 'string' or char_length(a.value #>> '{}') > 20) then
          raise exception 'HC_RESUME_INVALID_ENTRY' using errcode = '22023';
        end if;
        select coalesce(array_agg(a.value #>> '{}'), '{}'::text[]) into v_ages from jsonb_array_elements(v_age) a;
      end if;

      insert into public.hc_jobseeker_resume_entries(
        id, clerk_user_id, kind, sort_order, start_ym, end_ym, is_current,
        organization, department, education_status,
        facility_type, employment_type, job_title, age_groups, class_lead,
        management_role, children_count, duties, achievements, leaving_reason
      ) values (
        (v_entry ->> 'id')::uuid,
        v_actor,
        v_kind,
        v_index,
        hc_private.resume_text_v1(v_entry -> 'start_ym', 7),
        case when coalesce((v_entry ->> 'is_current')::boolean, false) then null
             else hc_private.resume_text_v1(v_entry -> 'end_ym', 7) end,
        coalesce((v_entry ->> 'is_current')::boolean, false),
        coalesce(hc_private.resume_text_v1(v_entry -> 'organization', 200), ''),
        hc_private.resume_text_v1(v_entry -> 'department', 200),
        case when v_kind = 'education' then hc_private.resume_text_v1(v_entry -> 'education_status', 10) end,
        case when v_kind = 'employment' then hc_private.resume_text_v1(v_entry -> 'facility_type', 50) end,
        case when v_kind = 'employment' then hc_private.resume_text_v1(v_entry -> 'employment_type', 50) end,
        case when v_kind = 'employment' then hc_private.resume_text_v1(v_entry -> 'job_title', 100) end,
        v_ages,
        v_kind = 'employment' and coalesce((v_entry ->> 'class_lead')::boolean, false),
        case when v_kind = 'employment' then hc_private.resume_text_v1(v_entry -> 'management_role', 100) end,
        case when v_kind = 'employment' then hc_private.resume_text_v1(v_entry -> 'children_count', 50) end,
        hc_private.resume_text_v1(v_entry -> 'duties', 2000),
        case when v_kind = 'employment' then hc_private.resume_text_v1(v_entry -> 'achievements', 2000) end,
        case when v_kind = 'employment' then hc_private.resume_text_v1(v_entry -> 'leaving_reason', 200) end
      );
      v_index := v_index + 1;
    end loop;
  end loop;

  return hc_private.jobseeker_resume_json_v1(v_actor);
end;
$$;

revoke all on function public.hc_jobseeker_save_resume(integer, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.hc_jobseeker_save_resume(integer, jsonb) to authenticated;

do $$
begin
  if has_table_privilege('anon', 'public.hc_jobseeker_resumes', 'SELECT')
     or has_table_privilege('authenticated', 'public.hc_jobseeker_resumes', 'INSERT')
     or has_table_privilege('authenticated', 'public.hc_jobseeker_resumes', 'UPDATE')
     or has_table_privilege('authenticated', 'public.hc_jobseeker_resumes', 'DELETE')
     or has_table_privilege('authenticated', 'public.hc_jobseeker_resumes', 'TRUNCATE')
     or has_table_privilege('anon', 'public.hc_jobseeker_resume_entries', 'SELECT')
     or has_table_privilege('authenticated', 'public.hc_jobseeker_resume_entries', 'INSERT')
     or has_table_privilege('authenticated', 'public.hc_jobseeker_resume_entries', 'UPDATE')
     or has_table_privilege('authenticated', 'public.hc_jobseeker_resume_entries', 'DELETE')
     or has_table_privilege('authenticated', 'public.hc_jobseeker_resume_entries', 'TRUNCATE')
     or has_function_privilege('anon', 'public.hc_jobseeker_save_resume(integer, jsonb)', 'EXECUTE')
     or has_function_privilege('anon', 'public.hc_jobseeker_get_resume()', 'EXECUTE') then
    raise exception 'HC_RESUME_BUILDER_PRIVILEGE_DRIFT';
  end if;
end $$;

commit;
