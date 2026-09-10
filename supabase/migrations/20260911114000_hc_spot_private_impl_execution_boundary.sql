-- The browser-facing wrapper calls the canonical SECURITY DEFINER function,
-- which re-reads Hoiku Office break_minutes and re-checks facility permissions.
-- App roles must not call the legacy implementation directly with a caller-supplied break.
revoke all on function ho_private.hc_confirm_spot_assignment_impl(uuid, uuid, integer)
  from public, anon, authenticated;
