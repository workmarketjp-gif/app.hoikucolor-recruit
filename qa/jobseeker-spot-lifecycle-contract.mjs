import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const migration = read('supabase/migrations/20260913170000_hc_jobseeker_spot_assignment_lifecycle_notifications_v1.sql');
const confirmedMigration = read('supabase/migrations/20260913160000_hc_jobseeker_confirmed_spot_work_v1.sql');
const notifications = read('src/components/NotificationCenter.tsx');
const route = read('src/SpotJobsRouteRoot.tsx');
const repository = read('src/lib/spotJobRepository.ts');

const checks = [
  [/spot_cancelled/.test(migration) && /spot_completed/.test(migration) && /spot_no_show/.test(migration), 'spot lifecycle notification types must remain allowed'],
  [/scout_received/.test(migration), 'spot lifecycle migration must preserve the scout notification type'],
  [/tg_op = 'UPDATE'[\s\S]*old\.status is not distinct from new\.status/i.test(migration), 'unchanged assignment status must not emit duplicate notifications'],
  [/new\.status not in \('confirmed','cancelled','completed','no_show'\)/i.test(migration), 'spot lifecycle trigger must fail closed to canonical assignment states'],
  [/after insert or update of status on public\.hc_spot_assignments/i.test(migration), 'spot notifications must cover initial confirmation and later lifecycle updates'],
  [/jobseeker:spot:' \|\| new\.id::text \|\| ':' \|\| new\.status/i.test(migration), 'spot lifecycle notifications must have idempotent per-status event keys'],
  [/\/spot-jobs\?assignment_id=' \|\| new\.id::text \|\| '#spot-assignment-/i.test(migration), 'spot lifecycle notifications must deep-link to the exact assignment'],
  [/SPOT_NOTIFICATION_TYPES/.test(notifications) && /spot_confirmed/.test(notifications) && /spot_cancelled/.test(notifications) && /spot_completed/.test(notifications) && /spot_no_show/.test(notifications), 'notification navigation must recognize every spot lifecycle type'],
  [/SPOT_NOTIFICATION_TYPES\.has\(item\.notification_type\)/.test(notifications), 'all spot lifecycle notifications must use the validated assignment deep-link path'],
  [/UUID_PATTERN\.test\(assignmentId\)/.test(notifications), 'spot lifecycle deep-link assignment IDs must remain UUID validated'],
  [/confirmed: '勤務確定'/.test(route) && /completed: '勤務完了'/.test(route) && /cancelled: 'キャンセル'/.test(route) && /no_show: '未勤務'/.test(route), 'spot assignment cards must render every canonical lifecycle state'],
  [/x\.jobseeker_clerk_user_id = v_user_id/i.test(confirmedMigration), 'candidate spot history must remain owner scoped'],
  [repository.includes("rpc('hc_jobseeker_list_my_spot_assignments')"), 'candidate must continue reading lifecycle state through the safe RPC'],
  [!repository.includes("from('hc_spot_assignments')"), 'candidate client must not directly query canonical spot assignments'],
];

const failed = checks.filter(([ok]) => !ok).map(([, message]) => message);
if (failed.length) {
  console.error('Jobseeker spot lifecycle contract failed:\n- ' + failed.join('\n- '));
  process.exit(1);
}
console.log(`Jobseeker spot lifecycle contract passed (${checks.length} checks).`);
