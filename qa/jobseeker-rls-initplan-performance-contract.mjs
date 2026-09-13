import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const migration = fs.readFileSync(
  path.join(root, 'supabase/migrations/20260913140000_hc_jobseeker_rls_initplan_hardening_v1.sql'),
  'utf8',
);

const policyNames = [
  'hc_jobseeker_profiles_select_own',
  'hc_jobseeker_profiles_insert_own',
  'hc_jobseeker_profiles_update_own',
  'hc_saved_jobs_select_own',
  'hc_saved_jobs_insert_own',
  'hc_saved_jobs_delete_own',
  'hc_jobseeker_documents_select_own',
  'hc_jobseeker_documents_insert_own',
  'hc_jobseeker_documents_update_own',
  'hc_jobseeker_documents_delete_own',
  'hc_application_documents_jobseeker_attach_own',
  'hc_application_documents_jobseeker_select_own',
  'hc_applications_jobseeker_select_own',
  'hc_message_threads_insert_participant',
  'hc_message_threads_select_participant',
  'hc_messages_insert_participant',
  'hc_messages_select_participant',
  'hc_jobseeker_privacy_settings_own',
  'hc_jobseeker_blocked_organizations_own',
  'hc_scout_invitations_candidate_own',
  'hc_spot_assignments_jobseeker_select_own',
];

const checks = [
  [policyNames.every((name) => migration.includes(name)), 'all candidate policies must be covered'],
  [migration.includes('(select auth.jwt())'), 'candidate identity checks must use select-wrapped auth.jwt()'],
  [migration.includes("clerk_user_id = ((select auth.jwt()) ->> 'sub')"), 'profile and saved-job ownership must use Clerk subject'],
  [migration.includes("jobseeker_clerk_user_id = nullif(((select auth.jwt()) ->> 'sub'), '')"), 'document ownership must reject an empty Clerk subject'],
  [migration.includes('ho_private.recruitment_can_read(facility_id)'), 'facility message read authorization must remain'],
  [migration.includes('ho_private.recruitment_can_write(app.facility_id)'), 'facility thread write authorization must remain'],
  [migration.includes('ho_private.recruitment_can_write(t.facility_id)'), 'facility message write authorization must remain'],
  [migration.includes('from pg_policies'), 'migration must verify live policy definitions'],
  [migration.includes('candidate RLS initPlan hardening incomplete'), 'migration must detect policy regression'],
  [!migration.toLowerCase().includes('\ngrant '), 'performance hardening must not add grants'],
  [!migration.toLowerCase().includes('\ncreate policy '), 'performance hardening must not add parallel policies'],
  [!migration.includes('hc_verified_workplace_snapshots') && !migration.includes('hc_verified_finance_snapshots'), 'raw HO/HF Verified tables must stay outside this change'],
];

const failed = checks.filter(([ok]) => !ok).map(([, message]) => message);
if (failed.length) {
  console.error('Jobseeker RLS initPlan performance contract failed:\n- ' + failed.join('\n- '));
  process.exit(1);
}

console.log(`Jobseeker RLS initPlan performance contract passed (${checks.length} checks).`);
