-- Hoiku Color Candidate Web — résumé AI writing help: per-user rate limit v1.
-- Source only. Apply to production only after explicit approval.
--
-- The edge function hc-resume-writing-assist calls this RPC with the candidate's own
-- Clerk JWT (never a service-role key) before it calls the AI provider. The RPC derives
-- the actor from the JWT `sub`, so a caller can only spend their own quota.
--
-- Limits (rolling windows): 5 drafts per 10 minutes and 20 per 24 hours per candidate,
-- and 3000 per 24 hours across the whole service as a cost ceiling.
--
-- The usage log stores no draft text and no résumé content — only which field was
-- requested and when. Rows cascade with the candidate profile (account deletion).
begin;

do $$
begin
  if to_regclass('public.hc_jobseeker_profiles') is null
     or to_regclass('public.hc_jobseeker_resumes') is null
     or to_regprocedure('hc_private.assert_jobseeker_mutation_allowed_v1(text)') is null
     or to_regprocedure('hc_private.hc_candidate_owned_row_account_freeze_v1()') is null then
    raise exception 'HC_RESUME_AI_QUOTA_PREREQUISITE_MISSING';
  end if;
end $$;

create table if not exists public.hc_jobseeker_resume_ai_usage (
  id bigint generated always as identity primary key,
  clerk_user_id text not null
    references public.hc_jobseeker_profiles(clerk_user_id) on delete cascade,
  field text not null check (field in ('work_summary','self_pr','strengths','motivation')),
  created_at timestamptz not null default now()
);

create index if not exists hc_jobseeker_resume_ai_usage_owner_idx
  on public.hc_jobseeker_resume_ai_usage(clerk_user_id, created_at desc);
create index if not exists hc_jobseeker_resume_ai_usage_created_idx
  on public.hc_jobseeker_resume_ai_usage(created_at);

-- Internal log: RLS on, no policies, no browser privileges at all.
alter table public.hc_jobseeker_resume_ai_usage enable row level security;
revoke all on table public.hc_jobseeker_resume_ai_usage from public, anon, authenticated;

drop trigger if exists hc_account_deletion_freeze_jobseeker_resume_ai_usage on public.hc_jobseeker_resume_ai_usage;
create trigger hc_account_deletion_freeze_jobseeker_resume_ai_usage
before insert or update or delete on public.hc_jobseeker_resume_ai_usage
for each row execute function hc_private.hc_candidate_owned_row_account_freeze_v1('clerk_user_id');

create or replace function public.hc_jobseeker_claim_resume_ai_draft_v1(p_field text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor text := nullif((select auth.jwt()) ->> 'sub', '');
  v_recent integer;
  v_daily integer;
  v_global integer;
  v_oldest timestamptz;
begin
  if v_actor is null then
    raise exception 'HC_JOBSEEKER_AUTH_REQUIRED' using errcode = '42501';
  end if;
  if p_field is null or p_field not in ('work_summary','self_pr','strengths','motivation') then
    raise exception 'HC_RESUME_AI_INVALID_FIELD' using errcode = '22023';
  end if;
  perform hc_private.assert_jobseeker_mutation_allowed_v1(v_actor);

  if not exists (select 1 from public.hc_jobseeker_profiles p where p.clerk_user_id = v_actor) then
    raise exception 'HC_RESUME_AI_PROFILE_REQUIRED' using errcode = '22023';
  end if;

  -- Serialize claims per candidate so parallel requests cannot overrun the limit.
  perform pg_advisory_xact_lock(hashtextextended('hc_resume_ai:' || v_actor, 0));

  delete from public.hc_jobseeker_resume_ai_usage u
  where u.clerk_user_id = v_actor and u.created_at < now() - interval '2 days';

  select count(*) filter (where u.created_at > now() - interval '10 minutes'),
         count(*) filter (where u.created_at > now() - interval '24 hours')
    into v_recent, v_daily
  from public.hc_jobseeker_resume_ai_usage u
  where u.clerk_user_id = v_actor and u.created_at > now() - interval '24 hours';

  if v_recent >= 5 then
    select min(u.created_at) into v_oldest
    from public.hc_jobseeker_resume_ai_usage u
    where u.clerk_user_id = v_actor and u.created_at > now() - interval '10 minutes';
    return jsonb_build_object('allowed', false, 'reason', 'burst',
      'retry_after_seconds', greatest(1, ceil(extract(epoch from (v_oldest + interval '10 minutes' - now())))::integer));
  end if;
  if v_daily >= 20 then
    select min(u.created_at) into v_oldest
    from public.hc_jobseeker_resume_ai_usage u
    where u.clerk_user_id = v_actor and u.created_at > now() - interval '24 hours';
    return jsonb_build_object('allowed', false, 'reason', 'daily',
      'retry_after_seconds', greatest(1, ceil(extract(epoch from (v_oldest + interval '24 hours' - now())))::integer));
  end if;

  select count(*) into v_global
  from public.hc_jobseeker_resume_ai_usage u
  where u.created_at > now() - interval '24 hours';
  if v_global >= 3000 then
    return jsonb_build_object('allowed', false, 'reason', 'service', 'retry_after_seconds', 3600);
  end if;

  insert into public.hc_jobseeker_resume_ai_usage(clerk_user_id, field) values (v_actor, p_field);

  return jsonb_build_object('allowed', true, 'remaining_today', 20 - v_daily - 1);
end;
$$;

revoke all on function public.hc_jobseeker_claim_resume_ai_draft_v1(text) from public, anon, authenticated, service_role;
grant execute on function public.hc_jobseeker_claim_resume_ai_draft_v1(text) to authenticated;

do $$
begin
  if has_table_privilege('anon', 'public.hc_jobseeker_resume_ai_usage', 'SELECT')
     or has_table_privilege('authenticated', 'public.hc_jobseeker_resume_ai_usage', 'SELECT')
     or has_table_privilege('authenticated', 'public.hc_jobseeker_resume_ai_usage', 'INSERT')
     or has_table_privilege('authenticated', 'public.hc_jobseeker_resume_ai_usage', 'UPDATE')
     or has_table_privilege('authenticated', 'public.hc_jobseeker_resume_ai_usage', 'DELETE')
     or has_function_privilege('anon', 'public.hc_jobseeker_claim_resume_ai_draft_v1(text)', 'EXECUTE') then
    raise exception 'HC_RESUME_AI_QUOTA_PRIVILEGE_DRIFT';
  end if;
end $$;

commit;
