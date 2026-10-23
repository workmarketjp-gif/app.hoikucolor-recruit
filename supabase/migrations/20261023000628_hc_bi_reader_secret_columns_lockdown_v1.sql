-- Production migration version: 20261023000628 (applied 2026-10-23 with the user's approval).
-- Production already has this migration. Repository sync must NOT re-apply it there.
--
-- bi_reader is a statistics-reading login role that held SELECT on every public table through
-- default privileges, including credential columns (hc_external_source_sync_control.sync_secret,
-- marketing_tokens.access_token, push tokens, invitation token hashes, ...). It keeps SELECT on
-- every other column; credential columns are excluded by column-level grants (default-deny for
-- columns added later), and new public tables are no longer granted to it automatically.
do $$
declare
  spec record;
  v_cols text;
begin
  if not exists (select 1 from pg_roles where rolname = 'bi_reader') then
    raise notice 'bi_reader missing; nothing to do';
    return;
  end if;

  for spec in
    select * from (values
      ('hc_external_source_sync_control', array['sync_secret', 'sync_lease_token']),
      ('hd_attendance_kiosk_devices', array['token_hash']),
      ('hd_child_attendance_qr', array['token_hash']),
      ('hd_guardian_attendance_passes', array['token_hash']),
      ('ho_facility_invitations', array['token_hash']),
      ('ho_staff_invitations', array['token_hash']),
      ('pf_guardian_invitations', array['token_hash']),
      ('ho_native_push_devices', array['expo_push_token']),
      ('ho_office_billing_sync_runtime', array['worker_secret_sha256']),
      ('ho_poppy_registration_claims', array['claim_token_hash', 'resume_token_hash']),
      ('marketing_tokens', array['access_token']),
      ('marketing_agent_config', array['bridge_hash']),
      ('match_requests', array['public_token']),
      ('ho_integration_settings', array['setting_value'])
    ) as t(tbl, secret_cols)
  loop
    if to_regclass('public.' || quote_ident(spec.tbl)) is null then
      raise exception 'HC_BI_LOCKDOWN_TABLE_MISSING:%', spec.tbl;
    end if;
    select string_agg(quote_ident(c.column_name), ', ' order by c.ordinal_position)
      into v_cols
    from information_schema.columns c
    where c.table_schema = 'public' and c.table_name = spec.tbl
      and c.column_name <> all (spec.secret_cols);
    if v_cols is null
       or (select count(*) from information_schema.columns c
           where c.table_schema = 'public' and c.table_name = spec.tbl
             and c.column_name = any (spec.secret_cols)) <> cardinality(spec.secret_cols) then
      raise exception 'HC_BI_LOCKDOWN_COLUMN_MISMATCH:%', spec.tbl;
    end if;
    execute format('revoke select on public.%I from bi_reader', spec.tbl);
    execute format('grant select (%s) on public.%I to bi_reader', v_cols, spec.tbl);
  end loop;

  alter default privileges for role postgres in schema public revoke select on tables from bi_reader;
end $$;
