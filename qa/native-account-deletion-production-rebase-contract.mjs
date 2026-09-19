import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const migrationPath = path.join(root, 'supabase/migrations/20260919093000_hc_native_account_deletion_v3.sql');
const workerPath = path.join(root, 'native/server/account-deletion-worker-v3.proposed.ts');
const sql = fs.readFileSync(migrationPath, 'utf8');
const worker = fs.readFileSync(workerPath, 'utf8');

const checks = [
  ['request table is new/fail-loud', sql.includes('HC_NATIVE_ACCOUNT_DELETION_FOUNDATION_ALREADY_EXISTS') && sql.includes('create table public.hc_jobseeker_account_deletion_requests')],
  ['no shared hc_private schema grant mutation', !/revoke\s+all\s+on\s+schema\s+hc_private/i.test(sql)],
  ['production owner guard drift preflight', sql.includes('HC_ACCOUNT_DELETION_OWNER_GUARD_DRIFT') && sql.includes('HC_CANDIDATE_APPLICATION_OWNER_IMMUTABLE')],
  ['normal candidate owner immutability preserved', sql.includes("raise exception 'HC_CANDIDATE_APPLICATION_OWNER_IMMUTABLE'")],
  ['deletion owner rewrite requires service_role', sql.includes("role_name='service_role'")],
  ['deletion owner rewrite requires exact old actor', sql.includes('deletion_actor=old.jobseeker_clerk_user_id')],
  ['retained application gets deterministic pseudonym', sql.includes("pseudo:='deleted:'") && sql.includes('jobseeker_clerk_user_id=pseudo')],
  ['retained candidate owner is never nulled', !sql.includes('jobseeker_clerk_user_id=null')],
  ['offer free-text candidate PII cleared', sql.includes('candidate_offer_message=null') && sql.includes('candidate_offer_response=null')],
  ['spot workforce assignment retained/pseudonymized', sql.includes('update public.hc_spot_assignments') && sql.includes('confirmed_by=case when s.confirmed_by=u then pseudo')],
  ['shared HO/Poppy principal protection retained', sql.includes('jobseeker_has_shared_identity_v3') && sql.includes("identity_action=case when shared then 'preserve_shared' else 'delete_clerk' end")],
  ['HC private candidate data cleanup included', ['hc_notifications','hc_application_documents','hc_interviews','hc_message_threads','hc_visit_reservations','hc_scout_invitations','hc_saved_jobs','hc_jobseeker_documents','hc_jobseeker_profiles'].every((name) => sql.includes(name))],
  ['mobile HC installation cleanup is conditional', sql.includes("to_regclass('hc_private.mobile_installations')") && sql.includes('recipient_clerk_user_id=$1')],
  ['worker/admin RPCs not exposed to authenticated', sql.includes('from public,anon,authenticated') && sql.includes('to service_role')],
  ['actor RPCs remain authenticated-only', sql.includes('hc_jobseeker_request_account_deletion_v1') && sql.includes('to authenticated')],
  ['resumable stages retained', ['identity_freeze','storage_cleanup','database_cleanup','identity_delete'].every((stage) => sql.includes(stage))],
  ['Clerk worker uses current BAPI version', worker.includes("const CLERK_API_VERSION = '2026-05-12'")],
  ['Clerk ban happens before destructive cleanup', worker.indexOf("clerkMutation(clerkUserId, 'ban')") < worker.indexOf("'hc_jobseeker_apply_account_deletion_v2'")],
  ['Clerk delete only at terminal identity stage', worker.includes("if (identityAction === 'delete_clerk')") && worker.includes("clerkMutation(clerkUserId, 'delete')")],
  ['worker endpoint has explicit bearer secret', worker.includes('HC_ACCOUNT_DELETION_WORKER_SECRET') && worker.includes("request.headers.get('Authorization')")],
];

let failed = 0;
for (const [name, ok] of checks) {
  if (ok) console.log(`PASS ${name}`);
  else { console.error(`FAIL ${name}`); failed += 1; }
}
if (failed) process.exit(1);
console.log(`PASS ${checks.length}/${checks.length} account-deletion Production rebase contracts`);
