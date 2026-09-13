import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const migration = read('supabase/migrations/20260913160000_hc_jobseeker_confirmed_spot_work_v1.sql');
const repository = read('src/lib/spotJobRepository.ts');
const route = read('src/SpotJobsRouteRoot.tsx');
const notifications = read('src/components/NotificationCenter.tsx');
const css = read('src/SpotJobsRouteRoot.css');

const checks = [
  [/function public\.hc_jobseeker_list_my_spot_assignments\(\)/i.test(migration), 'candidate confirmed-work RPC must exist'],
  [/v_user_id text := auth\.jwt\(\) ->> 'sub'/i.test(migration), 'confirmed-work RPC must bind to the current Clerk subject'],
  [/x\.jobseeker_clerk_user_id = v_user_id/i.test(migration), 'confirmed-work rows must be candidate-owned'],
  [/join public\.ho_facilities f[\s\S]*left join public\.hc_jobs j/i.test(migration), 'confirmed-work RPC must hydrate only candidate-safe facility/job display fields'],
  [!/ho_staff_member_id|ho_shift_assignment_id|confirmed_by/i.test(migration), 'confirmed-work RPC must not expose Office/internal assignment identifiers'],
  [/limit 100/i.test(migration), 'confirmed-work history must remain bounded'],
  [/revoke all on function public\.hc_jobseeker_list_my_spot_assignments\(\) from public, anon/i.test(migration), 'anonymous callers must not execute confirmed-work RPC'],
  [/grant execute on function public\.hc_jobseeker_list_my_spot_assignments\(\) to authenticated, service_role/i.test(migration), 'authenticated candidates must execute confirmed-work RPC'],
  [/spot_confirmed/i.test(migration) && /\/spot-jobs\?assignment_id=/i.test(migration), 'spot confirmation notifications must target the confirmed shift'],
  [repository.includes("rpc('hc_jobseeker_list_my_spot_assignments')"), 'client must use candidate-safe confirmed-work RPC'],
  [!repository.includes("from('hc_spot_assignments')"), 'candidate client must not query canonical spot assignments directly'],
  [/Promise\.all\(\[listSpotJobs\(\), listMySpotAssignments\(\)\]\)/.test(route), 'spot route must load open jobs and confirmed work together'],
  [route.includes('あなたのスポット勤務') && route.includes('Hoiku Office シフト連携済み'), 'confirmed shifts must remain clearly visible after the listing closes'],
  [/assignment_id/.test(route) && /UUID_PATTERN/.test(route) && /spot-assignment-\$\{assignmentId\}/.test(route), 'spot notification deep-link must validate and focus an owned assignment'],
  [route.includes('assignment.break_minutes') && route.includes('assignment.hourly_rate') && route.includes('assignment.work_date'), 'confirmed-work card must preserve canonical date, rate and break'],
  [notifications.includes("'/spot-jobs'"), 'notification navigation allow-list must include the spot route'],
  [/SPOT_NOTIFICATION_TYPES\.has\(item\.notification_type\)/.test(notifications) && /UUID_PATTERN\.test\(assignmentId\)/.test(notifications), 'spot notification assignment id must be UUID-validated for confirmed and later lifecycle notifications'],
  [notifications.includes("target.startsWith('/spot-jobs?')"), 'spot confirmation deep-links must preserve assignment query/hash navigation'],
  [css.includes('.spot-assignment-card:focus') && css.includes('@media(max-width:390px)'), 'confirmed-work cards must retain focus and 390px mobile hardening'],
];

const failed = checks.filter(([ok]) => !ok).map(([, message]) => message);
if (failed.length) {
  console.error('Jobseeker confirmed spot-work contract failed:\n- ' + failed.join('\n- '));
  process.exit(1);
}
console.log(`Jobseeker confirmed spot-work contract passed (${checks.length} checks).`);
