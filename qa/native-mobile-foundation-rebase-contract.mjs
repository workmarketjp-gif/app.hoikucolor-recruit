import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const migrationPath = 'supabase/migrations/20260919053000_hc_native_mobile_foundation_v3.sql';
const sql = fs.readFileSync(path.join(root, migrationPath), 'utf8');

const required = [
  "check (app_key = 'hoiku_color_jobseeker')",
  'create table hc_private.mobile_installations',
  'create table hc_private.mobile_release_policy',
  'hc_mobile_installations_push_token_uidx',
  'public.hc_mobile_register_installation_v1(',
  'public.hc_mobile_revoke_installation_v1(',
  'public.hc_mobile_bootstrap_v1(',
  "nullif((select auth.jwt()) ->> 'sub', '')",
  'pg_catalog.pg_advisory_xact_lock(',
  'recipient_clerk_user_id = excluded.recipient_clerk_user_id',
  'push_token = null',
  'notifications_authorized = false',
  'v_backend_contract_too_old :=',
  "'APP_BACKEND_CONTRACT_TOO_OLD'",
  'v_build_too_old or v_client_contract_too_old',
  'to authenticated;',
];
for (const marker of required) {
  if (!sql.includes(marker)) throw new Error(`Native mobile foundation missing: ${marker}`);
}

const forbidden = [
  'revoke all on schema hc_private',
  'grant usage on schema hc_private to authenticated',
  'mobile_push_deliveries',
  'hc_jobseeker_resolve_notification_route_v1',
  'hc_send_message_v2',
  'hc_request_visit_v2',
];
for (const marker of forbidden) {
  if (sql.toLowerCase().includes(marker.toLowerCase())) {
    throw new Error(`Native mobile foundation must not cross scope boundary: ${marker}`);
  }
}

if (!sql.includes("raise exception 'HC_NATIVE_MOBILE_FOUNDATION_ALREADY_EXISTS'")) {
  throw new Error('Migration must fail closed on an unknown pre-existing Native mobile table.');
}
if (!sql.includes("raise exception 'HC_NATIVE_MOBILE_FOUNDATION_RPC_ALREADY_EXISTS'")) {
  throw new Error('Migration must fail closed on an unknown pre-existing Native mobile RPC.');
}

const bootstrapStart = sql.indexOf('create or replace function public.hc_mobile_bootstrap_v1(');
const bootstrap = sql.slice(bootstrapStart);
if (!bootstrap.includes('v_build_too_old or v_client_contract_too_old')) {
  throw new Error('force_update must be limited to outdated client/build.');
}
if (bootstrap.includes('v_build_too_old or v_client_contract_too_old or v_backend_contract_too_old')) {
  throw new Error('Backend-too-old must not instruct the user to update the app.');
}

console.log('HC Native mobile foundation v3 rebase contract passed');
