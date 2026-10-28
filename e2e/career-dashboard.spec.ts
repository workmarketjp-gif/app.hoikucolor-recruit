import { expect, test, type Page } from '@playwright/test';

/*
 * キャリアダッシュボード (Home). Supabase is answered locally with test data shaped like the real
 * aggregates (秋田県, 保育士). Verifies: the three salary measures stay apart, own pay is hidden until
 * shown, 「以上」 holidays, honest empty / 準備中 / failure states, the scenario hand-off, events carry
 * no personal data, and layout at 320 / 375 / 390 / 768 / 1440.
 */

const fullProfile = {
  clerk_user_id: 'user_e2e_fixture', email: 'e2e@example.invalid', name: '保育 みさき', name_kana: null, phone: null,
  prefecture: '秋田県', desired_positions: ['保育士'], desired_employment_types: ['正社員'], qualifications: ['保育士'],
  years_of_experience: 6, desired_start_date: null, self_intro: null,
};
const emptyProfile = { ...fullProfile, prefecture: null, desired_positions: [], desired_employment_types: [], years_of_experience: null };
const preferences = (values: string[] = ['子ども主体', '外遊び重視']) => ({
  desired_prefectures: ['秋田県'], desired_cities: [], desired_monthly_salary_min: 200000, desired_hourly_wage_min: null,
  available_weekdays: [], available_time_from: null, available_time_to: null, max_commute_minutes: null,
  classroom_experience: [], leadership_roles: [], preferred_child_ages: [], childcare_values: values, work_preferences: [],
});
const savedConditions = { current_monthly_salary: 231000, current_annual_holidays: 112, tolerable_salary_drop: 10000, desired_annual_holidays: 120, scenario: 'keep-income', salary_weight: 50 };
const market = {
  scope: { prefecture: '秋田県', employment_type: null, occupation: 'hoikushi' },
  as_of: '2026-10-28T03:00:00Z',
  population: { total_count: 21891, scope_count: 82, monthly_count: 53, not_monthly_count: 29, occupation_verified_count: 82, implausible_count: 0 },
  monthly_lower_bound: {
    count: 53, median: 198000, q1: 188000, q3: 209000, min: 175000, max: 285600,
    histogram: [{ from: 160000, to: 180000, count: 6 }, { from: 180000, to: 200000, count: 21 }, { from: 200000, to: 220000, count: 16 }, { from: 220000, to: 240000, count: 8 }, { from: 240000, to: 260000, count: 1 }, { from: 280000, to: 300000, count: 1 }],
  },
  holidays: { scope_count: 82, verified_count: 47 },
  facets: { coverage: [{ prefecture: '秋田県', count: 82 }], employment_types: ['正社員'] },
};
const holidayMarket = {
  scope: market.scope, as_of: market.as_of,
  population: { scope_count: 82, stated_count: 47, exact_count: 45, minimum_count: 2, unstated_count: 35 },
  bands: [
    { from: 50, to: 104, label: '104日以下', exact_count: 1, minimum_count: 0 },
    { from: 105, to: 109, label: '105〜109日', exact_count: 9, minimum_count: 0 },
    { from: 110, to: 114, label: '110〜114日', exact_count: 10, minimum_count: 0 },
    { from: 115, to: 119, label: '115〜119日', exact_count: 4, minimum_count: 0 },
    { from: 120, to: 124, label: '120〜124日', exact_count: 17, minimum_count: 2 },
    { from: 125, to: 200, label: '125日以上', exact_count: 4, minimum_count: 0 },
  ],
};
const longName = 'ひだまりの森こども園（社会福祉法人ひだまり会 第二分園・小規模保育事業所併設）';
const scenarioJobs = {
  ready: true, total: 12, unknown_holidays: 3,
  jobs: [
    { id: '11111111-1111-4111-8111-111111111111', facility_name: longName, title: '保育士（正社員）', prefecture: '秋田県', employment_type: '正社員', salary_min: 240000, salary_max: 260000, annual_holidays_days: 125, annual_holidays_basis: 'minimum', reach: 'lower-bound' },
    { id: '22222222-2222-4222-8222-222222222222', facility_name: 'こもれび認定こども園', title: '保育教諭', prefecture: '秋田県', employment_type: '正社員', salary_min: 215000, salary_max: 240000, annual_holidays_days: null, annual_holidays_basis: null, reach: 'upper-bound-only' },
  ],
};

type Mode = {
  profile?: 'full' | 'empty';
  conditions?: 'saved' | 'none';
  holidays?: 'ok' | 'missing';
  market?: 'ok' | 'fail';
  values?: string[];
};

async function mockApi(page: Page, mode: Mode = {}) {
  const requests: string[] = [];
  await page.route(/supabase\.co\//, async (route) => {
    const request = route.request();
    requests.push(`${request.url()} ${request.postData() ?? ''}`);
    const name = new URL(request.url()).pathname.split('/').pop() || '';
    const body = (request.postDataJSON() ?? {}) as Record<string, unknown>;
    const json = (data: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
    const missing = () => json({ code: 'PGRST202', message: 'Could not find the function' }, 404);
    switch (name) {
      case 'hc_jobseeker_get_profile': return json(mode.profile === 'empty' ? emptyProfile : fullProfile);
      case 'hc_jobseeker_get_matching_preferences': return json(mode.profile === 'empty' ? { ...preferences(mode.values), desired_prefectures: [], desired_monthly_salary_min: null } : preferences(mode.values));
      case 'hc_jobseeker_get_career_conditions': return json(mode.conditions === 'none' ? null : savedConditions);
      case 'hc_jobseeker_salary_market_v1': return mode.market === 'fail' ? json({ code: 'XX000', message: 'boom' }, 500) : json(market);
      case 'hc_jobseeker_holiday_market_v1': return mode.holidays === 'missing' ? missing() : json(holidayMarket);
      case 'hc_jobseeker_official_wage_stats_v1': return missing();
      case 'hc_jobseeker_career_scenario_jobs_v1':
        if (body.p_scenario === 'balance') return json({ ready: false, missing: 'verified_holidays', unknown_holidays: 35 });
        return json(body.p_salary_line === null ? { ready: false, missing: 'salary_line' } : scenarioJobs);
      case 'hc_jobseeker_attention_summary': return json({ unanswered_interviews_count: 0, unread_messages_count: 0, pending_scouts_count: 0, next_interview: null, next_message: null });
      default: return json([]);
    }
  });
  return { requests };
}

const events = (page: Page) => page.evaluate(() => (window as unknown as { __hcEvents?: Record<string, unknown>[] }).__hcEvents ?? []);

async function quality(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, 'horizontal overflow').toBeLessThanOrEqual(1);
  const tiny = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('.hc-dash *')]
    .filter((node) => node.offsetParent !== null && [...node.childNodes].some((child) => child.nodeType === 3 && child.textContent?.trim()))
    .filter((node) => parseFloat(getComputedStyle(node).fontSize) < 14)
    .map((node) => `${node.tagName}.${node.className}:${node.textContent?.trim().slice(0, 20)}`));
  expect(tiny, 'text smaller than 14px').toEqual([]);
  const small = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('.hc-dash a, .hc-dash button, .hc-dash summary')]
    .filter((node) => node.offsetParent !== null && node.getBoundingClientRect().height < 44)
    .map((node) => node.textContent?.trim().slice(0, 20)));
  expect(small, 'targets shorter than 44px').toEqual([]);
}

for (const width of [320, 375, 390, 768, 1440]) {
  test(`dashboard: three measures, private pay, holidays, honest gaps at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const { requests } = await mockApi(page);
    await page.goto('/');

    await expect(page.getByRole('heading', { level: 2, name: 'あなたのキャリア' })).toBeVisible();
    const facts = page.locator('.hc-dash-facts');
    await expect(facts).toContainText('秋田県');
    await expect(facts).toContainText('6年');
    await expect(facts).toContainText('保育士');
    await expect(facts).toContainText('正社員');
    await expect(page.locator('.hc-dash-primary')).toHaveText(/条件に合う求人を比べる/);

    // Three measures, separately labelled; official statistics are not registered yet.
    const own = page.locator('.hc-dash-metric.is-own');
    const posted = page.locator('.hc-dash-metric.is-posted');
    const official = page.locator('.hc-dash-metric.is-official');
    await expect(posted).toContainText('19.8万円');
    await expect(posted).toContainText('中央の50%：18.8万円〜20.9万円');
    await expect(posted).toContainText('実際に支払われた額ではありません');
    await expect(official).toContainText('準備中');
    await expect(official).not.toContainText('万円');

    // Own pay is hidden until the person asks.
    await expect(own).toContainText('非表示');
    await expect(own).not.toContainText('23.1万円');
    await own.getByRole('button', { name: '金額を表示する' }).click();
    await expect(own).toContainText('23.1万円');
    await expect(own.getByRole('button', { name: '金額を隠す' })).toHaveAttribute('aria-pressed', 'true');

    // Stated holidays only, 「以上」 kept, the person's band marked, a table alternative.
    const bars = page.getByRole('list', { name: /秋田県の年間休日の分布/ });
    await expect(bars.locator('li')).toHaveCount(6);
    await expect(bars.locator('li.is-you')).toContainText('110〜114日');
    await expect(page.getByText('「◯日以上」と書かれた2件は、その下限の日数で数えています。')).toBeVisible();
    await page.locator('.hc-dash-holidays summary').click();
    await expect(page.locator('.hc-dash-holidays table')).toContainText('19件');

    // No published source → stated, not estimated.
    for (const metric of ['有休の取得率・取得日数', '月平均の残業時間', '平均勤続年数', '離職率', '育児休業の取得・復帰']) {
      await expect(page.locator('.hc-dash-missing div').filter({ hasText: metric })).toContainText('公表データはまだありません');
    }
    await expect(page.getByText('マッチ率は表示しません')).toBeVisible();
    await expect(page.locator('.hc-dash-chips li')).toHaveText(['子ども主体', '外遊び重視']);

    // Scenario jobs reuse the simulator rules and open the posting.
    const jobs = page.locator('#dash-jobs-heading').locator('xpath=ancestor::section');
    await expect(jobs.locator('.hc-career-jobs li')).toHaveCount(2);
    await expect(jobs).toContainText('年間休日 125日以上');
    await expect(jobs.locator('.hc-career-jobs a').first()).toHaveAttribute('href', '/jobs?job_id=11111111-1111-4111-8111-111111111111');
    await jobs.getByRole('button', { name: 'バランス' }).click();
    await expect(jobs).toContainText('年間休日の日数が書かれた求人が少ないため');

    await quality(page);
    // Local visual QA: HC_SHOT_DIR=<dir> saves a full-page capture per width.
    if (process.env.HC_SHOT_DIR) await page.screenshot({ path: `${process.env.HC_SHOT_DIR}/dashboard-${width}.png`, fullPage: true });

    // Personal numbers go only in the authenticated RPC body (as on /career): never in a URL,
    // query string, browser storage or analytics event.
    for (const entry of requests) expect(entry.split(' ')[0]).not.toMatch(/231000|23\.1|e2e@example|user_e2e_fixture/);
    expect(await page.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }))).not.toMatch(/231000|23\.1/);
    expect(page.url()).not.toMatch(/231000|salary|holiday/);
    const sent = await events(page);
    expect(sent.find((event) => event.name === 'hc_dashboard_view')).toMatchObject({ profile_state: 'complete' });
    expect(JSON.stringify(sent)).not.toMatch(/231000|198000|秋田|e2e@|user_e2e|みさき/);
  });
}

test('empty profile: one next action to the existing profile form, events say only the state', async ({ page }) => {
  await mockApi(page, { profile: 'empty', conditions: 'none', values: [] });
  await page.goto('/');
  await expect(page.locator('.hc-dash-facts .is-missing')).toHaveCount(4);
  const primary = page.locator('.hc-dash-primary');
  await expect(primary).toHaveText(/希望条件を登録する/);
  await expect(primary).toHaveAttribute('href', '/profile');
  await expect(page.locator('.hc-dash-metric.is-own')).toContainText('未入力');
  await expect(page.getByText('今の月給か、希望の最低月給を入れると並べられます。')).toBeVisible();
  await expect(page.getByText('大切にしたい保育観はまだ登録されていません。')).toBeVisible();
  await primary.click();
  await expect(page).toHaveURL(/\/profile$/);
  const sent = await events(page);
  expect(sent.find((event) => event.name === 'hc_dashboard_view')).toMatchObject({ profile_state: 'empty', first_view: true });
  expect(sent.find((event) => event.name === 'hc_dashboard_cta')).toEqual({ name: 'hc_dashboard_cta', cta: 'profile' });
});

test('holiday distribution not deployed yet: 準備中 with the real stated count, no bars', async ({ page }) => {
  await mockApi(page, { holidays: 'missing' });
  await page.goto('/');
  const holidays = page.locator('.hc-dash-holidays');
  await expect(holidays).toContainText('年間休日の分布は準備中です。');
  await expect(holidays).toContainText('82件のうち、年間休日の日数が書かれているのは47件です。');
  await expect(holidays.locator('li')).toHaveCount(0);
});

test('a failed market read is local, retryable and never replaced by sample values', async ({ page }) => {
  await mockApi(page, { market: 'fail' });
  await page.goto('/');
  const posted = page.locator('.hc-dash-metric.is-posted');
  await expect(posted.getByRole('alert')).toBeVisible();
  await expect(posted.getByRole('button', { name: 'もう一度' })).toBeVisible();
  await expect(posted).not.toContainText('中央値');
  await expect(page.locator('.hc-dash-holidays li')).toHaveCount(6);
  await expect(page.getByRole('heading', { name: 'あなたに合う求人' })).toBeVisible();
});

test('reduced motion and 200% zoom keep the dashboard readable without horizontal scroll', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  // 768px at 200% zoom lays out like a 384px screen with every text twice as large.
  await page.setViewportSize({ width: 768, height: 1024 });
  await mockApi(page);
  await page.goto('/');
  await expect(page.locator('.hc-dash-holidays li')).toHaveCount(6);
  await page.addStyleTag({ content: 'html { zoom: 2; }' });
  await expect(page.locator('.hc-dash-primary')).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test('keyboard: the next action, reveal and table toggles are reachable and labelled', async ({ page }) => {
  await mockApi(page);
  await page.goto('/');
  await expect(page.locator('.hc-dash-primary')).toBeVisible();
  const reveal = page.getByRole('button', { name: '金額を表示する' });
  await reveal.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: '金額を隠す' })).toBeFocused();
  const summary = page.locator('.hc-dash-metric.is-posted summary');
  await summary.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.hc-dash-metric.is-posted table')).toBeVisible();
  await expect(page.locator('.hc-dash-range-track')).toHaveAttribute('aria-label', /中央値は19\.8万円/);
});
