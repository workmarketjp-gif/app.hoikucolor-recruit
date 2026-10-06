-- Fix the Hello Work official-host check. The v1 regex was over-escaped
-- when written into PostgreSQL and rejected valid official URLs.

alter table public.hc_external_job_sources
  drop constraint if exists hc_external_job_sources_check;

alter table public.hc_external_job_sources
  add constraint hc_external_job_sources_check
  check (
    source <> 'hellowork'
    or source_url ~ '^https://www\.hellowork\.mhlw\.go\.jp/kensaku/'
  );
