-- Cycle Hello Work discovery across the core childcare roles.
-- Each query is scanned prefecture by prefecture and deduplicated by source_job_id.

alter table public.hc_external_source_sync_control
  add column if not exists query_cursor smallint not null default 0
  check (query_cursor between 0 and 3);
