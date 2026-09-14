-- Jobseeker core privilege hardening.
-- RLS protects row-level CRUD, but PostgreSQL TRUNCATE is not governed by RLS.
-- Candidate profile and saved-job tables therefore must not expose structural
-- table privileges (TRUNCATE / REFERENCES / TRIGGER) to browser roles.

revoke truncate, references, trigger
  on table public.hc_jobseeker_profiles
  from anon, authenticated;

revoke truncate, references, trigger
  on table public.hc_saved_jobs
  from anon, authenticated;

-- Keep only the browser CRUD surface required by the jobseeker application:
-- profiles: SELECT / INSERT / UPDATE (owner-scoped by RLS)
-- saved jobs: SELECT / INSERT / DELETE (owner-scoped by RLS)

do $$
begin
  if has_table_privilege('anon', 'public.hc_jobseeker_profiles', 'TRUNCATE')
     or has_table_privilege('authenticated', 'public.hc_jobseeker_profiles', 'TRUNCATE')
     or has_table_privilege('anon', 'public.hc_saved_jobs', 'TRUNCATE')
     or has_table_privilege('authenticated', 'public.hc_saved_jobs', 'TRUNCATE') then
    raise exception 'JOBSEEKER_TRUNCATE_PRIVILEGE_REMAINS';
  end if;
end
$$;
