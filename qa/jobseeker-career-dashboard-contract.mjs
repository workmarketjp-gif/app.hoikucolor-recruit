// お給料・働き方 (Home + /career): a question-led companion built only from existing sources. Guards the
// product rules — empty datasets are hidden (not drawn as 準備中 cards), the three salary measures stay apart,
// unknown holidays are never treated as few, no statistics jargon on the primary surface, personal pay never
// leaves the page — plus the unapplied holiday-distribution migration and the registration-funnel entry.
import fs from 'node:fs';
import { comparePhrase, holidayChoices, scenarioSalaryLine } from '../src/lib/careerSimulation.ts';

function assert(condition, message) {
  if (!condition) {
    console.error(`jobseeker-career-dashboard-contract: ${message}`);
    process.exit(1);
  }
}

const read = (path) => fs.readFileSync(path, 'utf8');
const sql = read('supabase/migrations/20261028090000_hc_jobseeker_holiday_market_v1.sql').replace(/^\s*--.*$/gm, '');
const companion = read('src/views/CareerCompanion.tsx');
const paths = read('src/views/CareerPaths.tsx');
const surface = companion + paths;
// What users can read: the code without comments.
const ui = surface.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const repo = read('src/lib/careerRepository.ts');
const career = read('src/views/CareerView.tsx');
const app = read('src/App.tsx');
const shell = read('src/components/CandidateShell.tsx');
const jobCard = read('src/components/JobCard.tsx');
const appRoot = read('src/AppRoot.tsx');
const router = read('src/lib/router.ts');
const analytics = read('src/lib/analytics.ts');
const doc = read('docs/career-data-contract.md');

// ---------------------------------------------------------------- holiday distribution migration (unapplied)
assert(/begin;[\s\S]*commit;/.test(sql), 'migration must be one transaction');
assert(sql.includes('hc_private.career_posted_jobs_v1()'), 'population must be the postings job search shows');
assert(!/hc_external_job_sources|source_payload|regexp|substring\s*\(|similar to|~\*?\s*'/.test(sql), 'holidays are never parsed or read from unpublished rows');
assert(sql.includes("basis in ('exact', 'minimum')") && sql.includes("'minimum_count'"), '「以上」 must be kept apart from exact days');
assert(sql.includes("'unstated_count'") && /count\(\*\) from stated\) >= 5 then/.test(sql), 'unstated postings are counted, thin data gives no bands');
assert(sql.includes("nullif((select auth.jwt()) ->> 'sub', '')") && sql.includes('HC_JOBSEEKER_AUTH_REQUIRED'), 'signed-in candidates only');
assert(sql.includes('revoke all on function public.hc_jobseeker_holiday_market_v1(text, text, text) from public, anon, authenticated, service_role;')
  && sql.includes('grant execute on function public.hc_jobseeker_holiday_market_v1(text, text, text) to authenticated;'), 'authenticated only');
assert(!/p_clerk_user_id|p_user_id|security invoker|grant all|\bto (anon|public)\b|create table|alter table|drop /i.test(sql), 'read-only RPC: no identity argument, no privilege or schema change');
assert(doc.includes('hc_jobseeker_holiday_market_v1') && doc.includes('未適用'), 'contract doc must describe the RPC and its applied state');

// ---------------------------------------------------------------- plain-language arithmetic
assert(scenarioSalaryLine('keep-income', 231000, null, 200000) === 231000 && scenarioSalaryLine('keep-income', null, null, 200000) === 200000 && scenarioSalaryLine('keep-income', null, null, null) === null, 'salary line: own pay, else desired minimum, else none');
assert(scenarioSalaryLine('more-holidays', 231000, 10000, null) === 221000, 'the accepted drop lowers the line');
const higher = comparePhrase(231000, 198000);
assert(higher.direction === 'higher' && higher.amount === 33000 && higher.text.includes('3.3万円 高め'), 'higher pay is stated as a plain difference');
assert(comparePhrase(190000, 198000).direction === 'lower' && comparePhrase(190000, 198000).text.includes('0.8万円 低め'), 'lower pay is stated as a plain difference');
assert(comparePhrase(200000, 198000).direction === 'same', 'a few thousand yen is "ほぼ同じ"');
assert(!/優れ|劣|価値|能力|安い|少ない/.test(comparePhrase(231000, 198000).text + comparePhrase(190000, 198000).text), 'no judgement of the person');
assert(holidayChoices.join() === '110,115,120,125', 'holiday choices are fixed numbers, not estimates');

// ---------------------------------------------------------------- sources: reuse, never invent
for (const fn of ['getSalaryMarket', 'getOfficialWageStats', 'getHolidayMarket', 'getCareerConditions', 'saveCareerConditions', 'getJobseekerMatchingPreferences']) {
  assert(companion.includes(fn), `the companion must read ${fn}`);
}
assert(paths.includes('getScenarioJobs') && paths.includes("scenario: 'keep-income'") && paths.includes("scenario: 'balance'"), 'discovery paths reuse the existing scenario RPC');
assert(repo.includes("'hc_jobseeker_holiday_market_v1'") && repo.includes('p_occupation: careerOccupation'), 'holiday read keeps the occupation scope');
assert(!/listJobs|listFeaturedJobs|searchJobs|percentile|Math\.random|\bsample\b|\bdummy\b|\bfixture\b|openai|\bgpt\b|\bAI\b/i.test(ui), 'no browser statistics, sample figures or AI in numeric judgements');
assert(career.includes('scenarioSalaryLine(scenario, input.salary, input.drop, input.wishSalary)') && !career.includes('const scenarioCopy'), '/career and Home share the scenario rule');
assert(companion.includes('saveCareerConditions(') && repo.includes('Object.keys(conditions)') && repo.includes('getCareerConditions()'), 'saving pay is verified by re-reading');

// ---------------------------------------------------------------- empty datasets are hidden, not drawn
for (const banned of ['準備中', '公表データ', 'データがありません', '未取得', '情報不足', '未登録']) {
  assert(!ui.includes(banned), `「${banned}」 must not appear as an empty card on the primary surface`);
}
assert(/if \(!stats\) return null;[\s\S]{0,400}if \(value == null\) return null;/.test(companion), 'the official-statistics card appears only when a figure exists');
assert(companion.includes('const bands = holidays.data?.kind') && companion.includes('{bands && ('), 'the holiday table appears only when the RPC returns bands');
assert(companion.includes('<MoreData') && companion.includes('詳しいデータを見る') && companion.includes('<details className="hc-more">'), 'statistics live under 「詳しいデータを見る」');
assert(!companion.includes('hc-dash-missing'), 'no wall of empty metric rows');

// ---------------------------------------------------------------- plain language, no jargon, three measures
for (const jargon of ['四分位', 'パーセンタイル', '中央50%', '中央の50%', 'KPI', 'ヒストグラム', 'RPC', 'quartile']) {
  assert(!ui.includes(jargon), `statistics jargon 「${jargon}」 must not appear on the primary surface`);
}
assert(companion.includes('私のお給料、比べてみる') && companion.includes('今のお給料はどのくらい？') && companion.includes('あなたに合う') && companion.includes('見つけてみませんか？'), 'question-led copy');
assert(companion.includes('お給料も、お休みも、保育への想いも。あなたが大切にしたいことから探せます。'), 'hero supporting line');
for (const label of ['今のお給料', '求人票に書かれたお給料', '公的統計で見る実際の給与']) assert(companion.includes(label), `${label} card`);
assert(companion.includes('is-own') && companion.includes('is-posted') && companion.includes('is-official'), 'three separately labelled measures');
assert(companion.includes('実際に支払われた給与ではありません') && companion.includes('書かれている月給の真ん中あたり'), 'posted pay is a posting condition, described plainly');
assert(companion.includes('いちばん低い金額（下限）で数えています'), 'the lower-bound definition is kept in the details');
assert(companion.includes('あなたの価値や能力を示すものではありません'), 'no-judgement note');
assert(paths.includes('休みが少ないという意味ではありません') && paths.includes("annual_holidays_basis === 'minimum' ? '以上'"), 'unknown holidays are never few; 「以上」 keeps its meaning');
assert(paths.includes('求人票に書かれた条件で') && !/overtime|残業が少ない|有休取得/.test(paths), 'no claim about overtime or paid leave without a source');
assert(paths.includes('onWiden') && paths.includes('全国の求人で探す'), 'a thin region offers the next useful action');
assert(companion.includes('role="status"') && companion.includes('aria-pressed') && paths.includes('aria-pressed') && paths.includes('aria-live="polite"'), 'state is announced and not colour-only');
assert(companion.includes('hc-verdict-mark') && companion.includes("'▲'") && companion.includes("'▼'"), 'direction is shown by shape and words, not colour alone');

// ---------------------------------------------------------------- navigation
const tabIds = [...shell.matchAll(/\{ id: '(\w+)', label: '([^']+)', href: '([^']+)'/g)].map((m) => `${m[1]}:${m[2]}:${m[3]}`);
assert(tabIds.join() === 'home:ホーム:/,jobs:求人を探す:/jobs,career:お給料:/career,saved:気になる:/saved,profile:マイページ:/profile', `five core destinations, got ${tabIds.join()}`);
assert(shell.includes("href: '/applications', label: '応募管理'") && shell.includes("href: '/messages', label: 'メッセージ'"), 'applications and messages stay in the desktop sidebar');
assert(app.includes('<a href="/applications">応募管理') && app.includes('<a href="/messages">メッセージ') && app.includes('aria-label="応募・やりとり"'), 'applications and messages stay reachable from マイページ');
assert(app.includes('<nav className="hc-home-links" aria-label="応募とメッセージ">'), 'and from Home when nothing is waiting');
assert(app.includes('profile: (attention.data?.unread_messages_count ?? 0) + (attention.data?.unanswered_interviews_count ?? 0)'), 'マイページ carries the unread and waiting badge');
assert(/applications: 'profile',\s*messages: 'profile'/.test(app) && app.includes("career: 'career'"), 'screens keep their parent tab lit');
assert(app.includes("<CareerCompanion variant=\"home\"") && career.includes('<CareerCompanion variant="page"'), 'Home and /career render the one companion');
assert(app.includes("import('./views/CareerCompanion')"), 'the companion loads lazily');

// ---------------------------------------------------------------- privacy and measurement
assert(!/sessionStorage|URLSearchParams|history\.(push|replace)State|console\./.test(surface), 'personal numbers never reach the URL, session storage or logs');
assert((surface.match(/localStorage\.[a-zA-Z]+\(([^)]*)\)/g) ?? []).every((call) => call.includes('seenKey')), 'only the seen flag is stored');
const allowedEvents = new Set(['hc_dashboard_view', 'hc_dashboard_cta', 'hc_career_started', 'hc_career_job_opened']);
const calls = [...surface.matchAll(/track\('([a-z_]+)'(?:, (\{[^}]*\}))?\)/g)];
assert(calls.length >= 6, 'the funnel steps are tracked');
for (const [, name, params = ''] of calls) {
  assert(allowedEvents.has(name), `unexpected event ${name}`);
  const keys = [...params.matchAll(/(\w+):/g)].map((m) => m[1]);
  assert(keys.every((key) => ['first_view', 'profile_state', 'cta'].includes(key)), `${name} carries only fixed fields: ${params}`);
  // Values may only be literals or the fixed path id; a reference to the person's state would show up as a bare identifier.
  assert(!/:\s*(own|wish|salaryText|saved|area|prefecture|profile|preferences|conditions)\b/.test(params), `${name} must not carry a person's values`);
}
const slots = [...ui.matchAll(/cta: ('[^']*'|`[^`]*`)/g)].map((m) => m[1].slice(1, -1));
assert(slots.length >= 6 && slots.every((slot) => ['path_${id}', 'salary_check', 'find_by_priority', 'find_higher', 'values_matches', 'values_choose'].includes(slot)), `CTA slots are fixed names, got ${slots.join()}`);
assert(app.includes("track('hc_job_saved', { surface: view })") && app.includes("track('hc_apply_complete', { surface: view })"), 'save and apply completion carry the screen name only');
assert(app.indexOf("track('hc_apply_complete'") > app.indexOf('const applied = (applicationId: string)'), 'apply completion fires from the success callback');
assert(jobCard.includes("track('hc_apply_start', { surface: pathToView(window.location.pathname) ?? 'other' })"), 'apply start carries the screen name only');
for (const event of ['hc_dashboard_view', 'hc_dashboard_cta', 'hc_job_saved', 'hc_apply_start', 'hc_apply_complete']) assert(analytics.includes(`'${event}'`), `${event} stays in the typed event list`);
assert(!/^import /m.test(analytics), 'analytics stays import-free (Node contract tests load it directly)');
assert(companion.includes('Boolean(base.data) && profileLoaded'), 'nothing renders or is counted from half the picture');

// ---------------------------------------------------------------- registration entry (unchanged from PR #99)
assert(router.includes('export function authEntryFromUrl') && router.includes('sessionStorage.setItem(authEntryStorageKey'), 'the sign-in screen stores the entry');
assert(router.includes("view && view !== 'home' ? { entry: view }") && router.includes('authEntrySlotPattern.test(cta)'), 'entry is a screen name and an allow-listed slot');
assert(analytics.includes("['hc_auth_start', 'login', 'sign_up']") && analytics.includes("if (name === 'login' || name === 'sign_up') clearAuthEntry();"), 'entry rides on the auth funnel only, then clears');
assert(appRoot.includes('entryPromises') && appRoot.includes('authEntryFromUrl(window.location.pathname, window.location.search)'), 'login copy follows what the visitor came for');

console.log('jobseeker-career-dashboard-contract: PASS');
