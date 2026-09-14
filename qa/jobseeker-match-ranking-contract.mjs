import fs from 'node:fs';

const matching = fs.readFileSync('src/lib/jobMatching.ts', 'utf8');
const route = fs.readFileSync('src/MatchRouteRoot.tsx', 'utf8');
const enhancer = fs.readFileSync('src/components/MatchNavigationEnhancer.tsx', 'utf8');
const main = fs.readFileSync('src/main.tsx', 'utf8');

function assert(condition, message) {
  if (!condition) {
    console.error(`jobseeker-match-ranking-contract: ${message}`);
    process.exit(1);
  }
}

assert(matching.includes('condition_score'), 'condition score contract is missing');
assert(matching.includes('childcare_value_signal_pct'), 'childcare-value signal must remain separate from condition score');
assert(matching.includes("desired_prefectures") && matching.includes("desired_employment_types") && matching.includes("desired_monthly_salary_min"), 'core deterministic preference inputs are missing');
assert(matching.includes("average_monthly_overtime_hours") && matching.includes("paid_leave_usage_rate_pct"), 'HO Verified evidence is not used for supported work-preference checks');
assert(matching.includes('compareMatchedJobs') && matching.includes('quality_points'), 'transparent ranking tiebreaker is missing');
assert(!matching.includes('profile.email') && !matching.includes('profile.phone') && !matching.includes('profile.name'), 'PII must not affect matching score');
assert(route.includes('勤務地・雇用形態・給与などは通常ロジックで判定'), 'UI must explain deterministic condition scoring');
assert(route.includes('保育観は現在、求人文面に明示された表現だけ'), 'UI must not claim unsupported AI childcare-value inference');
assert(route.includes('園の申告値と混ぜません'), 'Verified evidence separation disclosure is missing');
assert(route.includes('70%以上だけ表示'), 'high-match filter is missing');
assert(route.includes('submitApplication') && route.includes('saveJob') && route.includes('unsaveJob'), 'match results must support core candidate actions');
assert(enhancer.includes('href="/matches"') && enhancer.includes('おすすめを見る'), 'main app navigation to matching is missing');
assert(main.includes("startsWith('/matches')") && main.includes('MatchRouteRoot') && main.includes('MatchNavigationEnhancer'), 'match route is not wired into the app root');

console.log('jobseeker-match-ranking-contract: PASS');
