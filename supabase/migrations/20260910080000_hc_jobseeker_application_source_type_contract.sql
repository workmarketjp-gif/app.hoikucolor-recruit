-- Repair the Hoiku Color jobseeker application contract.
-- The canonical jobseeker submit RPC writes source_type='hoiku_color_jobseeker',
-- so hc_applications must allow that source alongside existing manual/market rows.

alter table public.hc_applications
  drop constraint if exists hc_applications_source_type_check;

alter table public.hc_applications
  add constraint hc_applications_source_type_check
  check (source_type in ('manual','market','hoiku_color_jobseeker'));
