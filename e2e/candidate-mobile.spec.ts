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
const interview = { id: '77777777-7777-4777-8777-777777777777', application_id: application.id, scheduled_at: '2026-10-15T01:00:00Z', duration_minutes: 60, location: '園舎1階', meeting_url: null, status: 'scheduled', updated_at: '2026-10-02T00:00:00Z', candidate_response_status: null, candidate_response_message: null, candidate_responded_at: null };
const applicationDetail = { application, interviews: [interview], visits: [] };
const facilityMessages = [{ id: '88888888-8888-4888-8888-888888888888', thread_id: '99999999-9999-4999-8999-999999999999', sender_role: 'facility', body: '面接日程のご案内です。', created_at: '2026-10-02T00:00:00Z' }];
const visit = { reservation_id: '44444444-4444-4444-8444-444444444444', job_id: jobA.id, application_id: application.id, facility_name: jobA.facility_name, job_title: jobA.title, prefecture: '東京都', city: '世田谷区', address: 'テスト1-2-3', experience_type: 'visit', starts_at: '2026-10-20T01:00:00Z', ends_at: '2026-10-20T02:00:00Z', status: 'confirmed', candidate_message: null, confirmed_at: null, cancelled_at: null, completed_at: null, created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z' };
const spotJob = { job_id: '55555555-5555-4555-8555-555555555555', facility_id: jobA.facility_id, facility_name: jobA.facility_name, facility_type: null, prefecture: '東京都', city: '世田谷区', address: null, title: '1日保育補助（テスト）', description: '午前中心の保育補助です。', work_date: '2026-10-25', start_time: '09:00:00', end_time: '15:00:00', break_minutes: 45, hourly_rate: 1400, required_count: 2, confirmed_count: 0, available_count: 2, required_qualification: null, age_group_or_class: '2歳児', facility_message: null, published_at: null, closing_at: null, application_id: null, application_status: null };
const spotAssignment = { assignment_id: '66666666-6666-4666-8666-666666666666', application_id: application.id, job_id: spotJob.job_id, facility_id: jobA.facility_id, facility_name: jobA.facility_name, facility_type: null, prefecture: '東京都', city: '世田谷区', address: null, title: '1日保育補助（確定）', work_date: '2026-10-18', start_time: '09:00:00', end_time: '15:00:00', break_minutes: 45, hourly_rate: 1400, assignment_status: 'confirmed', confirmed_at: '2026-10-02T00:00:00Z' };

type Overrides = Record<string, (route: Route, body: Record<string, unknown>) => Promise<void> | void>;

async function mockApi(page: Page, overrides: Overrides = {}) {
  const calls: string[] = [];
  // Every Supabase request (RPC, table reads, storage) is answered locally; nothing in
  // this suite ever reaches a real project.
  await page.route(/supabase\.co\//, async (route) => {
    const url = new URL(route.request().url());
    if (!url.pathname.startsWith('/rest/v1/rpc/')) return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    const name = url.pathname.split('/').pop() || '';
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
      case 'hc_jobseeker_list_ranked_jobs': return json([jobA, jobB]);
      case 'hc_jobseeker_get_application_detail': return json(applicationDetail);
      case 'hc_jobseeker_list_application_messages': return json(facilityMessages);
      case 'hc_jobseeker_mark_application_messages_read': return json(1);
      case 'hc_jobseeker_list_my_visits': return json([visit]);
      case 'hc_jobseeker_list_spot_jobs': return json([spotJob]);
      case 'hc_jobseeker_list_my_spot_assignments': return json([spotAssignment]);
      case 'hc_jobseeker_get_matching_preferences': return json({ desired_prefectures: ['東京都'], desired_cities: [], childcare_values: [], work_preferences: [] });
      case 'hc_jobseeker_get_scout_privacy': return json({ scout_opt_in: false, manual_blocks: [], automatic_blocks: [], identity_fields_shared_before_consent: false });
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

/* ------------------------------------------------- golden path + P1 screens */

async function markDocument(page: Page) {
  await page.evaluate(() => { (window as unknown as { __hcSameDocument?: boolean }).__hcSameDocument = true; });
}

async function expectSameDocument(page: Page) {
  expect(await page.evaluate(() => (window as unknown as { __hcSameDocument?: boolean }).__hcSameDocument === true), 'navigation must not reload the page').toBe(true);
}

test.describe('390px golden path and P1 screens', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('home → jobs → detail → save → apply → application detail → messages → back → reload', async ({ page }) => {
    const saved: string[] = [];
    const calls = await mockApi(page, {
      hc_jobseeker_list_saved_job_ids: (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(saved.map((job_id) => ({ job_id, saved_at: '2026-10-06T00:00:00Z' }))) }),
      hc_jobseeker_save_job: (route, body) => {
        saved.push(String(body.p_job_id));
        return route.fulfill({ status: 200, contentType: 'application/json', body: 'true' });
      },
      hc_jobseeker_submit_application: (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(application.id) }),
    });
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: 'ホーム' })).toBeVisible();
    await markDocument(page);

    await page.locator('.hc-tabbar a', { hasText: '求人' }).click();
    await expect(page).toHaveURL(/\/jobs$/);
    await expect(page.getByRole('heading', { level: 1, name: '求人を探す' })).toBeVisible();
    await expect(page.locator('.hc-tabbar a[aria-current="page"]')).toHaveText(/求人/);

    const card = page.locator(`[data-job-id="${jobA.id}"]`);
    await expect(card.locator('.hc-rank-label')).toHaveText('表示順 1');
    await card.getByRole('button', { name: '詳しく見る' }).click();
    await expect(card.getByText('仕事内容・保育観')).toBeVisible();

    await card.getByRole('button', { name: '気になるに保存' }).click();
    await expect(page.locator('.hc-toast')).toContainText('気になるに保存しました');
    await expect(card.getByRole('button', { name: '気になるから外す' })).toHaveAttribute('aria-pressed', 'true');
    expect(calls).toContain('hc_jobseeker_save_job');

    await card.getByRole('button', { name: '応募する' }).click();
    await expect(page).toHaveURL(new RegExp(`/applications\\?application_id=${application.id}`));
    await expect(page.getByRole('heading', { level: 1, name: '応募の詳細' })).toBeVisible();
    await expect(page.locator('.application-detail-hero')).toContainText(jobA.facility_name);
    await expect(page.locator(`#interview-${interview.id}`)).toContainText('この日時でOK');
    expect(calls).toContain('hc_jobseeker_submit_application');
    await expectSameDocument(page);

    expect(calls).not.toContain('hc_jobseeker_mark_application_messages_read');
    await page.getByRole('button', { name: '園とのメッセージ・書類を開く' }).click();
    await expect(page.locator('.hc-message.is-facility')).toContainText('面接日程のご案内です。');
    await expect.poll(() => calls.includes('hc_jobseeker_mark_application_messages_read')).toBe(true);
    await expectMinHeight(page, '.interview-response-actions button', 48);
    await expectNoHorizontalOverflow(page);

    await page.getByRole('button', { name: '戻る' }).click();
    await expect(page).toHaveURL(/\/jobs$/);
    await page.goForward();
    await expect(page).toHaveURL(new RegExp(`application_id=${application.id}`));
    await page.locator('.hc-tabbar a', { hasText: '応募' }).click();
    await expect(page).toHaveURL(/\/applications$/);
    await expect(page.locator('.hc-application-row')).toHaveCount(1);

    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: '応募' })).toBeVisible();
    await expect(page.locator('.hc-application-row')).toHaveCount(1);
    await expect(page.locator('.hc-tabbar a[aria-current="page"]')).toHaveText(/応募/);
  });

  test('a deep-linked job is pinned, labelled 指定求人 and opened', async ({ page }) => {
    await mockApi(page, { hc_jobseeker_get_ranked_job: (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([jobB]) }) });
    await page.goto(`/jobs?job_id=${jobB.id}`);
    const first = page.locator('.hc-job-card').first();
    await expect(first).toHaveAttribute('data-job-id', jobB.id);
    await expect(first.locator('.hc-rank-label')).toHaveText('指定求人');
    await expect(first.getByRole('button', { name: '閉じる' })).toBeVisible();
    await expect(page.locator(`[data-job-id="${jobA.id}"] .hc-rank-label`)).toHaveText('表示順 1');
  });

  test('a deep link to a job that is no longer published fails safely', async ({ page }) => {
    await mockApi(page, { hc_jobseeker_get_ranked_job: (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }) });
    await page.goto('/jobs?job_id=12121212-1212-4212-8212-121212121212');
    await expect(page.getByText('この求人は公開を終了したか、現在は表示できません。')).toBeVisible();
    await expect(page.locator('.hc-job-card')).toHaveCount(2);
  });

  test('my page menu opens P1 screens inside the same app, with back navigation', async ({ page }) => {
    await mockApi(page);
    await page.goto('/profile');
    await expect(page.getByRole('heading', { level: 1, name: 'マイページ' })).toBeVisible();
    await markDocument(page);

    for (const [label, path, heading] of [
      ['スカウト', '/scouts', 'スカウト'],
      ['見学・体験の予約', '/visits', '見学・体験'],
      ['スポット勤務', '/spot-jobs', 'スポット勤務'],
      ['マッチ度を見る', '/matches', 'マッチ度'],
      ['園を比較する', '/compare', '園を比較'],
    ] as const) {
      await page.locator('.hc-menu a', { hasText: label }).click();
      await expect(page).toHaveURL(new RegExp(`${path}$`));
      await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
      await expect(page.locator('.hc-tabbar a')).toHaveCount(5);
      await expect(page.locator('.error-banner')).toHaveCount(0);
      await expectNoHorizontalOverflow(page);
      await page.getByRole('button', { name: '戻る' }).click();
      await expect(page).toHaveURL(/\/profile$/);
    }
    await expectSameDocument(page);
  });

  test('scouts: inbox empty state, consent copy and settings on one screen', async ({ page }) => {
    await mockApi(page);
    await page.goto('/scouts');
    await expect(page.getByText('スカウトはまだ届いていません')).toBeVisible();
    await expect(page.getByText('本人情報の共有はあなたが決めます')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'スカウト設定' })).toBeVisible();
    await expect(page.locator('.hc-tabbar a[aria-current="page"]')).toHaveText(/マイページ/);
    await expectNoHorizontalOverflow(page);
  });

  test('visits: history card links back to the application; failures are errors, not empty', async ({ page }) => {
    let fail = true;
    await mockApi(page, { hc_jobseeker_list_my_visits: (route) => fail ? serverError(route) : route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([visit]) }) });
    await page.goto('/visits');
    const error = page.locator('.hc-inline-error');
    await expect(error).toBeVisible();
    await expect(page.getByText('見学・体験の予定はまだありません')).toHaveCount(0);
    fail = false;
    await error.getByRole('button', { name: 'もう一度' }).click();
    const card = page.locator(`#visit-${visit.reservation_id}`);
    await expect(card).toContainText('園見学');
    await expect(card).toContainText('確定');
    await markDocument(page);
    await card.getByRole('link', { name: '応募状況を見る' }).click();
    await expect(page).toHaveURL(new RegExp(`/applications\\?application_id=${application.id}`));
    await expect(page.getByRole('heading', { level: 1, name: '応募の詳細' })).toBeVisible();
    await expectSameDocument(page);
  });

  test('spot work: confirmed shift and open slot with date, hours, rate and break', async ({ page }) => {
    await mockApi(page);
    await page.goto(`/spot-jobs?assignment_id=${spotAssignment.assignment_id}`);
    const assignment = page.locator(`#spot-assignment-${spotAssignment.assignment_id}`);
    await expect(assignment).toContainText('勤務確定');
    await expect(assignment).toContainText('Hoiku Office シフト連携済み');
    const open = page.locator('.spot-job-card');
    await expect(open).toContainText('09:00〜15:00');
    await expect(open).toContainText('¥1,400');
    await expect(open).toContainText('45分');
    await expectMinHeight(page, '.spot-job-card .primary-button', 48);
    await expectNoHorizontalOverflow(page);
  });

  test('matching: evidence-backed scores reuse the shared job card', async ({ page }) => {
    await mockApi(page);
    await page.goto('/matches');
    await expect(page.locator('.hc-job-card')).toHaveCount(2);
    await expect(page.locator('.hc-match-evidence').first()).toContainText('条件マッチ');
    await page.getByRole('button', { name: '70%以上だけ表示' }).click();
    await expect(page.getByRole('button', { name: '70%以上だけ表示' })).toHaveAttribute('aria-pressed', 'true');
    await expectNoHorizontalOverflow(page);
  });

  test('compare: two jobs side by side, table scrolls inside its own box', async ({ page }) => {
    await mockApi(page);
    await page.goto(`/compare?job_id=${jobA.id}&job_id=${jobB.id}`);
    await expect(page.locator('.compare-table thead th')).toHaveCount(3);
    await expect(page.locator('.compare-table')).toContainText('園掲載');
    await expect(page).toHaveURL(new RegExp(`job_id=${jobA.id}.*job_id=${jobB.id}`));
    const scrollable = await page.locator('.compare-table-scroll').evaluate((el) => el.scrollWidth > el.clientWidth);
    expect(scrollable).toBe(true);
    await expectNoHorizontalOverflow(page);
  });

  test('P1 screens send only authenticated candidate RPCs', async ({ page }) => {
    const unauthenticated: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('/rest/v1/rpc/hc_jobseeker_') && !/Bearer e2e-fixture-token/.test(request.headers()['authorization'] || '')) unauthenticated.push(request.url());
    });
    await mockApi(page);
    for (const path of ['/scouts', '/visits', '/spot-jobs', '/matches', `/compare?job_id=${jobA.id}&job_id=${jobB.id}`, `/applications?application_id=${application.id}`]) {
      await page.goto(path);
      await expect(page.locator('.hc-skeleton-card')).toHaveCount(0, { timeout: 10_000 });
    }
    expect(unauthenticated).toEqual([]);
  });
});

/* ------------------------------------------------------------ layout contract */

const layoutRoutes = ['/', '/jobs', '/saved', '/applications', `/applications?application_id=${application.id}`, '/profile', '/scouts', '/visits', '/spot-jobs', '/matches', `/compare?job_id=${jobA.id}&job_id=${jobB.id}`];

type LayoutReport = {
  overflowX: number;
  sidebar: { visible: boolean; width: number; right: number };
  labels: { text: string; width: number; height: number; lineHeight: number }[];
  main: { left: number; right: number };
  tabbar: { visible: boolean; count: number; wrapped: string[] };
  titleClipped: boolean;
  outside: string[];
};

async function measureLayout(page: Page): Promise<LayoutReport> {
  return page.evaluate(() => {
    const visible = (el: Element | null) => Boolean(el && getComputedStyle(el).display !== 'none' && getComputedStyle(el).visibility !== 'hidden' && el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0);
    const sidebar = document.querySelector('.hc-sidebar');
    const sideRect = sidebar?.getBoundingClientRect();
    const main = document.querySelector('.hc-main')!.getBoundingClientRect();
    const tabs = [...document.querySelectorAll('.hc-tabbar .hc-tab')];
    const title = document.querySelector('.hc-header-title') as HTMLElement | null;
    const vw = document.documentElement.clientWidth;
    const outside = [...document.querySelectorAll('.hc-job-card, .hc-card, .hc-cta, .hc-stat-list, .hc-search, .application-detail-hero, .hc-empty, .hc-inline-error, .primary-button')]
      .filter((el) => visible(el))
      .filter((el) => { const r = el.getBoundingClientRect(); return r.left < -1 || r.right > vw + 1; })
      .map((el) => el.className.toString());
    return {
      overflowX: document.documentElement.scrollWidth - vw,
      sidebar: { visible: visible(sidebar), width: sideRect?.width ?? 0, right: sideRect?.right ?? 0 },
      labels: [...document.querySelectorAll('.hc-sidenav-label')].filter((el) => visible(el)).map((el) => {
        const r = el.getBoundingClientRect();
        return { text: el.textContent || '', width: r.width, height: r.height, lineHeight: parseFloat(getComputedStyle(el).lineHeight) };
      }),
      main: { left: main.left, right: main.right },
      tabbar: {
        visible: visible(document.querySelector('.hc-tabbar')),
        count: tabs.length,
        wrapped: tabs.map((tab) => tab.querySelector('span')!).filter((span) => span.getBoundingClientRect().height > parseFloat(getComputedStyle(span).lineHeight) * 1.5).map((span) => span.textContent || ''),
      },
      titleClipped: Boolean(title && title.scrollWidth > title.clientWidth + 1),
      outside,
    };
  });
}

for (const [width, height] of [[1280, 800], [1440, 900], [1536, 864]] as const) {
  test(`layout desktop ${width}x${height}: sidebar + main, no wrapping or overflow`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width, height });
    await mockApi(page);
    for (const route of layoutRoutes) {
      await page.goto(route);
      await expect(page.locator('.hc-header-title')).toBeVisible();
      await expect(page.locator('.hc-skeleton-card')).toHaveCount(0, { timeout: 10_000 });
      const report = await measureLayout(page);
      expect(report.overflowX, `${route} horizontal overflow`).toBeLessThanOrEqual(0);
      expect(report.sidebar.visible, `${route} sidebar visible`).toBe(true);
      expect(report.sidebar.width, `${route} sidebar width`).toBeGreaterThanOrEqual(220);
      expect(report.labels).toHaveLength(10);
      for (const label of report.labels) {
        expect(label.width, `${route} "${label.text}" label width`).toBeGreaterThanOrEqual(48);
        expect(label.height, `${route} "${label.text}" wraps beyond 2 lines`).toBeLessThanOrEqual(label.lineHeight * 2 + 1);
      }
      expect(report.main.left, `${route} main starts after the sidebar`).toBeGreaterThanOrEqual(report.sidebar.right - 1);
      expect(report.main.right, `${route} main inside viewport`).toBeLessThanOrEqual(width + 1);
      expect(report.main.right - report.main.left, `${route} main width`).toBeGreaterThanOrEqual(width - 260);
      expect(report.tabbar.visible, `${route} bottom nav hidden on desktop`).toBe(false);
      expect(report.titleClipped, `${route} header title clipped`).toBe(false);
      expect(report.outside, `${route} elements outside viewport`).toEqual([]);
    }
    await page.goto('/');
    await expect(page.locator('.hc-job-card').first()).toBeVisible();
    await page.screenshot({ path: `test-results/layout/desktop-${width}.png`, fullPage: false });
  });
}

for (const [width, height] of [[375, 812], [390, 844], [393, 852], [430, 932]] as const) {
  test(`layout mobile ${width}x${height}: bottom nav only, no overflow`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width, height });
    await mockApi(page);
    for (const route of layoutRoutes) {
      await page.goto(route);
      await expect(page.locator('.hc-header-title')).toBeVisible();
      await expect(page.locator('.hc-skeleton-card')).toHaveCount(0, { timeout: 10_000 });
      const report = await measureLayout(page);
      expect(report.overflowX, `${route} horizontal overflow`).toBeLessThanOrEqual(0);
      expect(report.sidebar.visible, `${route} sidebar hidden on mobile`).toBe(false);
      expect(report.tabbar.visible, `${route} bottom nav visible`).toBe(true);
      expect(report.tabbar.count, `${route} bottom nav items`).toBe(5);
      expect(report.tabbar.wrapped, `${route} bottom nav labels wrap`).toEqual([]);
      expect(report.main.left).toBeGreaterThanOrEqual(-1);
      expect(report.main.right).toBeLessThanOrEqual(width + 1);
      expect(report.titleClipped, `${route} header title clipped`).toBe(false);
      expect(report.outside, `${route} elements outside viewport`).toEqual([]);
    }
    await page.goto('/');
    await expect(page.locator('.hc-job-card').first()).toBeVisible();
    await page.screenshot({ path: `test-results/layout/mobile-${width}.png`, fullPage: false });
  });
}
