import { expect, test, type Page } from '@playwright/test';

/*
 * 転職シミュレーター. Supabase is answered locally with fixture postings (never production data).
 * Checks the typed numbers stay on the page (no storage, URL or network write) and that the
 * mobile layout has no horizontal overflow or tiny text.
 */

const profile = {
  clerk_user_id: 'user_e2e_fixture', email: 'e2e@example.invalid', name: '保育 みさき', name_kana: null, phone: null,
  prefecture: '東京都', desired_positions: ['保育士'], desired_employment_types: ['正社員'], qualifications: ['保育士'],
  years_of_experience: 5, desired_start_date: null, self_intro: null,
};
const preferences = {
  desired_prefectures: ['東京都'], desired_cities: [], desired_monthly_salary_min: 220000, desired_hourly_wage_min: null,
  available_weekdays: [], available_time_from: null, available_time_to: null, max_commute_minutes: null,
  classroom_experience: [], leadership_roles: [], preferred_child_ages: [], childcare_values: [], work_preferences: [],
};

const postings: [string, number, number, string | null, string][] = [
  ['11111111-1111-4111-8111-111111111111', 200000, 240000, '年間休日110日', '東京都'],
  ['22222222-2222-4222-8222-222222222222', 220000, 220000, '年間休日120日', '東京都'],
  ['33333333-3333-4333-8333-333333333333', 250000, 300000, '年間休日125日', '東京都'],
  ['44444444-4444-4444-8444-444444444444', 230000, 260000, '土日祝休み', '東京都'],
  ['55555555-5555-4555-8555-555555555555', 210000, 250000, '年間休日115日', '東京都'],
  ['66666666-6666-4666-8666-666666666666', 180000, 200000, '年間休日130日', '東京都'],
  ['77777777-7777-4777-8777-777777777777', 190000, 210000, null, '大阪府'],
];
const jobs = postings.map(([id, min, max, holidays, prefecture], index) => ({
  id, facility_id: id, facility_name: `ひだまり保育園 第${index + 1}園`, facility_type: null, prefecture, city: null, address: null,
  title: '保育士（正社員）', description: '', employment_type: '正社員', salary_type: 'monthly', salary_min: min, salary_max: max,
  salary_note: null, working_hours: null, holidays, required_qualification: null, benefits: null, number_of_positions: 1,
  published_at: '2026-10-01T00:00:00Z', closing_at: null, verified_workplace: null, verified_finance: null,
}));

async function mockApi(page: Page) {
  const writes: string[] = [];
  await page.route(/supabase\.co\//, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const json = (data: unknown) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
    const name = url.pathname.split('/').pop() || '';
    if (/^hc_(?!.*list).*(upsert|save|submit)/.test(name)) writes.push(name);
    switch (name) {
      case 'hc_jobseeker_get_profile': return json(profile);
      case 'hc_jobseeker_get_matching_preferences': return json(preferences);
      case 'hc_jobseeker_list_ranked_jobs': return json(jobs);
      case 'hc_jobseeker_attention_summary': return json({ unanswered_interviews_count: 0, unread_messages_count: 0, pending_scouts_count: 0, next_interview: null, next_message: null });
      default: return json([]);
    }
  });
  return writes;
}

for (const width of [375, 390]) {
  test(`career simulation at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    const writes = await mockApi(page);
    await page.goto('/career');

    await expect(page.getByRole('heading', { name: '東京都の募集給与' })).toBeVisible();
    // 6 Tokyo postings -> a median is allowed; the Osaka posting is not counted.
    await expect(page.getByText('6件').first()).toBeVisible();
    await expect(page.getByLabel('希望の最低月給')).toHaveValue('22');

    await page.getByLabel('今の月給（額面）').fill('23');
    await page.getByLabel('今の年間休日').fill('110');
    await page.getByLabel('下がってもよい月給').fill('2');
    await expect(page.getByText('あなたの価値や能力を示すものではありません')).toBeVisible();
    await expect(page.getByRole('list', { name: '募集給与（下限）の分布' })).toContainText('あなた');

    await page.getByRole('button', { name: '休みを増やす' }).click();
    const links = page.locator('.hc-career-jobs a');
    await expect(links.first()).toContainText('年間休日 125日（+15日）');
    await expect(page.getByText('休日が読み取れない1件は除外')).toBeVisible();

    await page.screenshot({ path: `test-results/career-${width}.png`, fullPage: true });

    // Nothing typed is persisted, sent, or put in the address bar.
    expect(page.url()).not.toMatch(/230000|23/);
    expect(await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }))).not.toContain('230000');
    expect(writes).toEqual([]);

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, 'horizontal overflow').toBeLessThanOrEqual(1);
    const tiny = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('.hc-career *')]
      .filter((node) => node.offsetParent !== null && [...node.childNodes].some((child) => child.nodeType === 3 && child.textContent?.trim()))
      .filter((node) => parseFloat(getComputedStyle(node).fontSize) < 13)
      .map((node) => `${node.tagName}.${node.className}:${node.textContent?.trim().slice(0, 20)}`));
    expect(tiny, 'text smaller than 13px').toEqual([]);
  });
}

test('thin data shows 参考件数 instead of a median', async ({ page }) => {
  await mockApi(page);
  await page.goto('/career');
  await page.getByLabel('地域').selectOption('大阪府');
  await expect(page.getByText('参考件数が足りません')).toBeVisible();
  await expect(page.getByText('中央値')).toHaveCount(0);
});
