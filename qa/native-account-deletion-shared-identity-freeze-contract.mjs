import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const migrationPath = path.join(root, 'supabase/migrations/20260919103000_hc_native_account_deletion_write_freeze_v1.sql');
const sql = fs.readFileSync(migrationPath, 'utf8');

const checks = [
  ['requires account deletion v3', sql.includes('HC_ACCOUNT_DELETION_V3_REQUIRED') && sql.includes("to_regprocedure('hc_private.jobseeker_principal_hash_v3(text)')")],
  ['freeze covers active deletion states', sql.includes("r.status in ('requested','processing','failed')")],
  ['candidate writes serialize with deletion request lock', sql.includes('lock_jobseeker_account_deletion_v1') && sql.includes("'hc-account-delete|'||p_actor") && sql.includes('pg_catalog.pg_advisory_xact_lock')],
  ['generic candidate row mutation locks before freeze check', sql.includes('perform hc_private.lock_jobseeker_account_deletion_v1(v_actor);\n    if hc_private.jobseeker_account_is_frozen_v1(v_actor) then')],
  ['completed shared principal remains HC frozen by hash', sql.includes("r.status = 'completed'") && sql.includes('r.principal_hash = hc_private.jobseeker_principal_hash_v3(p_actor)')],
  ['cancelled deletion is not frozen', !/r\.status\s+in\s*\([^)]*cancelled/i.test(sql)],
  ['service role worker bypass retained', sql.includes("v_role='service_role'")],
  ['candidate freeze checks OLD and NEW owners', sql.includes('v_old_owner=v_actor') && sql.includes('v_new_owner=v_actor')],
  ['freeze is candidate-side only for messages', sql.includes("'sender_clerk_user_id','jobseeker_sender'") && sql.includes("v_mode='jobseeker_sender'")],
  ['freeze is candidate-side only for notifications', sql.includes("'recipient_clerk_user_id','jobseeker_audience'") && sql.includes("v_mode='jobseeker_audience'")],
  ['saved jobs covered', sql.includes('on public.hc_saved_jobs') && sql.includes("'clerk_user_id'")],
  ['profile and matching preferences backing row covered', sql.includes('on public.hc_jobseeker_profiles')],
  ['privacy and blocked organizations covered', sql.includes('on public.hc_jobseeker_privacy_settings') && sql.includes('on public.hc_jobseeker_blocked_organizations')],
  ['jobseeker documents and delete intents covered', sql.includes('on public.hc_jobseeker_documents') && sql.includes('on ho_private.hc_jobseeker_document_delete_intents')],
  ['applications and document expectations covered', sql.includes('on public.hc_applications') && sql.includes('on public.hc_application_document_expectations')],
  ['interview response covered', sql.includes('on public.hc_interview_candidate_responses')],
  ['message thread and visit covered', sql.includes('on public.hc_message_threads') && sql.includes('on public.hc_visit_reservations')],
  ['scout candidate row covered', sql.includes('on public.hc_scout_invitations')],
  ['mobile push registration is frozen', sql.includes('hc_mobile_installation_account_freeze_v1') && sql.includes('on hc_private.mobile_installations')],
  ['mobile push explicit revoke remains allowed', sql.includes('v_is_explicit_revoke') && sql.includes('new.revoked_at is not null') && sql.includes('new.push_token is null') && sql.includes('new.notifications_authorized=false')],
  ['mobile foundation dependency is explicit', sql.includes("to_regclass('hc_private.mobile_installations')") && sql.includes("to_regprocedure('public.hc_mobile_register_installation_v1(uuid,text,text,text,text,integer,integer,boolean,text,text)')" )],
  ['application documents resolve candidate via application ownership', sql.includes('hc_candidate_application_document_account_freeze_v1') && sql.includes('a.jobseeker_clerk_user_id=v_actor') && sql.includes('a.id in (v_old_application,v_new_application)')],
  ['canonical storage write guard is wrapped not reimplemented', sql.includes('if not ho_private.color_application_document_object_can_write(object_name) then')],
  ['storage freeze wrappers serialize with deletion request', (sql.match(/perform hc_private\.lock_jobseeker_account_deletion_v1\(v_actor\);/g) || []).length >= 5],
  ['storage wrappers remain volatile because they acquire advisory locks', /color_application_document_object_can_write_with_deletion_freeze_v1\(object_name text\)[\s\S]{0,120}language plpgsql\s+volatile/i.test(sql) && /color_application_document_object_can_delete_with_deletion_freeze_v1\(object_name text\)[\s\S]{0,120}language plpgsql\s+volatile/i.test(sql)],
  ['canonical storage delete guard is wrapped not reimplemented', sql.includes('if not ho_private.color_application_document_object_can_delete(object_name) then')],
  ['candidate source storage path frozen', sql.includes("v_parts[1]='jobseekers'") && sql.includes('v_parts[2]=v_actor')],
  ['candidate application vault storage path frozen', sql.includes("v_parts[4] like 'vault-%'") && sql.includes('a.id=v_application and a.jobseeker_clerk_user_id=v_actor')],
  ['storage insert/update/delete policies upgraded', ['hc_application_documents_storage_insert','hc_application_documents_storage_update','hc_application_documents_storage_delete'].every((name) => sql.includes(`create policy ${name}`))],
  ['storage read policy intentionally untouched', !sql.includes('drop policy if exists hc_application_documents_storage_select')],
  ['no Hoiku Office/Poppy tables are frozen', !/trigger[\s\S]{0,120}\bon public\.ho_/i.test(sql) && !sql.includes('on public.hc_spot_assignments')],
  ['no shared schema privilege broadening', !/grant\s+.*\s+on\s+schema\s+(hc_private|ho_private)/i.test(sql) && !/revoke\s+all\s+on\s+schema\s+(hc_private|ho_private)/i.test(sql)],
  ['freeze helpers not exposed to authenticated', sql.includes('revoke all on function hc_private.jobseeker_account_is_frozen_v1(text)') && sql.includes('from public, anon, authenticated')],
  ['user-visible fail-closed error is stable', sql.includes("'HC_ACCOUNT_DELETION_IN_PROGRESS'")],
];

let failed = 0;
for (const [name, ok] of checks) {
  if (ok) console.log(`PASS ${name}`);
  else { console.error(`FAIL ${name}`); failed += 1; }
}
if (failed) process.exit(1);
console.log(`PASS ${checks.length}/${checks.length} shared-identity account deletion freeze contracts`);
