import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const migration = read('supabase/migrations/20260913090000_hc_jobseeker_ranked_catalog_v1.sql');
const repo = read('src/lib/recruitRepository.ts');

const checks = [
  [migration.includes('hc_jobseeker_list_ranked_jobs'), 'ranked catalog RPC must exist'],
  [migration.includes('hc_jobseeker_get_ranked_job'), 'exact active-job lookup RPC must exist'],
  [migration.includes('from public.hc_jobseeker_job_feed r'), 'catalog must source only the candidate-safe active job feed'],
  [migration.includes('hc_public_workplace_profiles') && migration.includes('hc_public_finance_profiles'), 'catalog must enrich only from public HO/HF profiles'],
  [!migration.includes('hc_verified_workplace_snapshots') && !migration.includes('hc_verified_finance_snapshots'), 'catalog must never join raw Verified snapshots'],
  [migration.includes("revoke all on function public.hc_jobseeker_list_ranked_jobs() from public, anon"), 'anonymous catalog RPC execution must be revoked'],
  [migration.includes("grant execute on function public.hc_jobseeker_list_ranked_jobs() to authenticated, service_role"), 'authenticated catalog RPC execution must be explicit'],
  [migration.includes('security invoker'), 'catalog must avoid a new SECURITY DEFINER surface'],
  [migration.includes('hc_public_job_rows_facility_idx'), 'public feed cache must index facility joins'],
  [migration.includes('hc_public_job_rows_published_idx'), 'public feed cache must index freshness ordering'],
  [migration.includes('hc_public_job_rows_closing_idx'), 'public feed cache must index closing-date filtering'],
  [repo.includes("rpc('hc_jobseeker_list_ranked_jobs')"), 'client must load jobs through one ranked catalog RPC'],
  [!repo.includes(".in('facility_id', facilityIds)"), 'client must not fan out giant facility-id IN queries'],
  [repo.includes('JOB_CATALOG_CACHE_MS = 30_000'), 'catalog must deduplicate near-simultaneous app/deep-link loads'],
  [repo.includes("rpc('hc_jobseeker_get_ranked_job'"), 'client must expose an exact active-job lookup for deep-link migration'],
];

const failed = checks.filter(([ok]) => !ok).map(([, message]) => message);
if (failed.length) {
  console.error('Jobseeker job catalog performance contract failed:\n- ' + failed.join('\n- '));
  process.exit(1);
}

console.log(`Jobseeker job catalog performance contract passed (${checks.length} checks).`);
