import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Hoiku Color Web /career parity: use the identical owner-scoped RPCs and
 * keep personal figures in component memory until explicit save. No local
 * market estimates, persisted cache, analytics payloads or invented figures.
 *
 * Web reference: src/lib/careerRepository.ts at fa779e73b324d07c2a2b10ec0c5e7ea71bd283a6.
 */
export type CareerScenarioId = 'keep-income' | 'more-holidays' | 'balance';

export type CareerConditions = {
  current_monthly_salary: number | null;
  current_annual_holidays: number | null;
  tolerable_salary_drop: number | null;
  desired_annual_holidays: number | null;
  scenario: CareerScenarioId;
  salary_weight: number;
};

export type PostedSalaryMarket = {
  scope: { prefecture: string | null; employment_type: string | null; occupation: string | null };
  as_of: string;
  population: {
    total_count: number; scope_count: number; monthly_count: number;
    not_monthly_count: number; occupation_verified_count: number; implausible_count: number;
  };
  monthly_lower_bound: null | {
    count: number; median: number; q1: number; q3: number; min: number; max: number;
    histogram: { from: number; to: number; count: number }[];
  };
  holidays: { scope_count: number; verified_count: number };
  facets: { coverage: { prefecture: string; count: number }[]; employment_types: string[] };
};

export type OfficialWageStats = {
  reference_year: number;
  source: string;
  source_url: string | null;
  occupation: string;
  national_by_experience: {
    experience_label: string; experience_min_years: number; experience_max_years: number | null;
    monthly_scheduled_cash_yen: number | null; worker_count_thousand: number | null;
  }[];
  prefecture_all_experience: {
    prefecture: string; monthly_scheduled_cash_yen: number | null; worker_count_thousand: number | null;
  } | null;
};

export type HolidayMarket = {
  scope: { prefecture: string | null; employment_type: string | null; occupation: string | null };
  as_of: string;
  population: {
    scope_count: number; stated_count: number; exact_count: number;
    minimum_count: number; unstated_count: number;
  };
  bands: { from: number; to: number; label: string; exact_count: number; minimum_count: number }[] | null;
};

export type CareerScenarioJob = {
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

export type CareerScenarioResponse =
  | { ready: false; missing: 'salary_line' | 'verified_holidays'; unknown_holidays?: number }
  | { ready: true; total: number; unknown_holidays: number; jobs: CareerScenarioJob[] };

export type MatchingPreferencesForCareer = {
  desired_prefectures: string[];
  desired_monthly_salary_min: number | null;
  childcare_values: string[];
};

export type CareerScenarioRequest = {
  scenario: CareerScenarioId; prefecture: string; employmentType: string;
  salaryLine: number | null; holidayMoreThan: number | null;
  holidayAtLeast: number | null; salaryWeight: number;
};

export class CareerApiUnavailableError extends Error {
  constructor(name: string) {
    super(name + ' is not available');
    this.name = 'CareerApiUnavailableError';
  }
}

const scenarios: CareerScenarioId[] = ['keep-income', 'more-holidays', 'balance'];

function validObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

async function call(client: SupabaseClient, name: string, args?: Record<string, unknown>): Promise<unknown> {
  const { data, error } = await client.rpc(name, args);
  if (error) {
    if (error.code === 'PGRST202' || error.code === '42883') throw new CareerApiUnavailableError(name);
    throw error;
  }
  return data;
}

function requiredObject<T>(name: string, value: unknown, key: string): T {
  if (!validObject(value) || !(key in value)) throw new Error(name + ' returned an unexpected shape');
  return value as T;
}

export function yenFromMan(value: string): number | null {
  const number = Number(value);
  return value.trim() !== '' && Number.isFinite(number) && number >= 0 && number <= 200
    ? Math.round(number * 10000)
    : null;
}

export function daysFromText(value: string): number | null {
  const number = Number(value);
  return value.trim() !== '' && Number.isFinite(number) && number >= 0 && number <= 366
    ? Math.round(number)
    : null;
}

export function manFromYen(value: number | null): string {
  return value === null ? '' : String(value / 10000);
}

export function formatMan(value: number): string {
  return (value / 10000).toFixed(1).replace(/\.0$/, '') + '万円';
}

/**
 * Exactly the Web histogram presentation: fill missing posted-salary bins and
 * show a private own-salary position without calculating any market statistic.
 * The counts themselves are always those returned by the canonical RPC.
 */
export function withYourPosition(
  histogram: { from: number; to: number; count: number }[],
  own: number | null,
  binSize = 20000,
): { from: number; to: number; count: number; containsYou: boolean }[] {
  if (!histogram.length) return [];
  const counts = new Map(histogram.map((row) => [row.from, row.count]));
  const youBin = own === null ? null : Math.floor(own / binSize) * binSize;
  const starts = histogram.map((row) => row.from);
  const lowest = Math.min(...starts, youBin ?? Infinity);
  const highest = Math.max(...starts, youBin ?? -Infinity);
  const result: { from: number; to: number; count: number; containsYou: boolean }[] = [];
  for (let from = lowest; from <= highest; from += binSize) {
    result.push({ from, to: from + binSize, count: counts.get(from) ?? 0, containsYou: youBin === from });
  }
  return result;
}

export function scenarioSalaryLine(
  scenario: CareerScenarioId, own: number | null, drop: number | null, desired: number | null,
): number | null {
  if (scenario === 'more-holidays') return own === null ? null : Math.max(0, own - (drop ?? 0));
  return own ?? desired;
}

export function normalizeCareerConditions(value: unknown): CareerConditions | null {
  if (value === null) return null;
  if (!validObject(value)) throw new Error('保存した条件を確認できませんでした。');
  return {
    current_monthly_salary: numberOrNull(value.current_monthly_salary),
    current_annual_holidays: numberOrNull(value.current_annual_holidays),
    tolerable_salary_drop: numberOrNull(value.tolerable_salary_drop),
    desired_annual_holidays: numberOrNull(value.desired_annual_holidays),
    scenario: scenarios.includes(value.scenario as CareerScenarioId) ? value.scenario as CareerScenarioId : 'keep-income',
    salary_weight: Math.min(100, Math.max(0, numberOrNull(value.salary_weight) ?? 50)),
  };
}

export async function getCareerConditions(client: SupabaseClient): Promise<CareerConditions | null> {
  return normalizeCareerConditions(await call(client, 'hc_jobseeker_get_career_conditions'));
}

export async function saveCareerConditions(client: SupabaseClient, conditions: CareerConditions): Promise<CareerConditions> {
  await call(client, 'hc_jobseeker_save_career_conditions', { p_conditions: conditions });
  const saved = await getCareerConditions(client);
  const keys = Object.keys(conditions) as (keyof CareerConditions)[];
  if (!saved || !keys.every((key) => saved[key] === conditions[key])) {
    throw new Error('保存した内容を確認できませんでした。もう一度お試しください。');
  }
  return saved;
}

export async function deleteCareerConditions(client: SupabaseClient): Promise<void> {
  await call(client, 'hc_jobseeker_delete_career_conditions');
  if (await getCareerConditions(client)) {
    throw new Error('保存した条件を削除できませんでした。もう一度お試しください。');
  }
}

export async function getMatchingPreferencesForCareer(client: SupabaseClient): Promise<MatchingPreferencesForCareer> {
  const value = await call(client, 'hc_jobseeker_get_matching_preferences');
  if (value === null) return { desired_prefectures: [], desired_monthly_salary_min: null, childcare_values: [] };
  if (!validObject(value)) throw new Error('希望条件を確認できませんでした。');
  const row = value;
  const texts = (key: string): string[] => Array.isArray(row[key]) ? (row[key] as unknown[]).filter((x): x is string => typeof x === 'string') : [];
  return {
    desired_prefectures: texts('desired_prefectures'),
    desired_monthly_salary_min: numberOrNull(row.desired_monthly_salary_min),
    childcare_values: texts('childcare_values'),
  };
}

export async function getPostedSalaryMarket(
  client: SupabaseClient, prefecture: string, employmentType = '',
): Promise<PostedSalaryMarket> {
  const value = await call(client, 'hc_jobseeker_salary_market_v1', {
    p_prefecture: prefecture || null,
    p_employment_type: employmentType || null,
    p_occupation: 'hoikushi',
  });
  const result = requiredObject<PostedSalaryMarket>('hc_jobseeker_salary_market_v1', value, 'population');
  if (!validObject(result.population) || !validObject(result.facets)) throw new Error('募集給与の集計結果を確認できませんでした。');
  return result;
}

export async function getOfficialWageStats(client: SupabaseClient, prefecture: string): Promise<OfficialWageStats | null> {
  const value = await call(client, 'hc_jobseeker_official_wage_stats_v1', {
    p_prefecture: prefecture || null, p_occupation: '保育士',
  });
  return value === null ? null : requiredObject<OfficialWageStats>('hc_jobseeker_official_wage_stats_v1', value, 'national_by_experience');
}

export async function getHolidayMarket(client: SupabaseClient, prefecture: string): Promise<HolidayMarket> {
  const value = await call(client, 'hc_jobseeker_holiday_market_v1', {
    p_prefecture: prefecture || null, p_employment_type: null, p_occupation: 'hoikushi',
  });
  return requiredObject<HolidayMarket>('hc_jobseeker_holiday_market_v1', value, 'population');
}

export async function getCareerScenarioJobs(client: SupabaseClient, request: CareerScenarioRequest): Promise<CareerScenarioResponse> {
  const value = await call(client, 'hc_jobseeker_career_scenario_jobs_v1', {
    p_scenario: request.scenario,
    p_prefecture: request.prefecture || null,
    p_employment_type: request.employmentType || null,
    p_salary_line: request.salaryLine,
    p_holiday_floor: request.holidayMoreThan,
    p_holiday_at_least: request.holidayAtLeast,
    p_salary_weight: request.salaryWeight,
    p_limit: 5,
    p_occupation: 'hoikushi',
  });
  const result = requiredObject<CareerScenarioResponse>('hc_jobseeker_career_scenario_jobs_v1', value, 'ready');
  if (result.ready !== true && result.ready !== false) throw new Error('求人比較の結果を確認できませんでした。');
  if (result.ready && (!Array.isArray(result.jobs) || typeof result.total !== 'number')) {
    throw new Error('求人比較の結果を確認できませんでした。');
  }
  return result;
}
