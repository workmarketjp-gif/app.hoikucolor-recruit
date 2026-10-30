import { expect, test, type Page } from '@playwright/test';

/*
 * お給料・働き方 (Home + /career). Supabase is answered locally with FIXTURE data shaped like the real
 * aggregates (秋田県, 保育士); nothing here is production evidence. Verifies: the first screen, the three
 * measures kept apart, empty datasets hidden (never drawn as 準備中 cards), unknown holidays never treated
 * as few, private pay (storage / URL / events), honest thin-data and failure states, the five-tab
 * navigation, and layout at 320 / 375 / 390 / 430 / 768 / 1440.
 */

const fullProfile = {
  clerk_user_id: 'user_e2e_fixture', email: 'e2e@example.invalid', name: '保育 みさき', name_kana: null, phone: null,
  prefecture: '秋田県', desired_positions: ['保育士'], desired_employment_types: ['正社員'], qualifications: ['保育士'],
  years_of_experience: 6, desired_start_date: null, self_intro: null,
};
const emptyProfile = { ...fullProfile, prefecture: null, desired_positions: [], desired_employment_types: [], years_of_experience: null };
const preferences = (values: string[], prefectures = ['秋田県'], wish: number | null = 200000) => ({
  desired_prefectures: prefectures, desired_cities: [], desired_monthly_salary_min: wish, desired_hourly_wage_min: null,
  available_weekdays: [], available_time_from: null, available_time_to: null, max_commute_minutes: null,
  classroom_experience: [], leadership_roles: [], preferred_child_ages: [], childcare_values: values, work_preferences: [],
});
const savedConditions = { current_monthly_salary: 231000, current_annual_holidays: 112, tolerable_salary_drop: 10000, desired_annual_holidays: 120, scenario: 'keep-income', salary_weight: 50 };
const coverage = [{ prefecture: '宮城県', count: 120 }, { prefecture: '秋田県', count: 82 }];
const market = (prefecture: string | null, thin = false) => ({
  scope: { prefecture, employment_type: null, occupation: 'hoikushi' },
  as_of: '2026-10-30T03:00:00Z',
  population: { total_count: 22151, scope_count: thin ? 3 : 82, monthly_count: thin ? 2 : 53, not_monthly_count: 29, occupation_verified_count: 82, implausible_count: 0 },
  monthly_lower_bound: thin ? null : {
    count: 53, median: 198000, q1: 188000, q3: 209000, min: 175000, max: 285600,
    histogram: [{ from: 160000, to: 180000, count: 6 }, { from: 180000, to: 200000, count: 21 }, { from: 200000, to: 220000, count: 16 }, { from: 220000, to: 240000, count: 8 }, { from: 240000, to: 260000, count: 1 }, { from: 280000, to: 300000, count: 1 }],
  },
  holidays: { scope_count: 82, verified_count: 47 },
  facets: { coverage, employment_types: ['正社員'] },
});
const holidayMarket = {
  scope: { prefecture: '秋田県', employment_type: null, occupation: 'hoikushi' }, as_of: '2026-10-30T03:00:00Z',
  population: { scope_count: 82, stated_count: 47, exact_count: 45, minimum_count: 2, unstated_count: 35 },
  bands: [
    { from: 50, to: 104, label: '104日以下', exact_count: 1, minimum_count: 0 }, { from: 105, to: 109, label: '105〜109日', exact_count: 9, minimum_count: 0 },
    { from: 110, to: 114, label: '110〜114日', exact_count: 10, minimum_count: 0 }, { from: 115, to: 119, label: '115〜119日', exact_count: 4, minimum_count: 0 },
    { from: 120, to: 124, label: '120〜124日', exact_count: 17, minimum_count: 2 }, { from: 125, to: 200, label: '125日以上', exact_count: 4, minimum_count: 0 },
  ],
};
const longName = 'ひだまりの森こども園（社会福祉法人ひだまり会 第二分園・小規模保育事業所併設）';
const salaryJobs = {
  ready: true, total: 12, unknown_holidays: 0,
  jobs: [
    { id: '11111111-1111-4111-8111-111111111111', facility_name: longName, title: '保育士（正社員）', prefecture: '秋田県', employment_type: '正社員', salary_min: 240000, salary_max: 260000, annual_holidays_days: null, annual_holidays_basis: null, reach: 'lower-bound' },
    { id: '22222222-2222-4222-8222-222222222222', facility_name: 'こもれび認定こども園', title: '保育教諭', prefecture: '秋田県', employment_type: '正社員', salary_min: 215000, salary_max: 240000, annual_holidays_days: null, annual_holidays_basis: null, reach: 'upper-bound-only' },
  ],
};
const holidayJobs = {
  ready: true, total: 9, unknown_holidays: 35,
  jobs: [
    { id: '33333333-3333-4333-8333-333333333333', facility_name: 'あおぞら保育園', title: '保育士', prefecture: '秋田県', employment_type: '正社員', salary_min: 205000, salary_max: 205000, annual_holidays_days: 125, annual_holidays_basis: 'minimum', reach: 'lower-bound' },
    { id: '44444444-4444-4444-8444-444444444444', facility_name: 'もりのこ保育園', title: '保育士', prefecture: '秋田県', employment_type: '正社員', salary_min: 198000, salary_max: 210000, annual_holidays_days: 122, annual_holidays_basis: 'exact', reach: 'lower-bound' },
  ],
};

type Mode = {
  profile?: 'full' | 'empty';
  conditions?: 'saved' | 'none';
  values?: string[];
  holidays?: 'ok' | 'missing';
  official?: 'missing' | 'data';
  market?: 'ok' | 'fail' | 'thin';
  holidayJobs?: 'ok' | 'thin';
};

async function mockApi(page: Page, mode: Mode = {}) {
  const requests: string[] = [];
  const calls: { name: string; body: Record<string, unknown> }[] = [];
  let saved: Record<string, unknown> | null = mode.conditions === 'none' ? null : savedConditions;
  await page.route(/supabase\.co\//, async (route) => {
    const request = route.request();
    requests.push(`${request.url()} ${request.postData() ?? ''}`);
    const name = new URL(request.url()).pathname.split('/').pop() || '';
    const body = (request.postDataJSON() ?? {}) as Record<string, unknown>;
    calls.push({ name, body });
    const json = (data: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
    const missing = () => json({ code: 'PGRST202', message: 'Could not find the function' }, 404);
    switch (name) {
      case 'hc_jobseeker_get_profile': return json(mode.profile === 'empty' ? emptyProfile : fullProfile);
      case 'hc_jobseeker_get_matching_preferences': return json(mode.profile === 'empty' ? preferences([], [], null) : preferences(mode.values ?? ['子ども主体', '外遊び重視']));
      case 'hc_jobseeker_get_career_conditions': return json(saved);
      case 'hc_jobseeker_save_career_conditions': saved = body.p_conditions as Record<string, unknown>; return json(saved);
      case 'hc_jobseeker_salary_market_v1':
        if (mode.market === 'fail') return json({ code: 'XX000', message: 'boom' }, 500);
        return json(market((body.p_prefecture as string | null) ?? null, mode.market === 'thin' && body.p_prefecture === '秋田県'));
      case 'hc_jobseeker_holiday_market_v1': return mode.holidays === 'ok' ? json(holidayMarket) : missing();
      case 'hc_jobseeker_official_wage_stats_v1':
        return mode.official === 'data'
          ? json({ reference_year: 2025, source: '賃金構造基本統計調査', source_url: 'https://www.e-stat.go.jp/', occupation: '保育士', national_by_experience: [{ experience_label: '5〜9年', experience_min_years: 5, experience_max_years: 9, monthly_scheduled_cash_yen: 255000, worker_count_thousand: 3.4 }], prefecture_all_experience: null })
          : missing();
      case 'hc_jobseeker_career_scenario_jobs_v1':
        if (body.p_scenario === 'balance') return json(mode.holidayJobs === 'thin' && body.p_prefecture === '秋田県' ? { ready: false, missing: 'verified_holidays', unknown_holidays: 80 } : holidayJobs);
        return json(body.p_salary_line === null ? { ready: false, missing: 'salary_line' } : salaryJobs);
      case 'hc_jobseeker_attention_summary': return json({ unanswered_interviews_count: 0, unread_messages_count: 0, pending_scouts_count: 0, next_interview: null, next_message: null });
      default: return json([]);
    }
  });
  return { requests, calls };
}

const events = (page: Page) => page.evaluate(() => (window as unknown as { __hcEvents?: Record<string, unknown>[] }).__hcEvents ?? []);

async function quality(page: Page, scope = '.hc-companion') {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, 'horizontal overflow').toBeLessThanOrEqual(1);
  const tiny = await page.evaluate((root) => [...document.querySelectorAll<HTMLElement>(`${root} *`)]
    .filter((node) => node.offsetParent !== null && [...node.childNodes].some((child) => child.nodeType === 3 && child.textContent?.trim()))
    .filter((node) => parseFloat(getComputedStyle(node).fontSize) < 14)
    .map((node) => `${node.tagName}.${node.className}:${node.textContent?.trim().slice(0, 20)}`), scope);
  expect(tiny, 'text smaller than 14px').toEqual([]);
  const small = await page.evaluate((root) => [...document.querySelectorAll<HTMLElement>(`${root} a, ${root} button, ${root} summary, ${root} select, ${root} input`)]
    .filter((node) => node.offsetParent !== null && node.getBoundingClientRect().height < 44)
    .map((node) => node.textContent?.trim().slice(0, 20) || node.tagName), scope);
  expect(small, 'targets shorter than 44px').toEqual([]);
}

for (const width of [320, 375, 390, 430, 768, 1440]) {
  test(`home: question-led first screen, three measures, quiet gaps at ${width}px`, async ({ page }) => {
    const height = width >= 768 ? 900 : 844;
    await page.setViewportSize({ width, height });
    const { requests } = await mockApi(page);
    await page.goto('/');

    // Five-second understanding: the promise and the one action are on the first screen.
    await expect(page.getByRole('heading', { level: 2, name: 'あなたに合う働き方、見つけてみませんか？' })).toBeVisible();
    await expect(page.getByText('お給料も、お休みも、保育への想いも。あなたが大切にしたいことから探せます。')).toBeVisible();
    const primary = page.getByRole('button', { name: '私のお給料、比べてみる' });
    await expect(primary).toBeVisible();
    const box = (await primary.boundingBox())!;
    const tabbar = width < 900 ? 68 : 0;
    expect(box.y + box.height, 'primary action above the fold').toBeLessThanOrEqual(height - tabbar);

    if (process.env.HC_SHOT_DIR) await page.screenshot({ path: `${process.env.HC_SHOT_DIR}/first-${width}.png` });

    // Open the check: the saved pay is offered only after 月給 is chosen.
    await primary.click();
    await expect(page.getByRole('heading', { level: 2, name: '今のお給料はどのくらい？' })).toBeVisible();
    await expect(page.locator('.hc-compare-card.is-own')).toHaveCount(0);
    await page.getByRole('button', { name: '月給', exact: true }).click();
    await expect(page.getByLabel('月給（額面）')).toHaveValue('23.1');

    const own = page.locator('.hc-compare-card.is-own');
    const posted = page.locator('.hc-compare-card.is-posted');
    await expect(own).toContainText('23.1万円');
    await expect(posted).toContainText('19.8万円');
    await expect(posted).toContainText('書かれている月給の真ん中あたり');
    await expect(page.getByText('今のお給料は、求人票に書かれた月給の真ん中あたりより 3.3万円 高めです。')).toBeVisible();
    await expect(page.getByText('求人票の金額は募集の条件で、実際に支払われた給与ではありません。')).toBeVisible();

    // Datasets that cannot help yet are not drawn at all.
    await expect(page.locator('.hc-compare-card.is-official')).toHaveCount(0);
    const text = await page.locator('main').innerText();
    for (const banned of ['準備中', '公表データ', 'データがありません', '未取得', '四分位', 'パーセンタイル', '中央50%']) expect(text, banned).not.toContain(banned);

    // Statistics stay available on demand.
    await page.getByText('詳しいデータを見る').click();
    await expect(page.locator('.hc-more-table').first()).toContainText('21件');
    await expect(page.locator('.hc-more')).toContainText('いちばん低い金額（下限）で数えています');
    await expect(page.locator('.hc-more')).toContainText('公的統計（厚生労働省）の給与との比較は、データの準備ができ次第お届けします');

    // Discovery paths: real jobs, 「以上」 kept, unknown holidays not counted as few.
    const panel = page.getByRole('region', { name: 'お給料を大切にしたい' });
    await expect(panel.locator('.hc-opp')).toHaveCount(2);
    await expect(panel.locator('.hc-opp-link').first()).toHaveAttribute('href', '/jobs?job_id=11111111-1111-4111-8111-111111111111');
    await page.getByRole('button', { name: /お休みを増やしたい/ }).click();
    const holidays = page.getByRole('region', { name: 'お休みを増やしたい' });
    await expect(holidays).toContainText('年間休日');
    await expect(holidays).toContainText('125日以上');
    await expect(holidays).toContainText('休みが少ないという意味ではありません');
    await page.getByRole('button', { name: /自分らしい保育をしたい/ }).click();
    await expect(page.locator('.hc-chip-list li')).toHaveText(['子ども主体', '外遊び重視']);
    await expect(page.getByRole('link', { name: /保育観に合う求人を見る/ })).toHaveAttribute('href', '/matches');

    await quality(page);
    if (process.env.HC_SHOT_DIR) await page.screenshot({ path: `${process.env.HC_SHOT_DIR}/companion-${width}.png`, fullPage: true });

    // Private pay: only in the authenticated request body, never a URL, storage or an event.
    for (const entry of requests) expect(entry.split(' ')[0]).not.toMatch(/231000|23\.1|e2e@example|user_e2e_fixture/);
    expect(await page.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }))).not.toMatch(/231000|23\.1/);
    expect(page.url()).not.toMatch(/231000|salary|holiday/);
    const sent = await events(page);
    expect(sent.find((event) => event.name === 'hc_dashboard_view')).toMatchObject({ profile_state: 'complete' });
    expect(JSON.stringify(sent)).not.toMatch(/231000|198000|秋田|e2e@|user_e2e|みさき/);
  });
}

test('official statistics appear as their own card only when a figure exists, never blended', async ({ page }) => {
  await mockApi(page, { official: 'data', holidays: 'ok' });
  await page.goto('/');
  await page.getByRole('button', { name: '私のお給料、比べてみる' }).click();
  await page.getByRole('button', { name: '月給', exact: true }).click();
  const official = page.locator('.hc-compare-card.is-official');
  await expect(official).toContainText('公的統計で見る実際の給与');
  await expect(official).toContainText('25.5万円');
  await expect(official).toContainText('賞与を含まない所定内給与');
  await expect(page.locator('.hc-compare-card')).toHaveCount(3);
  await page.getByText('詳しいデータを見る').click();
  await expect(page.locator('.hc-more')).toContainText('年間休日が書かれた求人の分布');
  await expect(page.locator('.hc-more')).not.toContainText('データの準備ができ次第');
});

test('no saved pay: browsing needs no private data; the holiday path leads', async ({ page }) => {
  await mockApi(page, { profile: 'empty', conditions: 'none', values: [] });
  await page.goto('/');
  await page.getByRole('button', { name: '私のお給料、比べてみる' }).click();
  await expect(page.locator('.hc-compare-card.is-posted')).toContainText('万円');
  await expect(page.locator('.hc-compare-card.is-own')).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'お休みを増やしたい' }).locator('.hc-opp')).toHaveCount(2);
  await page.getByRole('button', { name: /お給料を大切にしたい/ }).click();
  await expect(page.getByLabel('月給の目安')).toBeVisible();
  await page.getByRole('button', { name: /自分らしい保育をしたい/ }).click();
  await expect(page.getByRole('link', { name: /大切にしたい保育を選ぶ/ })).toHaveAttribute('href', '/scouts');
  const sent = await events(page);
  expect(sent.find((event) => event.name === 'hc_dashboard_view')).toMatchObject({ profile_state: 'empty', first_view: true });
  expect(sent.filter((event) => event.name === 'hc_dashboard_cta').map((event) => event.cta)).toEqual(['salary_check', 'path_salary', 'path_values']);
});

test('hourly pay is not forced into a monthly comparison and still leads somewhere', async ({ page }) => {
  await mockApi(page);
  await page.goto('/');
  await page.getByRole('button', { name: '私のお給料、比べてみる' }).click();
  await page.getByRole('button', { name: '時給', exact: true }).click();
  await expect(page.getByText('時給の求人は、時間の決め方がさまざまなため')).toBeVisible();
  await expect(page.getByRole('link', { name: '時給の求人を、求人を探すで見る' })).toHaveAttribute('href', '/jobs');
  await expect(page.locator('.hc-compare-card.is-own')).toHaveCount(0);
});

test('a thin region says so plainly and offers the whole country', async ({ page }) => {
  const { calls } = await mockApi(page, { market: 'thin', holidayJobs: 'thin' });
  await page.goto('/');
  await page.getByRole('button', { name: '私のお給料、比べてみる' }).click();
  await expect(page.getByText(/月給が書かれた求人が2件と少なく/)).toBeVisible();
  await page.getByRole('button', { name: /お休みを増やしたい/ }).click();
  await expect(page.getByText('秋田県では、年間休日の日数が書かれた求人がまだ少ないようです。')).toBeVisible();
  await page.getByRole('button', { name: '全国の求人で比べる' }).click();
  await expect(page.locator('.hc-compare-card.is-posted')).toContainText('19.8万円');
  await expect(page.getByLabel('さがす地域')).toHaveValue('');
  expect(calls.some((call) => call.name === 'hc_jobseeker_salary_market_v1' && call.body.p_prefecture === null)).toBe(true);
});

test('saving pay is verified by reading it back, and offered only after a change', async ({ page }) => {
  const { calls } = await mockApi(page, { conditions: 'none' });
  await page.goto('/');
  await page.getByRole('button', { name: '私のお給料、比べてみる' }).click();
  await page.getByRole('button', { name: '月給', exact: true }).click();
  await page.getByLabel('月給（額面）').fill('22.5');
  await expect(page.getByText('今のお給料は、求人票に書かれた月給の真ん中あたりより 2.7万円 高めです。')).toBeVisible();
  await page.getByRole('button', { name: 'この金額を保存する' }).click();
  await expect(page.getByText('この金額を保存しました。あなただけが見られます。')).toBeVisible();
  const saved = calls.find((call) => call.name === 'hc_jobseeker_save_career_conditions');
  expect(saved?.body).toMatchObject({ p_conditions: { current_monthly_salary: 225000, scenario: 'keep-income', salary_weight: 50 } });
  expect(calls.filter((call) => call.name === 'hc_jobseeker_get_career_conditions').length).toBeGreaterThanOrEqual(2);
});

test('a failed read is local and retryable; the rest of the screen still works', async ({ page }) => {
  await mockApi(page, { market: 'fail' });
  await page.goto('/');
  await page.getByRole('button', { name: '私のお給料、比べてみる' }).click();
  const alert = page.locator('#salary-check').getByRole('alert');
  await expect(alert).toBeVisible();
  await expect(alert.getByRole('button', { name: 'もう一度' })).toBeVisible();
  await expect(page.locator('.hc-compare-card.is-posted')).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'お給料を大切にしたい' }).locator('.hc-opp')).toHaveCount(2);
});

test('five destinations; applications and messages stay one tap away under マイページ', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await mockApi(page);
  await page.goto('/');
  const tabs = page.locator('.hc-tabbar a');
  await expect(tabs).toHaveText(['ホーム', '求人を探す', 'お給料', '気になる', 'マイページ'].map((label) => new RegExp(label)));
  await expect(page.locator('.hc-tabbar a[aria-current="page"]')).toHaveText(/ホーム/);
  const wrapped = await page.evaluate(() => [...document.querySelectorAll('.hc-tab-label')].filter((span) => span.getBoundingClientRect().height > parseFloat(getComputedStyle(span).lineHeight) * 1.5).map((span) => span.textContent));
  expect(wrapped).toEqual([]);
  await tabs.filter({ hasText: 'お給料' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'お給料・働き方' })).toBeVisible();
  await expect(page.locator('.hc-tabbar a[aria-current="page"]')).toHaveText(/お給料/);
  await expect(page.getByRole('heading', { level: 2, name: '今のお給料はどのくらい？' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: '条件を細かく決めて、くわしく比べる' })).toBeVisible();
  await tabs.filter({ hasText: 'マイページ' }).click();
  await expect(page.getByRole('navigation', { name: '応募・やりとり' }).getByRole('link')).toHaveText([/応募管理/, /メッセージ/]);
  await page.getByRole('navigation', { name: '応募・やりとり' }).getByRole('link', { name: /応募管理/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: '応募管理' })).toBeVisible();
  await expect(page.locator('.hc-tabbar a[aria-current="page"]')).toHaveText(/マイページ/);
  await expect(page.getByRole('button', { name: '戻る' })).toBeVisible();
});

test('reduced motion and 200% zoom keep the screen readable without horizontal scroll', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 640, height: 900 }); // 320 CSS px at 200%
  await mockApi(page);
  await page.goto('/');
  await page.getByRole('button', { name: '私のお給料、比べてみる' }).click();
  await page.getByRole('button', { name: '月給', exact: true }).click();
  await expect(page.locator('.hc-compare-card.is-posted')).toBeVisible();
  await page.evaluate(() => { document.body.style.zoom = '2'; });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, 'horizontal overflow at 200%').toBeLessThanOrEqual(1);
  const wide = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('.hc-companion *:not(.hc-hero-flower, .hc-hero-flower *)')].filter((node) => node.getBoundingClientRect().right > window.innerWidth + 1).map((node) => `${node.tagName}.${node.className}`).slice(0, 5));
  expect(wide, 'elements wider than the screen').toEqual([]);
});

test('keyboard: the action, choices and details are reachable, labelled and announced', async ({ page }) => {
  await mockApi(page);
  await page.goto('/');
  const primary = page.getByRole('button', { name: '私のお給料、比べてみる' });
  await primary.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#salary-check')).toBeFocused();
  const monthly = page.getByRole('button', { name: '月給', exact: true });
  await monthly.focus();
  await page.keyboard.press('Enter');
  await expect(monthly).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('status').filter({ hasText: '高めです' })).toBeVisible();
  const summary = page.getByText('詳しいデータを見る');
  await summary.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.hc-more-table').first()).toBeVisible();
});
