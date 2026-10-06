import fs from 'node:fs';

const route = fs.readFileSync('src/views/CompareView.tsx', 'utf8');
const css = fs.readFileSync('src/views/views.css', 'utf8');
const app = fs.readFileSync('src/App.tsx', 'utf8');
const router = fs.readFileSync('src/lib/router.ts', 'utf8');
const shell = fs.readFileSync('src/components/CandidateShell.tsx', 'utf8');
const repository = fs.readFileSync('src/lib/recruitRepository.ts', 'utf8');
const rankedCatalog = fs.readFileSync('supabase/migrations/20260913090000_hc_jobseeker_ranked_catalog_v1.sql', 'utf8');
const externalCatalog = fs.readFileSync('supabase/migrations/20261006213000_hc_external_job_sources_v1.sql', 'utf8');

function assert(condition, message) {
  if (!condition) {
    console.error(`jobseeker-facility-comparison-contract: ${message}`);
    process.exit(1);
  }
}

assert(route.includes('maxComparedJobs = 3'), 'comparison must remain limited to three jobs');
assert(route.includes('compared.length < 2'), 'comparison table must require at least two selected jobs');
assert(route.includes("source: 'facility'") && route.includes("source: 'ho_verified'") && route.includes("source: 'hf_verified'"), 'facility-reported and Verified sources must remain distinct');
assert(route.includes('園掲載') && route.includes('HO Verified') && route.includes('HF Verified'), 'comparison UI must visibly label data provenance');
assert(route.includes('園の掲載値で補完しません'), 'missing Verified data must not be silently replaced by facility claims');
assert(route.includes("'average_monthly_overtime_hours'") && route.includes("'paid_leave_usage_rate_pct'"), 'core HO Verified workplace evidence is missing');
assert(route.includes("'finance_monthly_result_stability'") && route.includes("'finance_closed_months_12m'"), 'core HF Verified evidence is missing');
assert(route.includes('求人文面の明示のみ') && route.includes('explicitTextSignal'), 'take-home/staffing claims must remain explicit-text evidence only');
assert(route.includes('matchJob({ job, profile, preferences })'), 'candidate match evidence must remain available in comparison');
assert(!route.includes('.insert(') && !route.includes('.update(') && !route.includes('.delete('), 'comparison route must be read-only');
assert(repository.includes("rpc('hc_jobseeker_list_ranked_jobs')") && rankedCatalog.includes('hc_public_workplace_profiles') && rankedCatalog.includes('hc_public_finance_profiles'), 'comparison must consume the candidate-safe public Verified projection path');
assert(!rankedCatalog.includes('hc_verified_workplace_snapshots') && !rankedCatalog.includes('hc_verified_finance_snapshots'), 'comparison catalog must never read raw Verified snapshots');
assert(repository.includes("window.location.pathname.startsWith('/compare')") && repository.includes("params.getAll('job_id')"), 'comparison must retain valid exact job ids from shared comparison URLs');
assert(repository.includes('missingIds.map((jobId) => getRankedJob(jobId))') && repository.includes("rpc('hc_jobseeker_get_job_v2'"), 'comparison must exact-hydrate jobs that fall outside the bounded shortlist');
assert(repository.includes("`compare:${requestedJobIds.join(',')}`") && repository.includes("key: cacheKey"), 'comparison exact hydration must not be masked by the default shortlist cache');
assert(externalCatalog.includes('create or replace function public.hc_jobseeker_get_job_v2') && externalCatalog.includes('where r.id = p_job_id') && externalCatalog.includes('where e.id = p_job_id'), 'exact comparison hydration must remain candidate-safe and job-scoped across canonical and external jobs');
assert(router.includes("compare: '/compare'") && app.includes("{view === 'compare' && <CompareView userKey={userKey} />}"), 'comparison must be a regular view of the candidate app');
assert(shell.includes("{ href: '/compare', label: '園を比較', icon: 'file' }") && app.includes('<a href="/compare">園を比較する') && app.includes('`/compare?${saved.data.slice(0, 3)'), 'candidate navigation must expose the comparison flow (sidebar, My page, saved jobs)');
assert(/\.compare-table-scroll \{[^}]*overflow: auto/.test(css) && /\.compare-row-label \{[^}]*position: sticky/.test(css) && /\.compare-table thead th \{[^}]*position: sticky/.test(css), 'mobile comparison must retain horizontal scroll and sticky row labels');

console.log('jobseeker facility comparison contract: PASS');
