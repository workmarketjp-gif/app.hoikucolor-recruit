import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const migration = read('supabase/migrations/20260913125000_hc_jobseeker_narrow_rank_hydration_v1.sql');

const checks = [
  [migration.includes('with ranked_ids as ('), 'search must rank narrow identifiers before hydrating job payloads'],
  [migration.includes('counted_ids as ('), 'search total count must stay on the narrow ranked set'],
  [migration.includes('page_ids as ('), 'search must cursor-page identifiers before hydration'],
  [migration.includes('visible_ids as ('), 'search must cap visible identifiers before loading wide rows'],
  [migration.includes('join public.hc_jobseeker_job_feed r on r.id = v.id'), 'search must hydrate only the visible candidate-safe job rows'],
  [migration.includes('with candidate_profile as ('), 'matching shortlist must remain candidate-profile aware'],
  [migration.includes('scored_ids as ('), 'matching must score narrow identifiers before hydration'],
  [migration.includes('shortlist_ids as ('), 'matching must bound identifiers before loading wide rows'],
  [migration.includes('limit 120'), 'matching shortlist must remain bounded to 120 rows'],
  [migration.includes("s.clerk_user_id = (auth.jwt() ->> 'sub')"), 'saved-job boost must be explicitly bound to the current Clerk subject'],
  [migration.includes('join public.hc_jobseeker_job_feed r on r.id = s.id'), 'matching must hydrate only selected candidate-safe job rows'],
  [migration.includes('hc_public_workplace_profiles') && migration.includes('hc_public_finance_profiles'), 'hydration must use only public HO/HF evidence'],
  [!migration.includes('hc_verified_workplace_snapshots') && !migration.includes('hc_verified_finance_snapshots'), 'raw Verified snapshot tables must never enter candidate ranking/hydration'],
  [migration.includes('security invoker'), 'optimized search and shortlist must remain SECURITY INVOKER'],
  [migration.includes("revoke all on function public.hc_jobseeker_search_jobs") && migration.includes("revoke all on function public.hc_jobseeker_list_ranked_jobs() from public, anon"), 'anonymous execution must remain revoked'],
  [migration.includes("grant execute on function public.hc_jobseeker_search_jobs") && migration.includes("grant execute on function public.hc_jobseeker_list_ranked_jobs() to authenticated, service_role"), 'authenticated execution must remain explicit'],
];

const failed = checks.filter(([ok]) => !ok).map(([, message]) => message);
if (failed.length) {
  console.error('Jobseeker narrow ranking/hydration contract failed:\n- ' + failed.join('\n- '));
  process.exit(1);
}

console.log(`Jobseeker narrow ranking/hydration contract passed (${checks.length} checks).`);
