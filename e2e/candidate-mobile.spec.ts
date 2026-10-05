import { expect, test, type Page, type Route } from '@playwright/test';

/* ------------------------------------------------------------------ fixtures */

const jobA = {
  id: '11111111-1111-4111-8111-111111111111',
  facility_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  facility_name: 'ひだまり保育園（テスト）',
  facility_type: '認可保育園',
  prefecture: '東京都', city: '世田谷区', address: '東京都世田谷区テスト1-2-3',
  title: '保育士（正社員）',
  description: '子どもの主体性を大切にする保育です。',
  employment_type: '正社員', salary_type: 'monthly', salary_min: 240000, salary_max: 290000, salary_note: null,
  working_hours: '7:00〜19:00（シフト制・実働8時間）', holidays: '土日祝', required_qualification: '保育士資格',
  benefits: '社会保険完備', number_of_positions: 2,
  published_at: '2026-09-30T00:00:00Z', closing_at: null, spot_break_minutes: null,
  verified_workplace: null, verified_finance: null,
};
const jobB = { ...jobA, id: '22222222-2222-4222-8222-222222222222', facility_name: 'そよかぜこども園（テスト）', title: '保育教諭（パート）', employment_type: 'パート・アルバイト', salary_type: 'hourly', salary_min: 1300, salary_max: 1500, prefecture: '神奈川県', city: '横浜市' };

const searchRows = (jobs: typeof jobA[], total = jobs.length) => jobs.map((job) => ({ ...job, rank_quality: 1, rank_transparency: 1, total_count: total, has_more: false }));
const application = { id: '33333333-3333-4333-8333-333333333333', job_id: jobA.id, applicant_name: '保育 みさき', status: 'reviewing', desired_start_date: null, message: null, applied_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-02T00:00:00Z', job_title: jobA.title, employment_type: '正社員', facility_name: jobA.facility_name, prefecture: '東京都', city: '世田谷区' };
const profileComplete = { clerk_user_id: 'user_e2e_fixture', email: 'e2e@example.invalid', name: '保育 みさき', name_kana: null, phone: null, prefecture: '東京都', desired_positions: ['保育士'], desired_employment_types: ['正社員'], qualifications: ['保育士'], years_of_experience: 3, desired_start_date: null, self_intro: null };
const attention = { unanswered_interviews_count: 1, unread_messages_count: 2, pending_scouts_count: 1, next_interview: null, next_message: null, next_scout: null };

type Overrides = Record<string, (route: Route, body: Record<string, unknown>) => Promise<void> | void>;

async function mockApi(page: Page, overrides: Overrides = {}) {
  const calls: string[] = [];
  await page.route('**/rest/v1/rpc/**', async (route) => {
    const name = new URL(route.request().url()).pathname.split('/').pop() || '';
    calls.push(name);
    const body = (route.request().postDataJSON() ?? {}) as Record<string, unknown>;
    if (overrides[name]) return overrides[name](route, body);
    const json = (data: unknown) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
    switch (name) {
      case 'hc_jobseeker_list_saved_job_ids': return json([{ job_id: jobA.id, saved_at: '2026-10-01T00:00:00Z' }]);
      case 'hc_jobseeker_list_applications': return json([application]);
      case 'hc_jobseeker_get_profile': return json(profileComplete);
      case 'hc_jobseeker_search_jobs': return json(searchRows([jobA, jobB]));
      case 'hc_jobseeker_job_search_facets': return json([{ prefectures: ['東京都', '神奈川県'], employment_types: ['正社員', 'パート・アルバイト'] }]);
      case 'hc_jobseeker_attention_summary': return json(attention);
      case 'hc_jobseeker_list_notifications': return json([]);
      case 'hc_jobseeker_list_scouts': return json([]);
      case 'hc_jobseeker_list_saved_jobs_with_status': return json([{ ...jobA, is_open: true, saved_at: '2026-10-01T00:00:00Z' }]);
      case 'hc_jobseeker_get_ranked_job': return json([jobA]);
      default: return json([]);
    }
  });
  return calls;
}

const serverError = (route: Route) => route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'internal error' }) });

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
}

async function expectMinHeight(page: Page, selector: string, min: number) {
  const heights = await page.locator(selector).evaluateAll((nodes) => nodes.filter((n) => (n as HTMLElement).offsetParent !== null).map((n) => Math.round(n.getBoundingClientRect().height)));
  expect(heights.length).toBeGreaterThan(0);
  for (const height of heights) expect(height, `${selector} height`).toBeGreaterThanOrEqual(min);
}

/* --------------------------------------------------------------------- tests */

for (const width of [375, 390, 393, 430]) {
  test.describe(`${width}px`, () => {
    test.use({ viewport: { width, height: 844 } });

    test('home: header, 5-tab bottom nav, home essentials, no overflow', async ({ page }) => {
      await mockApi(page);
      await page.goto('/');
      await expect(page.getByRole('heading', { level: 1, name: 'ホーム' })).toBeVisible();

      const tabs = page.locator('.hc-tabbar a');
      await expect(tabs).toHaveCount(5);
      await expect(tabs).toHaveText(['ホーム', '求人', '気になる', '1件応募', 'マイページ'].map((label) => new RegExp(label.replace('1件', ''))));
      await expect(page.locator('.hc-tabbar a[aria-current="page"]')).toHaveText(/ホーム/);

      await expect(page.getByRole('button', { name: '求人を探す' })).toBeVisible();
      await expect(page.locator('.hc-stat-row')).toHaveCount(3);
      await expect(page.locator('.hc-stat-row').filter({ hasText: '新着メッセージ' })).toContainText('2');
      await expect(page.getByText('おすすめ求人')).toBeVisible();
      await expect(page.locator('.hc-job-card').first()).toContainText('ひだまり保育園');
      await expect(page.locator('.scout-shortcut')).toHaveCount(0);

      await expectMinHeight(page, '.hc-tabbar a', 48);
      await expectMinHeight(page, '.hc-header-actions button', 48);
      await expectMinHeight(page, '.hc-cta', 52);
      await expectMinHeight(page, '.hc-stat-row', 48);
      await expectNoHorizontalOverflow(page);
    });

    test('jobs: search first, chips, results, 16px inputs, 48px actions', async ({ page }) => {
      await mockApi(page);
      await page.goto('/jobs');
      await expect(page.getByRole('heading', { level: 1, name: '求人を探す' })).toBeVisible();
      const search = page.getByRole('searchbox', { name: 'キーワード検索' });
      await expect(search).toBeVisible();
      expect(await search.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16);
      await expect(page.getByRole('button', { name: 'HO実績データあり' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'HF実績データあり' })).toBeVisible();
      await expect(page.locator('.hc-result-bar')).toContainText('2件');
      await expect(page.locator('.hc-job-card')).toHaveCount(2);
      await expectMinHeight(page, '.hc-job-actions button', 48);
      await expectMinHeight(page, '.hc-job-card .heart-button', 48);
      await expectNoHorizontalOverflow(page);
    });
  });
}

test('search failure shows a local retryable error, never a false empty, and nav stays', async ({ page }) => {
  let fail = true;
  await mockApi(page, { hc_jobseeker_search_jobs: (route) => fail ? serverError(route) : route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(searchRows([jobA])) }) });
  await page.goto('/jobs');
  const error = page.locator('.hc-inline-error').filter({ hasText: '求人を検索できませんでした' });
  await expect(error).toBeVisible();
  await expect(page.getByText('条件に合う求人はありません')).toHaveCount(0);
  await expect(page.locator('.error-banner')).toHaveCount(0);
  await expect(page.locator('.hc-tabbar a')).toHaveCount(5);
  await expect(page.locator('.hc-skeleton-card')).toHaveCount(0);
  fail = false;
  await error.getByRole('button', { name: 'もう一度' }).click();
  await expect(page.locator('.hc-job-card')).toHaveCount(1);
  await expect(page.locator('.hc-inline-error')).toHaveCount(0);
});

test('real zero results show the empty state (not an error)', async ({ page }) => {
  await mockApi(page, { hc_jobseeker_search_jobs: (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }) });
  await page.goto('/jobs');
  await expect(page.getByText('条件に合う求人はありません')).toBeVisible();
  await expect(page.locator('.hc-inline-error')).toHaveCount(0);
  await expect(page.locator('.hc-result-bar')).toContainText('0件');
});

test('home sections fail independently; other sections still render', async ({ page }) => {
  await mockApi(page, { hc_jobseeker_list_applications: serverError, hc_jobseeker_search_jobs: serverError });
  await page.goto('/');
  await expect(page.locator('.hc-stat-row').filter({ hasText: '応募中' })).toContainText('読み込めませんでした');
  await expect(page.locator('.hc-stat-row').filter({ hasText: '気になる園' })).toContainText('1');
  await expect(page.locator('.hc-inline-error').filter({ hasText: 'おすすめ求人を読み込めませんでした' })).toBeVisible();
  await expect(page.getByText('公開中の求人はまだありません')).toHaveCount(0);
  await expect(page.locator('.error-banner')).toHaveCount(0);
  await expect(page.locator('.hc-tabbar a')).toHaveCount(5);
});

test('applications failure is an error, not "no applications"', async ({ page }) => {
  await mockApi(page, { hc_jobseeker_list_applications: serverError });
  await page.goto('/applications');
  await expect(page.locator('.hc-inline-error')).toBeVisible();
  await expect(page.getByText('応募はまだありません')).toHaveCount(0);
});

test('loading never hangs: slow reads resolve and the skeleton disappears', async ({ page }) => {
  await mockApi(page, {
    hc_jobseeker_search_jobs: async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1200));
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(searchRows([jobA])) });
    },
  });
  await page.goto('/jobs');
  await expect(page.locator('.hc-skeleton-card').first()).toBeVisible();
  await expect(page.locator('.hc-job-card')).toHaveCount(1, { timeout: 10_000 });
  await expect(page.locator('.hc-skeleton-card')).toHaveCount(0);
});

test('apply without a name: fill only what is needed, save, return to the job', async ({ page }) => {
  let savedProfile: Record<string, unknown> | null = null;
  const calls = await mockApi(page, {
    hc_jobseeker_get_profile: (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(savedProfile ?? { ...profileComplete, name: null }) }),
    hc_jobseeker_upsert_profile: (route, body) => {
      savedProfile = { ...profileComplete, name: body.p_name };
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(savedProfile) });
    },
    hc_jobseeker_submit_application: (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(application.id) }),
  });
  await page.goto('/jobs');
  await page.locator(`[data-job-id="${jobA.id}"]`).getByRole('button', { name: '応募する' }).click();
  await expect(page).toHaveURL(new RegExp(`/profile\\?return_job=${jobA.id}`));
  await expect(page.getByText('応募に必要な項目を入力して保存すると、求人に戻ります。')).toBeVisible();

  const name = page.getByLabel(/お名前/);
  expect(await name.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16);
  await name.fill('保育 みさき');
  await page.getByRole('button', { name: '保存して求人に戻る' }).click();
  await expect(page).toHaveURL(new RegExp(`/jobs\\?job_id=${jobA.id}`));
  expect(calls).toContain('hc_jobseeker_upsert_profile');
  expect(calls).not.toContain('hc_jobseeker_submit_application');
});

test('profile uses chips instead of comma-separated text', async ({ page }) => {
  await mockApi(page);
  await page.goto('/profile');
  await expect(page.getByRole('heading', { level: 1, name: 'マイページ' })).toBeVisible();
  await expect(page.getByText('カンマ区切り')).toHaveCount(0);
  const position = page.getByRole('group', { name: '希望職種' });
  await expect(position.getByRole('button', { name: '保育士' })).toHaveAttribute('aria-pressed', 'true');
  await position.getByRole('button', { name: '保育教諭' }).click();
  await expect(position.getByRole('button', { name: '保育教諭' })).toHaveAttribute('aria-pressed', 'true');
  await expectMinHeight(page, '.hc-chip-group .hc-chip', 44);
  await expectNoHorizontalOverflow(page);
});

test('signed-in reads always carry the session token (no tokenless first request)', async ({ page }) => {
  const unauthenticated: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/rest/v1/rpc/hc_jobseeker_') && !/Bearer e2e-fixture-token/.test(request.headers()['authorization'] || '')) unauthenticated.push(request.url());
  });
  await mockApi(page);
  await page.goto('/');
  await expect(page.locator('.hc-job-card').first()).toBeVisible();
  expect(unauthenticated).toEqual([]);
});
