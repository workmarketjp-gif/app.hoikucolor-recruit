-- Hoiku Color Candidate Web — saved-job JWT-owned RPC boundary v1.
-- Production migration version: 20260919010206.
-- Production already contains this migration. Repository sync MUST NOT re-apply it there.
-- Source copied from supabase_migrations.schema_migrations statements on 2026-09-20.
--
-- Candidate identity is always derived from auth.jwt()->>'sub'.
-- Save accepts only jobs currently present in the candidate-safe feed.
-- Listing retains saved IDs even when a job later becomes unavailable, so the Web can
-- distinguish "nothing saved" from "saved job is no longer publicly available".

create or replace function public.hc_jobseeker_list_saved_job_ids()
returns table(job_id uuid, saved_at timestamptz)
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

  return query
  select s.job_id, s.created_at
  from public.hc_saved_jobs s
  where s.clerk_user_id = v_actor
  order by s.created_at desc, s.job_id;
end;
$$;

revoke all on function public.hc_jobseeker_list_saved_job_ids()
  from public, anon, authenticated, service_role;
grant execute on function public.hc_jobseeker_list_saved_job_ids()
  to authenticated;

create or replace function public.hc_jobseeker_save_job(p_job_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor text := nullif((select auth.jwt()) ->> 'sub', '');
  v_inserted integer := 0;
begin
  if v_actor is null then
    raise exception 'HC_JOBSEEKER_AUTH_REQUIRED' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.hc_jobseeker_job_feed f
    where f.id = p_job_id
  ) then
    raise exception 'HC_JOB_NOT_AVAILABLE' using errcode = '23514';
  end if;

  insert into public.hc_saved_jobs(clerk_user_id, job_id)
  values (v_actor, p_job_id)
  on conflict (clerk_user_id, job_id) do nothing;

  get diagnostics v_inserted = row_count;
  return v_inserted = 1;
end;
$$;

revoke all on function public.hc_jobseeker_save_job(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.hc_jobseeker_save_job(uuid)
  to authenticated;

create or replace function public.hc_jobseeker_unsave_job(p_job_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor text := nullif((select auth.jwt()) ->> 'sub', '');
  v_deleted integer := 0;
begin
  if v_actor is null then
    raise exception 'HC_JOBSEEKER_AUTH_REQUIRED' using errcode = '42501';
  end if;

  delete from public.hc_saved_jobs s
  where s.clerk_user_id = v_actor
    and s.job_id = p_job_id;

  get diagnostics v_deleted = row_count;
  return v_deleted = 1;
end;
$$;

revoke all on function public.hc_jobseeker_unsave_job(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.hc_jobseeker_unsave_job(uuid)
  to authenticated;
