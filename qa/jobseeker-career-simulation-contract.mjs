// 転職シミュレーター: posted-condition arithmetic only. Unknown pay or holidays must never be
// filled with estimates, and the screen must keep its data-source disclosures and privacy rules.
import fs from 'node:fs';
import {
  annualHolidays, monthlyRange, toPostedJobs, summarizeSalaries, salaryHistogram, salaryPosition,
  scenarioKeepIncome, scenarioMoreHolidays, scenarioBalance, emptySimulationInput, minimumSampleSize,
} from '../src/lib/careerSimulation.ts';

function assert(condition, message) {
  if (!condition) {
    console.error(`jobseeker-career-simulation-contract: ${message}`);
    process.exit(1);
  }
}

const job = (id, min, max, holidays, extra = {}) => ({
  id, salary_type: 'monthly', salary_min: min, salary_max: max, holidays, prefecture: '東京都', employment_type: '正社員', ...extra,
});

assert(annualHolidays('年間休日120日 (土日祝)') === 120, 'annual holidays must be read from the posting text');
assert(annualHolidays('年間休日：１２５日') === 125, 'full-width digits must be read');
assert(annualHolidays('週休2日制 祝日') === null, 'weekly rules are not annual holidays');
assert(annualHolidays('年間休日 5日') === null && annualHolidays(null) === null, 'implausible or missing holidays stay unknown');
assert(monthlyRange({ ...job('x', 1200, 1500, null), salary_type: 'hourly' }) === null, 'hourly pay must never enter a monthly comparison');
assert(monthlyRange(job('x', 0, 0, null)) === null, 'zero pay is not a posted salary');

const pool = [
  job('a', 200000, 240000, '年間休日110日'),
  job('b', 220000, 220000, '年間休日120日'),
  job('c', 250000, 300000, '年間休日125日'),
  job('d', 230000, 260000, '土日祝休み'),
  job('e', 210000, 250000, '年間休日115日'),
  job('f', 180000, 200000, '年間休日130日'),
  job('g', 190000, 210000, null, { prefecture: '大阪府' }),
];
const posted = toPostedJobs(pool, { prefecture: '東京都', employmentType: '' });
assert(posted.length === 6, 'region filter must apply');
assert(posted.find((p) => p.job.id === 'd').annualHolidays === null, 'unreadable holidays stay null');

const summary = summarizeSalaries(posted);
assert(summary && summary.count === 6 && summary.median === 215000, 'median of posted lower bounds');
assert(summarizeSalaries(posted.slice(0, minimumSampleSize - 1)) === null, 'too few postings must not produce a median');
assert(salaryPosition(posted, 230000) === 67 && salaryPosition(posted.slice(0, 2), 230000) === null, 'position needs enough postings');
const bins = salaryHistogram(posted, 230000);
assert(bins.reduce((sum, bin) => sum + bin.count, 0) === posted.length, 'histogram must account for every posting');
assert(bins.filter((bin) => bin.containsYou).length === 1, 'exactly one bar holds the person');

const keep = scenarioKeepIncome(posted, { ...emptySimulationInput, currentMonthlySalary: 230000 });
assert(keep.ready && keep.matches.map((m) => m.posted.job.id).join() === 'c,d,e,a', 'keep-income order');
assert(keep.matches.find((m) => m.posted.job.id === 'a').reach === 'upper-bound-only', 'a range that only reaches the line at its top must be labelled, not promised');
assert(!scenarioKeepIncome(posted, emptySimulationInput).ready, 'keep-income needs a pay line');

const more = scenarioMoreHolidays(posted, { ...emptySimulationInput, currentMonthlySalary: 230000, currentAnnualHolidays: 110, tolerableSalaryDrop: 20000 });
assert(more.salaryLine === 210000, 'tolerable drop lowers the line');
assert(more.matches.map((m) => m.posted.job.id).join() === 'c,b,e', 'only jobs above current holidays, most holidays first');
assert(more.holidayUnknown === 1, 'jobs with unreadable holidays are counted, not ranked');
assert(more.matches[0].holidayGain === 15, 'holiday gain is measured against the current holidays');
assert(!scenarioMoreHolidays(posted, emptySimulationInput).ready, 'holiday scenario needs current pay');

const balance = scenarioBalance(posted, { ...emptySimulationInput, salaryWeight: 100 });
assert(balance.ready && balance.matches[0].posted.job.id === 'c', 'pay-first balance leads with the highest pay');
assert(scenarioBalance(posted, { ...emptySimulationInput, salaryWeight: 0 }).matches[0].posted.job.id === 'f', 'holiday-first balance leads with the most holidays');
assert(balance.holidayUnknown === 1, 'balance excludes unknown holidays');
assert(!scenarioBalance(posted.slice(0, 3), emptySimulationInput).ready, 'balance needs enough readable holidays');

const lib = fs.readFileSync('src/lib/careerSimulation.ts', 'utf8');
const view = fs.readFileSync('src/views/CareerView.tsx', 'utf8');
const app = fs.readFileSync('src/App.tsx', 'utf8');
const router = fs.readFileSync('src/lib/router.ts', 'utf8');
assert(!/Math\.random|fetch\(|supabase|localStorage|sessionStorage/.test(lib), 'simulation logic must stay pure');
assert(!/localStorage|sessionStorage|URLSearchParams|history\.(push|replace)State/.test(view), 'personal pay must never reach storage or the URL');
assert(!/track\(|gtag/.test(view), 'personal pay must never reach analytics');
assert(view.includes('保証するものではありません') && view.includes('e-Stat') && view.includes('参考件数'), 'source and no-guarantee disclosures are required');
assert(view.includes('listJobs') && view.includes('getJobseekerMatchingPreferences'), 'must reuse the existing ranked shortlist and saved preferences');
assert(router.includes("career: '/career'") && app.includes("view === 'career'") && app.includes('CareerView'), 'career must be a regular lazy view of the candidate app');

console.log('jobseeker-career-simulation-contract: PASS');
