// 転職シミュレーター: market numbers come from SQL aggregates, never from the ranked shortlist;
// three sources stay separate; personal pay never reaches the URL, storage or analytics.
import fs from 'node:fs';
import { differenceFromMedian, formatMan, manText, parseDays, parseManYen, withYourPosition } from '../src/lib/careerSimulation.ts';

function assert(condition, message) {
  if (!condition) {
    console.error(`jobseeker-career-simulation-contract: ${message}`);
    process.exit(1);
  }
}

// Presentation arithmetic.
assert(parseManYen('23') === 230000 && parseManYen('22.5') === 225000, '万円 input converts to yen');
assert(parseManYen('') === null && parseManYen('-1') === null && parseManYen('abc') === null && parseManYen('999') === null, 'empty or implausible pay is "not entered", never 0');
assert(parseDays('110') === 110 && parseDays('') === null && parseDays('400') === null, 'holiday input bounds');
assert(formatMan(215000) === '21.5万円' && formatMan(200000) === '20万円', 'formatting');
assert(manText(230000) === '23' && manText(null) === '', 'saved yen returns to the field unchanged');
assert(differenceFromMedian(230000, 198000) === 32000 && differenceFromMedian(null, 198000) === null, 'difference from median is exact');
const bars = withYourPosition([{ from: 160000, to: 180000, count: 6 }, { from: 200000, to: 220000, count: 16 }], 230000);
assert(bars.map((b) => b.from).join() === '160000,180000,200000,220000', 'gaps become empty bars and your bar is added');
assert(bars.find((b) => b.containsYou).from === 220000 && bars.find((b) => b.from === 180000).count === 0, 'one bar holds you; gaps stay empty');
assert(bars.reduce((sum, b) => sum + b.count, 0) === 22, 'bars never change server counts');
assert(withYourPosition([], 230000).length === 0, 'no postings, no chart');

const lib = fs.readFileSync('src/lib/careerSimulation.ts', 'utf8');
const repo = fs.readFileSync('src/lib/careerRepository.ts', 'utf8');
const view = fs.readFileSync('src/views/CareerView.tsx', 'utf8');
const app = fs.readFileSync('src/App.tsx', 'utf8');
const router = fs.readFileSync('src/lib/router.ts', 'utf8');
const analytics = fs.readFileSync('src/lib/analytics.ts', 'utf8');
const recruitRepo = fs.readFileSync('src/lib/recruitRepository.ts', 'utf8');

// Population: aggregates only. The ranked shortlist is not a market.
assert(!view.includes('listJobs') && !repo.includes('listJobs') && !lib.includes('listJobs'), 'the ranked shortlist must never be a salary population');
assert(!/\.holidays\b|annualHolidays|年間休日[^日]{0,4}\(/.test(lib + repo), 'annual holidays are never parsed in the app; verified days come from the server');
assert(repo.includes('hc_jobseeker_salary_market_v1') && repo.includes('hc_jobseeker_career_scenario_jobs_v1') && repo.includes('hc_jobseeker_official_wage_stats_v1'), 'repository must use the aggregate contracts');
assert(!/percentile|median\s*=[^=]|\.sort\(\(a, b\) => a - b\)/.test(lib + view), 'no market statistics are computed in the browser');
assert(repo.includes('CareerApiUnavailableError') && repo.includes('PGRST202'), 'a not-yet-deployed API is 準備中, not a failure');

// Three measures, kept apart and labelled.
assert(view.includes('is-posted') && view.includes('is-official') && view.includes('is-own'), 'three differently labelled measures');
assert(view.includes('組み合わせていません'), 'regional and experience statistics must be stated as separate');
assert(!/national_by_experience[\s\S]{0,200}prefecture_all_experience[\s\S]{0,80}\*/.test(view), 'no arithmetic across statistics');
assert(view.includes('全国や、ほかの地域の相場ではありません') && view.includes('職種の区別はまだできておらず'), 'coverage and occupation limits must be stated');
assert(view.includes('保証するものではありません') && view.includes('価値や能力を示すものではありません'), 'no-guarantee / no-judgement disclosures');
assert(view.includes('参考件数が足りません') && view.includes('準備中'), 'thin data and unavailable states');

// Privacy.
assert(!/localStorage|sessionStorage|URLSearchParams|history\.(push|replace)State|console\./.test(view + repo + lib), 'personal pay must never reach storage, the URL or logs');
const trackCalls = view.match(/track\([^)]*\)/g) ?? [];
assert(trackCalls.length > 0 && trackCalls.every((call) => /^track\('hc_career_(started|saved|job_opened)'\)$/.test(call)), 'analytics events carry no parameters');
assert(analytics.includes("'hc_career_started'") && analytics.includes("'hc_career_saved'") && analytics.includes("'hc_career_job_opened'"), 'events must be registered in the typed list');
assert(!repo.includes('p_clerk_user_id') && !repo.includes('clerk_user_id'), 'identity is never sent by the browser');
assert(repo.includes('Object.keys(conditions)') && repo.includes('getCareerConditions()'), 'saving must be verified by re-reading');
assert(recruitRepo.includes('hc_jobseeker_upsert_profile') && !view.includes('upsertProfile'), 'profile is not re-asked or rewritten here');

// Reuse and wiring.
assert(view.includes('getJobseekerMatchingPreferences') && view.includes('getProfile'), 'must reuse saved preferences and profile');
assert(router.includes("career: '/career'") && app.includes("view === 'career'") && app.includes('CareerView'), 'career must be a regular lazy view of the candidate app');

assert(/careerOccupation = 'hoikushi'/.test(repo) && (repo.match(/p_occupation: careerOccupation/g) ?? []).length === 2, 'market and scenarios must compare inside one structured occupation');
assert(view.includes('求人タイトルから分類した「保育士」の求人です'), 'the occupation scope must be stated on screen');

console.log('jobseeker-career-simulation-contract: PASS');
