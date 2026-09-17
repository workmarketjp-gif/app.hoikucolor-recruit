import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const migration = read('supabase/migrations/20260913110000_hc_jobseeker_match_shortlist_v1.sql');
const repo = read('src/lib/recruitRepository.ts');
const matchRoute = read('src/MatchRouteRoot.tsx');
const compareRoute = read('src/CompareRouteRoot.tsx');

const checks = [
  [migration.includes('create or replace function public.hc_jobseeker_list_ranked_jobs()'), 'bounded shortlist must replace the legacy all-job catalog RPC'],
  [migration.includes("p.clerk_user_id = (auth.jwt() ->> 'sub')"), 'shortlist must bind profile scoring to the authenticated Clerk subject'],
  [migration.includes("r.city = any(p.desired_cities)"), 'shortlist must prioritize desired cities'],
  [migration.includes("r.prefecture = any(p.desired_prefectures)"), 'shortlist must prioritize desired prefectures'],
  [migration.includes("r.employment_type = any(p.desired_employment_types)"), 'shortlist must prioritize desired employment types'],
  [migration.includes('unnest(p.desired_positions)'), 'shortlist must use desired positions'],
  [migration.includes('desired_monthly_salary_min') && migration.includes('desired_hourly_wage_min'), 'shortlist must consider salary preferences'],
  [migration.includes('unnest(p.qualifications)'), 'shortlist must consider registered qualifications'],
  [migration.includes('from public.hc_saved_jobs s where s.job_id = r.id'), 'saved jobs must be retained in the shortlist candidate pool'],
  [migration.includes('limit 120'), 'matching/comparison payload must be hard-bounded to 120 active jobs'],
  [migration.includes('from public.hc_jobseeker_job_feed r'), 'shortlist must source only the candidate-safe active job feed'],
  [migration.includes('hc_public_workplace_profiles') && migration.includes('hc_public_finance_profiles'), 'shortlist may enrich only from public HO/HF profiles'],
  [!migration.includes('hc_verified_workplace_snapshots') && !migration.includes('hc_verified_finance_snapshots'), 'shortlist must never read raw Verified snapshots'],
  [migration.includes('security invoker'), 'shortlist must not add a SECURITY DEFINER surface'],
  [migration.includes('revoke all on function public.hc_jobseeker_list_ranked_jobs() from public, anon'), 'anonymous shortlist execution must be revoked'],
  [migration.includes('grant execute on function public.hc_jobseeker_list_ranked_jobs() to authenticated, service_role'), 'authenticated shortlist execution must remain explicit'],
  [repo.includes("rpc('hc_jobseeker_list_ranked_jobs')"), 'client listJobs must use the bounded shortlist RPC'],
  [matchRoute.includes('Promise.all([listJobs(), getProfile(), getJobseekerMatchingPreferences(), listSavedJobIds()])'), 'matching route must consume the bounded shortlist instead of a separate all-job query'],
  [compareRoute.includes('Promise.all([listJobs(), getProfile(), getJobseekerMatchingPreferences()])'), 'comparison picker must consume the bounded shortlist instead of loading all jobs'],
];

const failed = checks.filter(([ok]) => !ok).map(([, message]) => message);
if (failed.length) {
  console.error('Jobseeker match shortlist contract failed:\n- ' + failed.join('\n- '));
  process.exit(1);
}

console.log(`Jobseeker match shortlist contract passed (${checks.length} checks).`);
