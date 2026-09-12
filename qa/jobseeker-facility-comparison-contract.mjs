import fs from 'node:fs';

const route = fs.readFileSync('src/CompareRouteRoot.tsx', 'utf8');
const css = fs.readFileSync('src/CompareRouteRoot.css', 'utf8');
const enhancer = fs.readFileSync('src/components/CompareNavigationEnhancer.tsx', 'utf8');
const main = fs.readFileSync('src/main.tsx', 'utf8');
const repository = fs.readFileSync('src/lib/recruitRepository.ts', 'utf8');

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
assert(repository.includes("from('hc_public_workplace_profiles')") && repository.includes("from('hc_public_finance_profiles')"), 'comparison must consume the existing public Verified projection path');
assert(main.includes("startsWith('/compare')") && main.includes('CompareRouteRoot') && main.includes('CompareNavigationEnhancer'), 'comparison route is not wired into the lazy app root');
assert(enhancer.includes('href="/compare"') && enhancer.includes('2〜3園を、申告値と実績値を分けて比較'), 'candidate navigation must expose the comparison flow');
assert(css.includes('@media(max-width:620px)') && css.includes('overflow:auto') && css.includes('position:sticky'), 'mobile comparison must retain horizontal scroll and row labels');

console.log('jobseeker facility comparison contract: PASS');
