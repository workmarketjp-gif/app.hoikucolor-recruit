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

// The newest definition of the saved-jobs read model must return exactly its declared
// columns: an inner sort key leaking through `select *` made every call fail (42804).
const savedV2Definitions = migrations
  .filter((name) => read(`supabase/migrations/${name}`).includes('create or replace function public.hc_jobseeker_list_saved_jobs_with_status_v2()'))
  .sort();
if (savedV2Definitions.length) {
  const latest = read(`supabase/migrations/${savedV2Definitions.at(-1)}`);
  const body = latest.slice(latest.indexOf('create or replace function public.hc_jobseeker_list_saved_jobs_with_status_v2()'));
  if (/return query\s+select \*/.test(body)) throw new Error('hc_jobseeker_list_saved_jobs_with_status_v2 must list its declared columns, not select *');
  if (!body.includes('q.is_open') || !body.includes('order by q.saved_at desc')) throw new Error('saved-jobs v2 must project declared columns and sort by saved_at only');
}

console.log('HC-W02 saved closed-state contract passed');
