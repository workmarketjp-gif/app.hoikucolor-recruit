import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const migration = fs.readFileSync(
  path.join(root, 'supabase/migrations/20260920090000_hc_jobseeker_w05_rpc_least_privilege_v1.sql'),
  'utf8',
).toLowerCase();
const crossCandidate = fs.readFileSync(
  path.join(root, 'supabase/migrations/20260913080000_hc_jobseeker_cross_candidate_boundary_guard_v1.sql'),
  'utf8',
);
const deletionFreeze = fs.readFileSync(
  path.join(root, 'supabase/migrations/20260919103000_hc_native_account_deletion_write_freeze_v1.sql'),
  'utf8',
);

const candidateRpcSignatures = [
  'public.hc_jobseeker_get_scout_privacy()',
  'public.hc_jobseeker_set_scout_opt_in(boolean)',
  'public.hc_jobseeker_search_blockable_organizations(text, integer)',
  'public.hc_jobseeker_add_blocked_organization(uuid)',
  'public.hc_jobseeker_remove_blocked_organization(uuid)',
  'public.hc_jobseeker_list_scouts()',
  'public.hc_jobseeker_respond_scout(uuid, text)',
  'public.hc_jobseeker_get_visit_settings(uuid)',
  'public.hc_request_visit(uuid, text, date, time without time zone, uuid, text)',
  'public.hc_cancel_visit(uuid)',
  'public.hc_jobseeker_list_spot_jobs()',
  'public.hc_jobseeker_list_my_spot_assignments()',
];

const checks = [];
for (const signature of candidateRpcSignatures) {
  checks.push([
    migration.includes(`alter function ${signature} set search_path = '';`),
    `${signature} must use an empty SECURITY DEFINER search_path`,
  ]);
  checks.push([
    migration.includes(`revoke all on function ${signature} from public, anon, service_role;`),
    `${signature} must not remain callable by PUBLIC/anon/service_role`,
  ]);
  checks.push([
    migration.includes(`grant execute on function ${signature} to authenticated;`),
    `${signature} must remain callable by signed-in candidates`,
  ]);
}

checks.push(
  [
    !migration.includes('recruitment_can_write') && !migration.includes('hc_admin_') && !migration.includes('ho_private.'),
    'W05 candidate hardening must not rewrite facility/admin execution contracts',
  ],
  [
    /JOBSEEKER_RLS_DISABLED/.test(crossCandidate) && /APPLICATION_OWNER_SELECT_POLICY_MISSING/.test(crossCandidate),
    'cross-candidate RLS/owner guard must remain present',
  ],
  [
    /THREAD_PARTICIPANT_POLICY_MISSING/.test(crossCandidate) && /MESSAGE_PARTICIPANT_POLICY_MISSING/.test(crossCandidate),
    'communication reads must remain participant-bound',
  ],
  [
    /VERIFIED_SNAPSHOT_CANDIDATE_WRITE_GRANT/.test(crossCandidate),
    'HO/HF verified snapshots must stay candidate read-only',
  ],
  [
    deletionFreeze.includes("hc_account_deletion_freeze_jobseeker_profiles") &&
      deletionFreeze.includes("hc_account_deletion_freeze_jobseeker_documents") &&
      deletionFreeze.includes("hc_account_deletion_freeze_applications") &&
      deletionFreeze.includes("hc_account_deletion_freeze_messages") &&
      deletionFreeze.includes("hc_account_deletion_freeze_visits") &&
      deletionFreeze.includes("hc_account_deletion_freeze_scouts"),
    'account-deletion source must freeze all candidate-owned Web mutation surfaces',
  ],
  [
    deletionFreeze.includes('HC_ACCOUNT_DELETION_IN_PROGRESS'),
    'account-deletion freeze must fail closed with a stable error code',
  ],
);

const failed = checks.filter(([ok]) => !ok).map(([, message]) => message);
if (failed.length) {
  console.error('HC-W05 least-privilege contract failed:\n- ' + failed.join('\n- '));
  process.exit(1);
}

console.log(`HC-W05 least-privilege contract passed (${checks.length} checks).`);
