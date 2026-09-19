import fs from 'node:fs';

const jobScreen = fs.readFileSync(new URL('../src/app/job/[id].tsx', import.meta.url), 'utf8');
const applicationApi = fs.readFileSync(new URL('../src/lib/applicationJourneyApi.ts', import.meta.url), 'utf8');
const idempotencyMigration = fs.readFileSync(
  new URL('../../supabase/migrations/20260910205000_hc_jobseeker_application_idempotency_and_availability.sql', import.meta.url),
  'utf8',
);

const checks = [
  ['job detail reads canonical application list before enabling apply', jobScreen.includes('listApplications(pinned.client)')],
  ['job detail stores existing canonical application id', jobScreen.includes('setExistingApplicationId(applications.find((application) => application.job_id === jobId)?.id ?? null)')],
  ['double tap is locally blocked while submit is in flight', jobScreen.includes('if (applying || existingApplicationId) return;')],
  ['transport ambiguity triggers canonical reconciliation', jobScreen.includes('reconcileAmbiguousApplication') && jobScreen.includes('if (await reconcileAmbiguousApplication()) return;')],
  ['reconciliation uses a newly pinned exact candidate session', jobScreen.includes('const recoveryPinned = await pinCandidateAction();')],
  ['reconciliation refuses stale candidate continuation', jobScreen.includes('if (!recoveryPinned.isCurrent()) return true;')],
  ['committed application routes to canonical application detail', jobScreen.includes('routeToApplication(committed.id);')],
  ['successful submit is canonically re-read before completion', applicationApi.includes('const detail = await getApplicationDetail(client, data);')],
  ['successful submit validates the canonical job id', applicationApi.includes('detail.application.job_id !== jobId')],
  ['backend owns one application per candidate and job', idempotencyMigration.includes('hc_applications_jobseeker_job_unique')],
];

let failed = 0;
for (const [name, pass] of checks) {
  if (pass) {
    console.log(`PASS ${name}`);
  } else {
    failed += 1;
    console.error(`FAIL ${name}`);
  }
}

if (failed) {
  console.error(`\n${failed}/${checks.length} CA-04 application ambiguity checks failed.`);
  process.exit(1);
}

console.log(`\n${checks.length}/${checks.length} CA-04 application ambiguity checks passed.`);
