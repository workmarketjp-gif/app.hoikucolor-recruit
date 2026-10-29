// キャリアダッシュボード (Home): reads only existing sources, never fills a gap, keeps the three salary
// measures apart, hides personal pay until asked, and sends no personal data to GA4.
// Also guards the holiday-distribution migration (written for review, applied separately).
import fs from 'node:fs';

function assert(condition, message) {
  if (!condition) {
    console.error(`jobseeker-career-dashboard-contract: ${message}`);
    process.exit(1);
  }
}

const read = (path) => fs.readFileSync(path, 'utf8');
const sql = read('supabase/migrations/20261028090000_hc_jobseeker_holiday_market_v1.sql').replace(/^\s*--.*$/gm, '');
const view = read('src/views/CareerDashboard.tsx');
const repo = read('src/lib/careerRepository.ts');
const sim = read('src/lib/careerSimulation.ts');
const career = read('src/views/CareerView.tsx');
const app = read('src/App.tsx');
const jobCard = read('src/components/JobCard.tsx');
const appRoot = read('src/AppRoot.tsx');
const router = read('src/lib/router.ts');
const analytics = read('src/lib/analytics.ts');
const doc = read('docs/career-data-contract.md');

// ---------------------------------------------------------------- holiday distribution migration
assert(/begin;[\s\S]*commit;/.test(sql), 'migration must be one transaction');
assert(sql.includes('hc_private.career_posted_jobs_v1()'), 'population must be the postings job search shows');
assert(!/hc_external_job_sources|source_payload|regexp|substring\s*\(|similar to|~\*?\s*'/.test(sql), 'holidays are never parsed or read from unpublished rows');
assert(sql.includes("basis in ('exact', 'minimum')") && sql.includes("'minimum_count'"), '「以上」 must be kept apart from exact days');
assert(sql.includes("'unstated_count'"), 'postings without a stated number are counted, not placed');
assert(/count\(\*\) from stated\) >= 5 then/.test(sql), 'fewer than five stated values: no bands');
assert(sql.includes("nullif((select auth.jwt()) ->> 'sub', '')") && sql.includes('HC_JOBSEEKER_AUTH_REQUIRED'), 'signed-in candidates only');
assert(sql.includes('revoke all on function public.hc_jobseeker_holiday_market_v1(text, text, text) from public, anon, authenticated, service_role;')
  && sql.includes('grant execute on function public.hc_jobseeker_holiday_market_v1(text, text, text) to authenticated;'), 'authenticated only');
assert(!/p_clerk_user_id|p_user_id|security invoker|grant all|\bto (anon|public)\b|create table|alter table|drop /i.test(sql), 'read-only RPC: no identity argument, no privilege or schema change');
assert(doc.includes('hc_jobseeker_holiday_market_v1') && doc.includes('未適用'), 'contract doc must describe the RPC and its applied state');

// ---------------------------------------------------------------- sources and honesty
assert(repo.includes("'hc_jobseeker_holiday_market_v1'") && repo.includes('p_occupation: careerOccupation'), 'holiday read uses the same occupation scope');
for (const fn of ['getSalaryMarket', 'getHolidayMarket', 'getOfficialWageStats', 'getCareerConditions', 'getScenarioJobs', 'getJobseekerMatchingPreferences']) {
  assert(view.includes(fn), `dashboard must read ${fn}`);
}
assert(!/listJobs|listFeaturedJobs|searchJobs|percentile|\.sort\(\(a, b\) => a - b\)|Math\.random|\bsample|\bdummy|\bfixture/i.test(view), 'no browser statistics, sample or fallback figures');
assert(view.includes('is-own') && view.includes('is-posted') && view.includes('is-official'), 'three separately labelled salary measures');
assert(view.includes('混ぜたり平均したりしていません') && view.includes('組み合わせていません'), 'the measures are stated as separate');
assert(view.includes('実際に支払われた額ではありません'), 'posted pay is a posting condition, not paid pay');
assert(view.includes('準備中') && view.includes('数字は表示しません'), 'unregistered official statistics are stated, not filled');
assert(view.includes('minimumSampleSize') && view.includes('件以上で表示します'), 'thin data is stated');
assert(view.includes("annual_holidays_basis === 'minimum' ? '以上'") && view.includes('下限の日数で数えています'), '「以上」 keeps its meaning');
assert(view.includes('推測していません') && view.includes('推測で補いません'), 'holidays are never inferred');
assert(view.includes('有休') && view.includes('年間休日（会社の休み）と有休（自分で取る休み）は別の指標です'), 'annual holidays and paid leave are separate measures');
for (const metric of ['月平均の残業時間', '平均勤続年数', '離職率', '育児休業の取得・復帰']) {
  assert(view.includes(`<dt>${metric}</dt><dd>公表データはまだありません</dd>`), `${metric}: no published source, so no number`);
}
assert(view.includes('平均勤続年数は離職率の代わりにはなりません'), 'tenure is not a substitute for turnover');
assert(view.includes('マッチ率は表示しません') && !/match_rate|matchRate|マッチ率\s*\{/.test(view), 'no unfinished match rate');
assert(!/openai|\bgpt|\bai\b/i.test(view), 'no AI in numeric judgements');
assert(view.includes("role=\"img\"") && (view.match(/<table>/g) ?? []).length >= 2, 'charts have a text label and a table alternative');

// ---------------------------------------------------------------- reuse (single source of truth)
assert(sim.includes('export function scenarioSalaryLine') && sim.includes('export const scenarioCopy'), 'scenario rules live in careerSimulation');
assert(career.includes('scenarioSalaryLine(scenario, input.salary, input.drop, input.wishSalary)') && view.includes('scenarioSalaryLine('), 'Home and /career share the scenario rule');
assert(!career.includes("const scenarioCopy") && !view.includes("const scenarioCopy"), 'scenario copy is not duplicated');
assert(view.includes('href="/career"'), 'the dashboard hands off to the existing simulator');
assert(app.includes("import('./views/CareerDashboard')") && app.includes('<CareerDashboard userKey={userKey} profile={profile} profileLoaded={profileLoaded} />') && view.includes('Boolean(base.data) && profileLoaded'), 'Home renders the dashboard lazily');

// ---------------------------------------------------------------- privacy
assert(view.includes("{shown ? formatMan(own) : '非表示'}") && view.includes('aria-pressed={shown}'), 'own pay is hidden until the person shows it');
assert(!/sessionStorage|URLSearchParams|history\.(push|replace)State|console\./.test(view), 'personal numbers never reach the URL, session storage or logs');
assert((view.match(/localStorage\.[a-zA-Z]+\(([^)]*)\)/g) ?? []).every((call) => call.includes('dashboardSeenKey')), 'only the seen flag is stored');
const trackCalls = [...view.matchAll(/track\('([a-z_]+)'(?:, \{([^}]*)\})?\)/g)];
assert(trackCalls.length >= 3, 'dashboard events are tracked');
for (const [, name, params = ''] of trackCalls) {
  assert(['hc_dashboard_view', 'hc_dashboard_cta', 'hc_career_job_opened'].includes(name), `unexpected event ${name}`);
  assert(!/salary|holiday|own|wish|name|email|id|prefecture|experience/i.test(params.replace(/first_view|profile_state|cta/g, '')), `${name} must not carry personal data: ${params}`);
}
assert(app.includes("track('hc_job_saved', { surface: view })") && app.includes("track('hc_apply_complete', { surface: view })"), 'save and apply completion carry the screen name only');
assert(app.indexOf("track('hc_apply_complete'") > app.indexOf('const applied = (applicationId: string)'), 'apply completion fires from the success callback');
assert(jobCard.includes("track('hc_apply_start', { surface: pathToView(window.location.pathname) ?? 'other' })"), 'apply start carries the screen name only');
for (const event of ['hc_dashboard_view', 'hc_dashboard_cta', 'hc_job_saved', 'hc_apply_start', 'hc_apply_complete']) {
  assert(analytics.includes(`'${event}'`), `${event} must be in the typed event list`);
}
assert(!/^import /m.test(analytics), 'analytics stays import-free (Node contract tests load it directly)');

// ---------------------------------------------------------------- registration entry
assert(router.includes('export function authEntryFromUrl') && router.includes('sessionStorage.setItem(authEntryStorageKey'), 'the sign-in screen stores the entry');
assert(router.includes("view && view !== 'home' ? { entry: view }") && router.includes('authEntrySlotPattern.test(cta)'), 'entry is a screen name and an allow-listed slot');
assert(analytics.includes("authEntrySlotPattern = /^[a-z0-9_]{1,40}$/") && analytics.includes('/^[a-z]{1,20}$/.test(raw.entry)'), 'stored entry is validated again before sending');
assert(analytics.includes("['hc_auth_start', 'login', 'sign_up']") && analytics.includes("if (name === 'login' || name === 'sign_up') clearAuthEntry();"), 'entry rides on the auth funnel only, then clears');
assert(analytics.includes('reportVerifiedSignup') && analytics.includes("track('sign_up'"), 'sign_up stays the verified-registration event');
assert(appRoot.includes('entryPromises') && appRoot.includes('authEntryFromUrl(window.location.pathname, window.location.search)'), 'login copy follows what the visitor came for');
assert(!/required|必須/.test(appRoot.slice(appRoot.indexOf('const entryPromises'), appRoot.indexOf('function LoginScreen'))), 'registration asks for nothing beyond email or Google');

console.log('jobseeker-career-dashboard-contract: PASS');
