import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CareerApiUnavailableError, daysFromText, deleteCareerConditions, formatMan,
  getCareerConditions, getCareerScenarioJobs, getHolidayMarket, getMatchingPreferencesForCareer,
  getOfficialWageStats, getPostedSalaryMarket, manFromYen, saveCareerConditions,
  scenarioSalaryLine, yenFromMan,
} from '../src/lib/careerApi.ts';

const conditions = {
  current_monthly_salary: 230000,
  current_annual_holidays: 110,
  tolerable_salary_drop: 10000,
  desired_annual_holidays: 120,
  scenario: 'more-holidays',
  salary_weight: 40,
};

function rpcClient(responses) {
  const calls = [];
  const client = {
    async rpc(name, args) {
      calls.push({ name, args });
      const value = responses[name];
      if (typeof value === 'function') return value(args);
      if (value instanceof Error) return { data: null, error: { code: value.message, message: value.message } };
      return { data: value, error: null };
    },
  };
  return { client, calls };
}

test('monthly salary inputs are yen, not raw man or annualized estimates', () => {
  assert.equal(yenFromMan('23.5'), 235000);
  assert.equal(yenFromMan(''), null);
  assert.equal(yenFromMan('not-a-salary'), null);
  assert.equal(yenFromMan('-1'), null);
  assert.equal(yenFromMan('201'), null);
  assert.equal(manFromYen(235000), '23.5');
  assert.equal(formatMan(235000), '23.5万円');
});

test('days are explicit bounded values; unknown is not zero', () => {
  assert.equal(daysFromText('125'), 125);
  assert.equal(daysFromText(''), null);
  assert.equal(daysFromText('-1'), null);
  assert.equal(daysFromText('367'), null);
  assert.equal(daysFromText('unknown'), null);
});

test('more holidays salary floor honors acceptable drop without inventing income', () => {
  assert.equal(scenarioSalaryLine('more-holidays', 230000, 10000, 250000), 220000);
  assert.equal(scenarioSalaryLine('more-holidays', null, 10000, 250000), null);
  assert.equal(scenarioSalaryLine('keep-income', null, null, 250000), 250000);
  assert.equal(scenarioSalaryLine('balance', 230000, null, 250000), 230000);
});

test('career conditions save reads back canonical state before success', async () => {
  const { client, calls } = rpcClient({
    hc_jobseeker_save_career_conditions: true,
    hc_jobseeker_get_career_conditions: conditions,
  });
  assert.deepEqual(await saveCareerConditions(client, conditions), conditions);
  assert.deepEqual(calls, [
    { name: 'hc_jobseeker_save_career_conditions', args: { p_conditions: conditions } },
    { name: 'hc_jobseeker_get_career_conditions', args: undefined },
  ]);
});

test('mismatched canonical save rejects an unconfirmed success', async () => {
  const { client } = rpcClient({
    hc_jobseeker_save_career_conditions: true,
    hc_jobseeker_get_career_conditions: { ...conditions, salary_weight: 50 },
  });
  await assert.rejects(saveCareerConditions(client, conditions), /保存した内容を確認できません/);
});

test('deletion requires canonical readback of null', async () => {
  const { client, calls } = rpcClient({ hc_jobseeker_delete_career_conditions: true, hc_jobseeker_get_career_conditions: null });
  await deleteCareerConditions(client);
  assert.deepEqual(calls.map((item) => item.name), ['hc_jobseeker_delete_career_conditions', 'hc_jobseeker_get_career_conditions']);
  const mismatched = rpcClient({ hc_jobseeker_delete_career_conditions: true, hc_jobseeker_get_career_conditions: conditions });
  await assert.rejects(deleteCareerConditions(mismatched.client), /削除できませんでした/);
});

test('missing RPC is explicitly unavailable, not a valid zero-valued market', async () => {
  const { client } = rpcClient({ hc_jobseeker_salary_market_v1: new Error('PGRST202') });
  await assert.rejects(getPostedSalaryMarket(client, ''), CareerApiUnavailableError);
});

test('unexpected posted market shape fails rather than fabricates metrics', async () => {
  const { client } = rpcClient({ hc_jobseeker_salary_market_v1: [] });
  await assert.rejects(getPostedSalaryMarket(client, ''), /unexpected shape/);
});

test('posted salary and official wage use separate canonical sources and occupation filters', async () => {
  const market = {
    population: { total_count: 7, scope_count: 7, monthly_count: 6, not_monthly_count: 1, occupation_verified_count: 7, implausible_count: 0 },
    facets: { coverage: [{ prefecture: '東京都', count: 7 }], employment_types: ['正社員'] },
    monthly_lower_bound: { median: 230000, q1: 220000, q3: 250000, count: 6, min: 200000, max: 300000, histogram: [] },
  };
  const official = { reference_year: 2025, national_by_experience: [], source: 'synthetic', occupation: '保育士', prefecture_all_experience: null };
  const { client, calls } = rpcClient({ hc_jobseeker_salary_market_v1: market, hc_jobseeker_official_wage_stats_v1: official });
  assert.equal((await getPostedSalaryMarket(client, '東京都', '正社員')).monthly_lower_bound.median, 230000);
  assert.equal((await getOfficialWageStats(client, '東京都')).reference_year, 2025);
  assert.deepEqual(calls[0].args, { p_prefecture: '東京都', p_employment_type: '正社員', p_occupation: 'hoikushi' });
  assert.deepEqual(calls[1].args, { p_prefecture: '東京都', p_occupation: '保育士' });
});

test('scenario arguments preserve explicit holidays and never calculate matching in client', async () => {
  const response = { ready: true, total: 0, unknown_holidays: 2, jobs: [] };
  const { client, calls } = rpcClient({ hc_jobseeker_career_scenario_jobs_v1: response });
  assert.deepEqual(await getCareerScenarioJobs(client, {
    scenario: 'balance', prefecture: '大阪府', employmentType: '',
    salaryLine: null, holidayMoreThan: null, holidayAtLeast: 120, salaryWeight: 0,
  }), response);
  assert.deepEqual(calls[0].args, {
    p_scenario: 'balance', p_prefecture: '大阪府', p_employment_type: null,
    p_salary_line: null, p_holiday_floor: null, p_holiday_at_least: 120,
    p_salary_weight: 0, p_limit: 5, p_occupation: 'hoikushi',
  });
});

test('preferences do not invent desired values and holiday bands are canonical', async () => {
  const holidays = { population: { scope_count: 0, stated_count: 0, exact_count: 0, minimum_count: 0, unstated_count: 0 }, bands: null };
  const { client, calls } = rpcClient({ hc_jobseeker_get_matching_preferences: null, hc_jobseeker_holiday_market_v1: holidays });
  assert.deepEqual(await getMatchingPreferencesForCareer(client), { desired_prefectures: [], desired_monthly_salary_min: null, childcare_values: [] });
  assert.deepEqual(await getHolidayMarket(client, ''), holidays);
  assert.equal(calls[1].args.p_occupation, 'hoikushi');
});

test('stored conditions preserve exact values and coerce only invalid scenario and weight', async () => {
  const { client } = rpcClient({ hc_jobseeker_get_career_conditions: { ...conditions, scenario: 'invalid', salary_weight: 200 } });
  const read = await getCareerConditions(client);
  assert.equal(read.scenario, 'keep-income');
  assert.equal(read.salary_weight, 100);
  assert.equal(read.current_monthly_salary, 230000);
});
