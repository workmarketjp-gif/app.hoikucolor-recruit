-- Prevent overlapping Hello Work discovery workers from racing the shared cursor.
-- pg_cron may fire again while a 30-row detail batch is still being normalized.

alter table public.hc_external_source_sync_control
  add column if not exists sync_lease_token uuid,
  add column if not exists sync_lease_until timestamptz;

comment on column public.hc_external_source_sync_control.sync_lease_token is
  'Opaque lease owner for one external-source discovery worker. Browser roles cannot access this table.';

comment on column public.hc_external_source_sync_control.sync_lease_until is
  'Lease expiry. A crashed worker is automatically recoverable after this timestamp.';
