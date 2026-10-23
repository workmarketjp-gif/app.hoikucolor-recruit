import { expect, test, type Page } from '@playwright/test';

/*
 * 転職シミュレーター. Supabase is answered locally. Market fixtures mirror the real shape of the
 * public feed on 2026-10-23 (秋田県 98 / 宮城県 49 / 千葉県 1 postings, no verified annual holidays),
 * but are test data only. Verifies states (準備中 / failure / thin data), save → restore, that typed
 * pay never leaves the page, and layout at 320 / 375 / 390 / 768 / 1440.
 */

const profile = {
  clerk_user_id: 'user_e2e_fixture', email: 'e2e@example.invalid', name: '保育 みさき', name_kana: null, phone: null,
  prefecture: '東京都', desired_positions: ['保育士'], desired_employment_types: ['正社員'], qualifications: ['保育士'],
  years_of_experience: 5, desired_start_date: null, self_intro: null,
};
const preferences = {
  desired_prefectures: ['秋田県'], desired_cities: [], desired_monthly_salary_min: 200000, desired_hourly_wage_min: null,
  available_weekdays: [], available_time_from: null, available_time_to: null, max_commute_minutes: null,
  classroom_experience: [], leadership_roles: [], preferred_child_ages: [], childcare_values: [], work_preferences: [],
};
const coverage = [{ prefecture: '千葉県', count: 1 }, { prefecture: '秋田県', count: 98 }, { prefecture: '宮城県', count: 49 }];
const facets = { coverage, employment_types: ['パート労働者', '正社員', '正社員以外'] };
const akitaStats = {
  count: 53, median: 198000, q1: 188000, q3: 209000, min: 175000, max: 285600,
  histogram: [{ from: 160000, to: 180000, count: 6 }, { from: 180000, to: 200000, count: 21 }, { from: 200000, to: 220000, count: 16 }, { from: 220000, to: 240000, count: 8 }, { from: 240000, to: 260000, count: 1 }, { from: 280000, to: 300000, count: 1 }],
};
const market = (prefecture: string | null, occupation: string | null = null) => ({
  scope: { prefecture, employment_type: null, occupation },
  as_of: '2026-10-23T03:00:00Z',
  population: prefecture === '東京都'
    ? { total_count: 151, scope_count: 0, monthly_count: 0, not_monthly_count: 0, occupation_verified_count: 0, implausible_count: 0 }
    : { total_count: 151, scope_count: prefecture === '秋田県' ? 98 : 151, monthly_count: prefecture === '秋田県' ? 53 : 88, not_monthly_count: 45, occupation_verified_count: 0, implausible_count: 0 },
  monthly_lower_bound: prefecture === '東京都' ? null : akitaStats,
  holidays: { scope_count: 98, verified_count: 0 },
  facets,
});
const keepIncome = {
  ready: true, total: 46, unknown_holidays: 0,
  jobs: [
    { id: '11111111-1111-4111-8111-111111111111', facility_name: 'ひだまり保育園', title: '保育士（正社員）', prefecture: '秋田県', employment_type: '正社員', salary_min: 250000, salary_max: 250000, annual_holidays_days: null, annual_holidays_basis: null, reach: 'lower-bound' },
    { id: '22222222-2222-4222-8222-222222222222', facility_name: 'こもれび認定こども園', title: '保育教諭', prefecture: '秋田県', employment_type: '正社員', salary_min: 215000, salary_max: 240000, annual_holidays_days: null, annual_holidays_basis: null, reach: 'upper-bound-only' },
  ],
};

type Mode = { market?: 'ok' | 'missing' | 'fail'; official?: 'missing' | 'data'; conditions?: 'missing' | 'ok' };

async function mockApi(page: Page, mode: Mode = {}) {
  const calls: { name: string; body: Record<string, unknown> }[] = [];
  let saved: Record<string, unknown> | null = null;
  const requests: string[] = [];
  await page.route(/supabase\.co\//, async (route) => {
    const request = route.request();
    requests.push(`${request.url()} ${request.postData() ?? ''}`);
    const url = new URL(request.url());
    const name = url.pathname.split('/').pop() || '';
    const body = (request.postDataJSON() ?? {}) as Record<string, unknown>;
    calls.push({ name, body });
    const json = (data: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
    const missing = () => json({ code: 'PGRST202', message: 'Could not find the function' }, 404);
    switch (name) {
      case 'hc_jobseeker_get_profile': return json(profile);
      case 'hc_jobseeker_get_matching_preferences': return json(preferences);
      case 'hc_jobseeker_salary_market_v1':
        if (mode.market === 'missing') return missing();
        if (mode.market === 'fail') return json({ code: 'XX000', message: 'boom' }, 500);
        return json(market((body.p_prefecture as string | null) ?? null, (body.p_occupation as string | null) ?? null));
      case 'hc_jobseeker_career_scenario_jobs_v1':
        if (mode.market === 'missing') return missing();
        if (body.p_scenario === 'more-holidays') return json({ ready: true, total: 0, unknown_holidays: 26, jobs: [] });
        if (body.p_scenario === 'balance') return json({ ready: false, missing: 'verified_holidays', unknown_holidays: 53 });
        return json(body.p_salary_line === null ? { ready: false, missing: 'salary_line' } : keepIncome);
      case 'hc_jobseeker_get_career_conditions':
        return mode.conditions === 'missing' ? missing() : json(saved);
      case 'hc_jobseeker_save_career_conditions': saved = body.p_conditions as Record<string, unknown>; return json(saved);
      case 'hc_jobseeker_delete_career_conditions': saved = null; return json(null);
      case 'hc_jobseeker_official_wage_stats_v1':
        if (mode.official !== 'data') return missing();
        return json({
          reference_year: 2025, source: '賃金構造基本統計調査', source_url: 'https://www.e-stat.go.jp/', occupation: '保育士',
          national_by_experience: [
            { experience_label: '0年', experience_min_years: 0, experience_max_years: 0, monthly_scheduled_cash_yen: 215000, worker_count_thousand: 1.2 },
            { experience_label: '5〜9年', experience_min_years: 5, experience_max_years: 9, monthly_scheduled_cash_yen: 255000, worker_count_thousand: 3.4 },
          ],
          prefecture_all_experience: { prefecture: '秋田県', monthly_scheduled_cash_yen: 228000, worker_count_thousand: 0.9 },
        });
      case 'hc_jobseeker_attention_summary': return json({ unanswered_interviews_count: 0, unread_messages_count: 0, pending_scouts_count: 0, next_interview: null, next_message: null });
      default: return json([]);
    }
  });
  return { calls, requests };
}

async function quality(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, 'horizontal overflow').toBeLessThanOrEqual(1);
  const tiny = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('.hc-career *')]
    .filter((node) => node.offsetParent !== null && [...node.childNodes].some((child) => child.nodeType === 3 && child.textContent?.trim()))
    .filter((node) => parseFloat(getComputedStyle(node).fontSize) < 13)
    .map((node) => `${node.tagName}.${node.className}:${node.textContent?.trim().slice(0, 20)}`));
  expect(tiny, 'text smaller than 13px').toEqual([]);
}

for (const width of [320, 375, 390, 768, 1440]) {
  test(`aggregate market, three measures, no leaks at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const { requests } = await mockApi(page, { official: 'data' });
    await page.goto('/career');

    await expect(page.getByRole('heading', { name: /秋田県の募集給与/ })).toBeVisible();
    await expect(page.getByLabel('希望の最低月給')).toHaveValue('20');
    await expect(page.getByText('全国や、ほかの地域の相場ではありません')).toBeVisible();
    await expect(page.getByText('職種は求人タイトルから分類した「保育士」の求人です')).toBeVisible();
    await expect(page.getByText('19.8万円').first()).toBeVisible();

    await page.getByLabel('今の月給（額面）').fill('23');
    await page.getByLabel('今の年間休日').fill('110');
    await expect(page.getByText('求人票の中央値より 3.2万円 高い金額です')).toBeVisible();
    await expect(page.getByText('あなたの価値や能力を示すものではありません')).toBeVisible();
    await expect(page.getByRole('list', { name: /募集給与（月給の下限）の分布/ })).toContainText('あなた');
    // 公的統計 is a separate measure with its own row for 経験5年 (not combined with 秋田県).
    await expect(page.locator('.hc-career-official li.is-mine')).toContainText('5〜9年');
    await expect(page.getByText('地域別と経験年数別は別々の集計で、組み合わせていません')).toBeVisible();

    await expect(page.locator('.hc-career-jobs a').first()).toContainText('月給 25万円');
    await expect(page.locator('.hc-career-jobs a').nth(1)).toContainText('上限なら届く幅');

    await page.getByRole('button', { name: '休みを増やす' }).click();
    await expect(page.getByText('年間休日が確認できない26件は、休日の順位に入れていません')).toBeVisible();
    await page.getByRole('button', { name: 'バランス' }).click();
    await expect(page.getByText('年間休日が確認できた求人が、まだ足りません')).toBeVisible();

    await page.screenshot({ path: `test-results/career-${width}.png`, fullPage: true });
    await quality(page);

    expect(page.url()).not.toMatch(/23|230000|110/);
    expect(await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }))).not.toContain('230000');
    // Typed pay only ever travels in POST bodies of the scenario query (never in any URL), and never to the market or official-statistics reads.
    expect(requests.filter((r) => r.split(' ')[0].includes('230000') || r.split(' ')[0].includes('110'))).toEqual([]);
    expect(requests.filter((r) => /salary_market_v1|official_wage_stats_v1/.test(r) && /230000|110/.test(r))).toEqual([]);
  });
}

test('save, restore after reload, and delete', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  const { calls } = await mockApi(page);
  await page.goto('/career');
  await page.getByLabel('今の月給（額面）').fill('23');
  await page.getByLabel('今の年間休日').fill('110');
  await page.getByLabel('希望の年間休日').fill('120');
  await page.getByRole('button', { name: 'この条件を保存する' }).click();
  await expect(page.getByText('保存しました')).toBeVisible();
  const save = calls.find((c) => c.name === 'hc_jobseeker_save_career_conditions');
  expect(save?.body.p_conditions).toMatchObject({ current_monthly_salary: 230000, current_annual_holidays: 110, desired_annual_holidays: 120, scenario: 'keep-income' });
  expect(JSON.stringify(save?.body)).not.toContain('clerk_user_id');

  await page.reload();
  await expect(page.getByLabel('今の月給（額面）')).toHaveValue('23');
  await expect(page.getByLabel('今の年間休日')).toHaveValue('110');

  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: '保存した条件を削除' }).click();
  await expect(page.getByText('保存した条件を削除しました')).toBeVisible();
  await expect(page.getByLabel('今の月給（額面）')).toHaveValue('');
});

test('API not deployed shows 準備中, never numbers', async ({ page }) => {
  await mockApi(page, { market: 'missing', official: 'missing', conditions: 'missing' });
  await page.goto('/career');
  await expect(page.getByText('求人の相場は準備中です')).toBeVisible();
  await expect(page.getByText('求人の比較は準備中です')).toBeHidden(); // scenarios wait for the market
  await expect(page.getByText('条件の保存は準備中です')).toBeVisible();
  await expect(page.getByText('中央値')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'この条件を保存する' })).toHaveCount(0);
});

test('failed market read is an error with retry, not an empty market', async ({ page }) => {
  await mockApi(page, { market: 'fail' });
  await page.goto('/career');
  await expect(page.getByRole('alert').filter({ hasText: '求人の相場を読み込めませんでした' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'もう一度' }).first()).toBeVisible();
});

test('a saved region without postings says so instead of showing a median', async ({ page }) => {
  await mockApi(page);
  await page.route("**/rpc/hc_jobseeker_get_matching_preferences", (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...preferences, desired_prefectures: ['東京都'] }) }));
  await page.goto('/career');
  await expect(page.getByText('この条件で公開中の求人はありません')).toBeVisible();
  await expect(page.getByText('中央値')).toHaveCount(0);
});

test('keyboard reaches every control and focus is visible', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockApi(page);
  await page.goto('/career');
  await expect(page.getByRole('heading', { name: /秋田県の募集給与/ })).toBeVisible();
  await page.getByLabel('今の月給（額面）').focus();
  for (let i = 0; i < 6; i += 1) await page.keyboard.press('Tab');
  const focused = await page.evaluate(() => document.activeElement?.tagName);
  expect(['SELECT', 'INPUT', 'BUTTON']).toContain(focused);
  await page.getByRole('button', { name: '休みを増やす' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: '休みを増やす' })).toHaveAttribute('aria-pressed', 'true');
});

test('200% text and reduced motion keep the layout intact', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 640, height: 900 }); // 320 CSS px at 200%
  await mockApi(page, { official: 'data' });
  await page.goto('/career');
  await expect(page.getByRole('heading', { name: /秋田県の募集給与/ })).toBeVisible();
  await page.evaluate(() => { document.body.style.zoom = '2'; });
  await page.screenshot({ path: 'test-results/career-zoom200.png', fullPage: true });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, 'horizontal overflow at 200%').toBeLessThanOrEqual(1);
});
