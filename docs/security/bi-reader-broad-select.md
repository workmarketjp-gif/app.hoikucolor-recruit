# bi_reader: broad SELECT on personal data (open security issue)

Status (2026-10-23): credentials are blocked, personal data is **not**.

- Done (migration `20261023000628`): `bi_reader` has no SELECT on credential columns
  (`hc_external_source_sync_control.sync_secret/sync_lease_token`, `marketing_tokens.access_token`,
  `ho_native_push_devices.expo_push_token`, invitation/attendance token hashes, `match_requests.public_token`,
  `ho_integration_settings.setting_value`, ...). New public tables are no longer granted to it automatically.
- Still open: the role is a login role with SELECT on the rest of ~450 public tables (and `hc_feed_private`),
  including jobseeker profiles (name, email, phone), resumes, applications, messages, payroll/finance and
  childcare records. The BI consumers of the role are unknown (no active session was observed), so a blanket
  revoke could break unrelated reporting and was deliberately not done.
- Recommended follow-up (separate change): inventory what the BI tool queries, replace the blanket grant with an
  allow-list of statistics views (aggregated, no direct identifiers), then revoke the table grants. Rotate the
  role's password when the consumers are known.
- Verification query: `select has_column_privilege('bi_reader','public.hc_external_source_sync_control','sync_secret','select');`
  must be `false`.
