import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const migration = fs.readFileSync(
  path.join(root, 'supabase/migrations/20260913080000_hc_jobseeker_cross_candidate_boundary_guard_v1.sql'),
  'utf8',
);

const checks = [
  [/JOBSEEKER_RLS_DISABLED/.test(migration), 'guard must fail if candidate-sensitive RLS is disabled'],
  [/APPLICATION_OWNER_SELECT_POLICY_MISSING/.test(migration), 'guard must require candidate-owned application reads'],
  [/TENANT_WRITE_GATES_NOT_RESTRICTIVE/.test(migration), 'shared tenant write gates must stay RESTRICTIVE'],
  [/APPLICATION_FACILITY_WRITE_POLICY_MISSING/.test(migration), 'facility application writes must require recruitment_can_write'],
  [/INTERVIEW_FACILITY_WRITE_POLICY_MISSING/.test(migration), 'facility interview writes must require recruitment_can_write'],
  [/THREAD_PARTICIPANT_POLICY_MISSING/.test(migration), 'thread reads must remain participant-bound'],
  [/MESSAGE_PARTICIPANT_POLICY_MISSING/.test(migration), 'message reads must remain participant-bound'],
  [/NOTIFICATION_OWNER_POLICY_MISSING/.test(migration), 'notification reads must remain owner-bound'],
  [/VISIT_OWNER_POLICY_MISSING/.test(migration), 'visit reads must remain owner-bound'],
  [/SCOUT_TABLE_DIRECT_AUTH_GRANT/.test(migration), 'scout backing table must remain off the direct candidate surface'],
  [/BLOCK_TABLE_DIRECT_AUTH_GRANT/.test(migration), 'blocked-organization backing table must remain off the direct candidate surface'],
  [/THREAD_EXCESS_AUTH_DML_GRANT/.test(migration), 'candidate thread surface must not gain update/delete grants'],
  [/MESSAGE_EXCESS_AUTH_DML_GRANT/.test(migration), 'candidate message surface must not gain update/delete grants'],
  [/NOTIFICATION_EXCESS_AUTH_DML_GRANT/.test(migration), 'candidate notification surface must remain SELECT-only'],
  [/VISIT_EXCESS_AUTH_DML_GRANT/.test(migration), 'candidate visit table surface must remain SELECT-only'],
  [/JOBSEEKER_PUBLIC_RPC_AUTH_EXECUTE_MISSING/.test(migration), 'candidate-safe RPCs must remain executable after sign-in'],
  [/JOBSEEKER_PUBLIC_RPC_ANON_EXECUTE/.test(migration), 'candidate-safe RPCs must reject anon execution'],
  [/INTERVIEW_SCHEDULE_PERMISSION_GATE_MISSING/.test(migration), 'facility interview scheduling must retain permission gate'],
  [/VISIT_MANAGE_PERMISSION_GATE_MISSING/.test(migration), 'facility visit management must retain permission gate'],
  [/VISIT_SETTINGS_PERMISSION_GATE_MISSING/.test(migration), 'facility visit settings must retain permission gate'],
  [/VERIFIED_SNAPSHOT_CANDIDATE_WRITE_GRANT/.test(migration), 'HO/HF Verified snapshots must remain candidate read-only'],
  [/HC_JOBSEEKER_CROSS_CANDIDATE_BOUNDARY_GUARD_FAILED/.test(migration), 'guard migration must fail closed on any violation'],
];

const failed = checks.filter(([ok]) => !ok).map(([, message]) => message);
if (failed.length) {
  console.error('Jobseeker cross-candidate boundary contract failed:\n- ' + failed.join('\n- '));
  process.exit(1);
}

console.log(`Jobseeker cross-candidate boundary contract passed (${checks.length} checks).`);
