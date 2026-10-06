import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const migrations = fs.readdirSync(path.join(root, 'supabase/migrations'));
const migrationName = migrations.find((name) => name.endsWith('_hc_jobseeker_saved_closed_status_v1.sql'));
if (!migrationName) throw new Error('HC-W02 saved closed-status migration source is missing');

const migration = read(`supabase/migrations/${migrationName}`);
const externalSaveMigration = read('supabase/migrations/20261007084500_hc_saved_external_jobs_v1.sql');
const repo = read('src/lib/savedJobStatusRepository.ts');
// Job cards (saved, search, home, matching) are one component: JobCard.
const app = read('src/App.tsx') + read('src/components/JobCard.tsx');

for (const marker of [
  'hc_jobseeker_list_saved_jobs_with_status()',
  "nullif((select auth.jwt()) ->> 'sub', '')",
  'join hc_feed_private.public_job_rows r on r.id = s.job_id',
  'where s.clerk_user_id = v_actor',
  '(r.closing_at is null or r.closing_at >= now()) as is_open',
  'to authenticated',
]) {
  if (!migration.includes(marker)) throw new Error(`HC-W02 migration marker missing: ${marker}`);
}
if (migration.includes('public.hc_jobs j')) throw new Error('Saved closed-state read must not bypass the canonical published cache');

if (!repo.includes("rpc('hc_jobseeker_list_saved_jobs_with_status_v2'")) {
  throw new Error('Saved jobs must use the combined deadline-aware Candidate RPC');
}
for (const marker of [
  'hc_jobseeker_list_saved_jobs_with_status_v2()',
  'join public.hc_external_job_public_feed e on e.id = s.external_job_id',
  'true as is_external',
  'false as can_apply_direct',
]) {
  if (!externalSaveMigration.includes(marker)) throw new Error(`HC-W02 external saved-job marker missing: ${marker}`);
}
for (const marker of [
  'listSavedJobsWithStatus()',
  'is_open === false',
  "'募集終了'",
  '!isClosed && <VisitTrialPanel',
  'disabled={applying || isClosed}',
]) {
  if (!app.includes(marker)) throw new Error(`HC-W02 candidate UI marker missing: ${marker}`);
}
if (!app.includes("isClosed ? '募集終了' : applying ? '応募中…' : '応募する'")) {
  throw new Error('Closed saved jobs must not present an active apply action');
}

console.log('HC-W02 saved closed-state contract passed');
