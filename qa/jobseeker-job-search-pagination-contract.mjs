import fs from 'node:fs';

const migration = fs.readFileSync('supabase/migrations/20260913100000_hc_jobseeker_search_pagination_v1.sql', 'utf8');
const repository = fs.readFileSync('src/lib/recruitRepository.ts', 'utf8');
const app = fs.readFileSync('src/App.tsx', 'utf8');

const checks = [
  ['candidate search RPC exists', migration.includes('hc_jobseeker_search_jobs')],
  ['search uses candidate-safe job feed', migration.includes('from public.hc_jobseeker_job_feed r')],
  ['search joins public HO profile only', migration.includes('left join public.hc_public_workplace_profiles w')],
  ['search joins public HF profile only', migration.includes('left join public.hc_public_finance_profiles f')],
  ['search never reads raw HO snapshots', !migration.includes('hc_verified_workplace_snapshots')],
  ['search never reads raw HF snapshots', !migration.includes('hc_verified_finance_snapshots')],
  ['keyword filtering is server-side', migration.includes('strpos(') && migration.includes('p_query')],
  ['prefecture filtering is server-side', migration.includes('p_prefecture') && migration.includes('r.prefecture = btrim(p_prefecture)')],
  ['employment filtering is server-side', migration.includes('p_employment_type') && migration.includes('r.employment_type = btrim(p_employment_type)')],
  ['HO Verified filtering is server-side', migration.includes('p_ho_verified') && migration.includes('w.verified_metric_count')],
  ['HF Verified filtering is server-side', migration.includes('p_hf_verified') && migration.includes('f.verified_metric_count')],
  ['page size is clamped', migration.includes('least(coalesce(p_limit, 24), 50)')],
  ['stable composite cursor includes rank and id', migration.includes('p_after_quality') && migration.includes('p_after_transparency') && migration.includes('p_after_published_at') && migration.includes('p_after_id')],
  ['stable ordering ends with id tie-breaker', migration.includes('order by rank_quality desc, rank_transparency desc, published_at desc, id')],
  ['anon search execution is revoked', migration.includes("revoke all on function public.hc_jobseeker_search_jobs") && migration.includes('from public, anon')],
  ['search runs as invoker', migration.includes('security invoker')],
  ['active facets are derived from candidate feed', migration.includes('hc_jobseeker_job_search_facets') && migration.includes('from public.hc_jobseeker_job_feed r')],
  ['saved jobs use candidate-safe feed and saved-job RLS', migration.includes('hc_jobseeker_list_saved_ranked_jobs') && migration.includes('from public.hc_saved_jobs s')],
  ['repository sends all server filters', repository.includes("rpc('hc_jobseeker_search_jobs'") && repository.includes('p_prefecture:') && repository.includes('p_employment_type:') && repository.includes('p_ho_verified:') && repository.includes('p_hf_verified:')],
  ['repository forwards composite cursor', repository.includes('p_after_quality: cursor?.quality') && repository.includes('p_after_id: cursor?.id')],
  ['dashboard requests only three jobs', app.includes('listFeaturedJobs(3)')],
  ['primary app no longer imports full catalog listJobs', !app.match(/\blistJobs\b/)],
  ['job search requests 24 rows', app.includes('limit: 24')],
  ['job search supports load-more cursor', app.includes('cursor });') && app.includes('setCursor(page.nextCursor)')],
  ['job filters no longer filter the full catalog locally', !app.includes('const filtered = jobs.filter')],
  ['saved page has dedicated candidate-safe loader', app.includes('listSavedRankedJobs()')],
  ['filter facets come from server', app.includes('getJobSearchFacets()')],
];

const failed = checks.filter(([, ok]) => !ok);
for (const [label, ok] of checks) console.log(`${ok ? '✓' : '✗'} ${label}`);
if (failed.length) {
  console.error(`\n${failed.length} job search pagination contract check(s) failed.`);
  process.exit(1);
}
console.log(`\n${checks.length} job search pagination contract checks passed.`);
