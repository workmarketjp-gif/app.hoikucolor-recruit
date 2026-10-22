/**
 * Deterministic salary / holiday comparison for 転職シミュレーター.
 *
 * Every number here comes from a published job's own posted conditions (B: 募集給与).
 * Nothing is estimated: a job whose pay is not monthly, or whose annual holidays cannot be
 * read from the posting text, is left out of that comparison and counted as 「未公表」.
 * e-Stat actuals and corporation-published model salaries are different populations and
 * are never mixed into these figures.
 */
export type SimulationJob = {
  id: string;
  salary_type: string | null;
  salary_min: number | null;
  salary_max: number | null;
  holidays: string | null;
  prefecture: string | null;
  employment_type: string | null;
};

export type SimulationInput = {
  currentMonthlySalary: number | null;
  currentAnnualHolidays: number | null;
  desiredMinimumSalary: number | null;
  /** How much monthly pay the person accepts giving up (yen, >= 0). */
  tolerableSalaryDrop: number | null;
  desiredAnnualHolidays: number | null;
  prefecture: string;
  employmentType: string;
  /** 0 = holidays first, 100 = salary first. Used only by the balance scenario. */
  salaryWeight: number;
};

export type PostedJob = {
  job: SimulationJob;
  monthlyMin: number;
  /** Equal to monthlyMin when the posting shows a single amount. */
  monthlyMax: number;
  annualHolidays: number | null;
};

/** Fewer postings than this are shown as 参考件数不足 instead of a median. */
export const minimumSampleSize = 5;

export function monthlyRange(job: SimulationJob): { min: number; max: number } | null {
  if (job.salary_type !== 'monthly') return null;
  const min = Number(job.salary_min);
  if (!Number.isFinite(min) || min <= 0) return null;
  const max = Number(job.salary_max);
  return { min, max: Number.isFinite(max) && max >= min ? max : min };
}

/** 「年間休日120日」→ 120. Anything not clearly stated as annual days is unknown (null). */
export function annualHolidays(text: string | null): number | null {
  if (!text) return null;
  const normalized = text.replace(/[０-９]/g, (digit) => String.fromCharCode(digit.charCodeAt(0) - 0xfee0));
  const match = normalized.match(/年間休日[^0-9]{0,6}(\d{2,3})\s*日/);
  if (!match) return null;
  const days = Number(match[1]);
  return days >= 60 && days <= 200 ? days : null;
}

export function toPostedJobs(jobs: SimulationJob[], input: Pick<SimulationInput, 'prefecture' | 'employmentType'>): PostedJob[] {
  return jobs.flatMap((job) => {
    if (input.prefecture && job.prefecture !== input.prefecture) return [];
    if (input.employmentType && job.employment_type !== input.employmentType) return [];
    const range = monthlyRange(job);
    return range ? [{ job, monthlyMin: range.min, monthlyMax: range.max, annualHolidays: annualHolidays(job.holidays) }] : [];
  });
}

export function percentile(sortedValues: number[], p: number): number {
  const position = (sortedValues.length - 1) * p;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  return sortedValues[lower] + (sortedValues[upper] - sortedValues[lower]) * (position - lower);
}

export type SalarySummary = { count: number; median: number; q1: number; q3: number; min: number; max: number };

/** Summary of posted lower-bound salaries, or null when there are too few postings to say anything. */
export function summarizeSalaries(posted: PostedJob[]): SalarySummary | null {
  if (posted.length < minimumSampleSize) return null;
  const values = posted.map((item) => item.monthlyMin).sort((a, b) => a - b);
  return {
    count: values.length,
    median: percentile(values, 0.5),
    q1: percentile(values, 0.25),
    q3: percentile(values, 0.75),
    min: values[0],
    max: values[values.length - 1],
  };
}

export type HistogramBin = { from: number; to: number; count: number; containsYou: boolean };

/** Bars of `binSize` yen over the posted lower bounds; `you` marks the bar holding the person's pay. */
export function salaryHistogram(posted: PostedJob[], you: number | null, binSize = 20000): HistogramBin[] {
  if (!posted.length) return [];
  const values = posted.map((item) => item.monthlyMin);
  const lowest = Math.floor(Math.min(...values, you ?? Infinity) / binSize) * binSize;
  const highest = Math.floor(Math.max(...values, you ?? -Infinity) / binSize) * binSize;
  const bins: HistogramBin[] = [];
  for (let from = lowest; from <= highest; from += binSize) {
    bins.push({
      from,
      to: from + binSize,
      count: values.filter((value) => value >= from && value < from + binSize).length,
      containsYou: you !== null && you >= from && you < from + binSize,
    });
  }
  return bins;
}

/** Share of posted lower bounds that are below the person's pay, 0-100. Null if too few postings. */
export function salaryPosition(posted: PostedJob[], you: number | null): number | null {
  if (you === null || posted.length < minimumSampleSize) return null;
  return Math.round((posted.filter((item) => item.monthlyMin < you).length / posted.length) * 100);
}

export type ScenarioId = 'keep-income' | 'more-holidays' | 'balance';

export type ScenarioMatch = {
  posted: PostedJob;
  /** keep-income only: the posting's lower bound reaches the line, or only its upper bound does. */
  reach?: 'lower-bound' | 'upper-bound-only';
  holidayGain?: number | null;
};

export type ScenarioResult = {
  id: ScenarioId;
  /** False when the input needed for this scenario is missing; `missing` says what. */
  ready: boolean;
  missing: string | null;
  /** Monthly pay line the scenario used, when it has one. */
  salaryLine: number | null;
  matches: ScenarioMatch[];
  /** Postings that matched on pay but whose holidays are unreadable, so they cannot be ranked on holidays. */
  holidayUnknown: number;
  totalConsidered: number;
};

const byLowerBoundDesc = (a: PostedJob, b: PostedJob) => b.monthlyMin - a.monthlyMin;

export function scenarioKeepIncome(posted: PostedJob[], input: SimulationInput): ScenarioResult {
  const line = input.currentMonthlySalary ?? input.desiredMinimumSalary;
  if (line === null) {
    return { id: 'keep-income', ready: false, missing: '今の月給か、希望する最低月給', salaryLine: null, matches: [], holidayUnknown: 0, totalConsidered: posted.length };
  }
  const matches = posted
    .filter((item) => item.monthlyMax >= line)
    .sort(byLowerBoundDesc)
    .map<ScenarioMatch>((item) => ({ posted: item, reach: item.monthlyMin >= line ? 'lower-bound' : 'upper-bound-only' }));
  return { id: 'keep-income', ready: true, missing: null, salaryLine: line, matches, holidayUnknown: 0, totalConsidered: posted.length };
}

export function scenarioMoreHolidays(posted: PostedJob[], input: SimulationInput): ScenarioResult {
  const missing = input.currentMonthlySalary === null ? '今の月給' : null;
  if (missing || input.currentMonthlySalary === null) {
    return { id: 'more-holidays', ready: false, missing, salaryLine: null, matches: [], holidayUnknown: 0, totalConsidered: posted.length };
  }
  const line = Math.max(0, input.currentMonthlySalary - Math.max(0, input.tolerableSalaryDrop ?? 0));
  const holidayFloor = input.desiredAnnualHolidays ?? input.currentAnnualHolidays;
  const affordable = posted.filter((item) => item.monthlyMax >= line);
  const known = affordable.filter((item) => item.annualHolidays !== null);
  const matches = known
    .filter((item) => holidayFloor === null || (item.annualHolidays as number) > holidayFloor)
    .sort((a, b) => (b.annualHolidays as number) - (a.annualHolidays as number) || byLowerBoundDesc(a, b))
    .map<ScenarioMatch>((item) => ({
      posted: item,
      reach: item.monthlyMin >= line ? 'lower-bound' : 'upper-bound-only',
      holidayGain: input.currentAnnualHolidays === null ? null : (item.annualHolidays as number) - input.currentAnnualHolidays,
    }));
  return { id: 'more-holidays', ready: true, missing: null, salaryLine: line, matches, holidayUnknown: affordable.length - known.length, totalConsidered: posted.length };
}

export function scenarioBalance(posted: PostedJob[], input: SimulationInput): ScenarioResult {
  const known = posted.filter((item) => item.annualHolidays !== null);
  if (known.length < minimumSampleSize) {
    return { id: 'balance', ready: false, missing: '年間休日が読み取れる求人が、まだ少ないため', salaryLine: null, matches: [], holidayUnknown: posted.length - known.length, totalConsidered: posted.length };
  }
  // Rank within the same pool only: each posting's percentile on pay and on holidays, blended by the person's weight.
  const rank = (values: number[], value: number) => values.filter((other) => other < value).length / Math.max(1, values.length - 1);
  const salaries = known.map((item) => item.monthlyMin);
  const holidays = known.map((item) => item.annualHolidays as number);
  const weight = Math.min(100, Math.max(0, input.salaryWeight)) / 100;
  const matches = known
    .map((item) => ({ item, score: weight * rank(salaries, item.monthlyMin) + (1 - weight) * rank(holidays, item.annualHolidays as number) }))
    .sort((a, b) => b.score - a.score || byLowerBoundDesc(a.item, b.item))
    .map<ScenarioMatch>(({ item }) => ({ posted: item, reach: 'lower-bound' }));
  return { id: 'balance', ready: true, missing: null, salaryLine: null, matches, holidayUnknown: posted.length - known.length, totalConsidered: posted.length };
}

export const emptySimulationInput: SimulationInput = {
  currentMonthlySalary: null,
  currentAnnualHolidays: null,
  desiredMinimumSalary: null,
  tolerableSalaryDrop: null,
  desiredAnnualHolidays: null,
  prefecture: '',
  employmentType: '',
  salaryWeight: 50,
};
