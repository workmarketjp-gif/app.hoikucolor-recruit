import { supabase } from './supabase';
import type { ScenarioId } from './careerSimulation';

/**
 * Reads for 転職シミュレーター. Market figures are aggregated in SQL over the same postings
 * the job search shows; the browser never computes a market statistic. Contract:
 * docs/career-data-contract.md. An RPC that is not deployed yet is reported as
 * `CareerApiUnavailableError` (「準備中」), which is different from a failed read.
 */
export class CareerApiUnavailableError extends Error {
  constructor(name: string) {
    super(`${name} is not available`);
    this.name = 'CareerApiUnavailableError';
  }
}

/** Posted pay is compared inside one occupation: jobs whose title names 保育士 (classified in the database). */
const careerOccupation = 'hoikushi';

function client() {
  if (!supabase) throw new Error('Supabaseの接続設定がありません。');
  return supabase;
}

async function call<T>(name: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await client().rpc(name, args);
  if (error) {
    // PostgREST: PGRST202 = function not found in the schema cache; Postgres: 42883 = undefined_function.
    if (error.code === 'PGRST202' || error.code === '42883') throw new CareerApiUnavailableError(name);
    throw error;
  }
  return data as T;
}

/** A response that is not the documented object is a failed read, never an empty market. */
function expectShape<T>(name: string, data: unknown, key: string): T {
  if (!data || typeof data !== 'object' || Array.isArray(data) || !(key in data)) throw new Error(`${name} returned an unexpected shape`);
  return data as T;
}

export type HistogramBar = { from: number; to: number; count: number };

export type SalaryMarket = {
  scope: { prefecture: string | null; employment_type: string | null; occupation: string | null };
  as_of: string;
  population: {
    total_count: number;
    scope_count: number;
    monthly_count: number;
    not_monthly_count: number;
    occupation_verified_count: number;
    implausible_count: number;
  };
  monthly_lower_bound: null | { count: number; median: number; q1: number; q3: number; min: number; max: number; histogram: HistogramBar[] };
  holidays: { scope_count: number; verified_count: number };
  facets: { coverage: { prefecture: string; count: number }[]; employment_types: string[] };
};

export async function getSalaryMarket(prefecture: string, employmentType: string): Promise<SalaryMarket> {
  return expectShape<SalaryMarket>('hc_jobseeker_salary_market_v1', await call<unknown>('hc_jobseeker_salary_market_v1', {
    p_prefecture: prefecture || null,
    p_employment_type: employmentType || null,
    p_occupation: careerOccupation,
  }), 'population');
}

export type ScenarioJob = {
  id: string;
  facility_name: string | null;
  title: string | null;
  prefecture: string | null;
  employment_type: string | null;
  salary_min: number;
  salary_max: number;
  annual_holidays_days: number | null;
  annual_holidays_basis: 'exact' | 'minimum' | null;
  reach: 'lower-bound' | 'upper-bound-only';
};

export type ScenarioResponse =
  | { ready: false; missing: 'salary_line' | 'verified_holidays'; unknown_holidays?: number }
  | { ready: true; total: number; unknown_holidays: number; jobs: ScenarioJob[] };

export type ScenarioRequest = {
  scenario: ScenarioId;
  prefecture: string;
  employmentType: string;
  salaryLine: number | null;
  /** 「今の年間休日より多い」 (strictly more than). */
  holidayMoreThan: number | null;
  /** 「希望の年間休日 N日以上」 (at least). */
  holidayAtLeast: number | null;
  salaryWeight: number;
};

export function getScenarioJobs(request: ScenarioRequest): Promise<ScenarioResponse> {
  return call<ScenarioResponse>('hc_jobseeker_career_scenario_jobs_v1', {
    p_scenario: request.scenario,
    p_prefecture: request.prefecture || null,
    p_employment_type: request.employmentType || null,
    p_salary_line: request.salaryLine,
    p_holiday_floor: request.holidayMoreThan,
    p_holiday_at_least: request.holidayAtLeast,
    p_salary_weight: request.salaryWeight,
    p_limit: 5,
    p_occupation: careerOccupation,
  });
}

export type CareerConditions = {
  current_monthly_salary: number | null;
  current_annual_holidays: number | null;
  tolerable_salary_drop: number | null;
  desired_annual_holidays: number | null;
  scenario: ScenarioId;
  salary_weight: number;
};

const scenarios: ScenarioId[] = ['keep-income', 'more-holidays', 'balance'];
const numberOrNull = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : null);

function normalizeConditions(data: Partial<CareerConditions> | null): CareerConditions | null {
  if (!data) return null;
  return {
    current_monthly_salary: numberOrNull(data.current_monthly_salary),
    current_annual_holidays: numberOrNull(data.current_annual_holidays),
    tolerable_salary_drop: numberOrNull(data.tolerable_salary_drop),
    desired_annual_holidays: numberOrNull(data.desired_annual_holidays),
    scenario: scenarios.includes(data.scenario as ScenarioId) ? (data.scenario as ScenarioId) : 'keep-income',
    salary_weight: Math.min(100, Math.max(0, numberOrNull(data.salary_weight) ?? 50)),
  };
}

export async function getCareerConditions(): Promise<CareerConditions | null> {
  return normalizeConditions(await call<Partial<CareerConditions> | null>('hc_jobseeker_get_career_conditions'));
}

/** Saves, then re-reads and compares, so 「保存しました」 is only shown for what the database really holds. */
export async function saveCareerConditions(conditions: CareerConditions): Promise<CareerConditions> {
  await call('hc_jobseeker_save_career_conditions', { p_conditions: conditions });
  const stored = await getCareerConditions();
  const same = stored !== null && (Object.keys(conditions) as (keyof CareerConditions)[]).every((key) => stored[key] === conditions[key]);
  if (!stored || !same) {
    throw new Error('保存した内容を確認できませんでした。もう一度お試しください。');
  }
  return stored;
}

export async function deleteCareerConditions(): Promise<void> {
  await call('hc_jobseeker_delete_career_conditions');
  if ((await getCareerConditions()) !== null) throw new Error('保存した条件を削除できませんでした。もう一度お試しください。');
}

/** 公的統計による給与実績 (B). National-by-experience and prefecture-all-experience are never combined. */
export type OfficialWageStats = {
  reference_year: number;
  source: string;
  source_url: string | null;
  occupation: string;
  national_by_experience: {
    experience_label: string;
    experience_min_years: number;
    experience_max_years: number | null;
    monthly_scheduled_cash_yen: number | null;
    worker_count_thousand: number | null;
  }[];
  prefecture_all_experience: { prefecture: string; monthly_scheduled_cash_yen: number | null; worker_count_thousand: number | null } | null;
};

export async function getOfficialWageStats(prefecture: string): Promise<OfficialWageStats | null> {
  const data = await call<unknown>('hc_jobseeker_official_wage_stats_v1', {
    p_prefecture: prefecture || null,
    p_occupation: '保育士',
  });
  return data === null ? null : expectShape<OfficialWageStats>('hc_jobseeker_official_wage_stats_v1', data, 'national_by_experience');
}

/** Stated annual-holiday bands from postings; see docs/career-data-contract.md. */
export type HolidayBand = { from: number; to: number; label: string; exact_count: number; minimum_count: number };

export type HolidayMarket = {
  scope: { prefecture: string | null; employment_type: string | null; occupation: string | null };
  as_of: string;
  population: { scope_count: number; stated_count: number; exact_count: number; minimum_count: number; unstated_count: number };
  /** null when fewer than five postings state a number. */
  bands: HolidayBand[] | null;
};

export async function getHolidayMarket(prefecture: string): Promise<HolidayMarket> {
  return expectShape<HolidayMarket>('hc_jobseeker_holiday_market_v1', await call<unknown>('hc_jobseeker_holiday_market_v1', {
    p_prefecture: prefecture || null,
    p_employment_type: null,
    p_occupation: careerOccupation,
  }), 'population');
}

/** A read that may simply not be deployed yet: 「準備中」 is a state, not an error. */
export type Maybe<T> = { kind: 'ready'; data: T } | { kind: 'unavailable' };

export async function maybe<T>(read: () => Promise<T>): Promise<Maybe<T>> {
  try {
    return { kind: 'ready', data: await read() };
  } catch (error) {
    if (error instanceof CareerApiUnavailableError) return { kind: 'unavailable' };
    throw error;
  }
}
