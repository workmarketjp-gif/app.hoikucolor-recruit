import { expect, test, type Page } from '@playwright/test';

/*
 * Childcare values picked on hoikucolor.jp arrive as ?hc_values=… and are saved only after
 * the signed-in candidate confirms. The e2e build swaps Clerk for a fixture session and
 * every Supabase call is answered here, with a stateful preference store.
 */

const jobA = {
  id: '11111111-1111-4111-8111-111111111111', facility_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', facility_name: 'ひだまり保育園（テスト）', facility_type: '認可保育園',
  prefecture: '東京都', city: '世田谷区', address: '東京都世田谷区テスト1-2-3', title: '保育士（正社員）', description: '子どもの主体性を大切にする保育です。',
  employment_type: '正社員', salary_type: 'monthly', salary_min: 240000, salary_max: 290000, salary_note: null, working_hours: '7:00〜19:00', holidays: '土日祝',
  required_qualification: '保育士資格', benefits: '社会保険完備', number_of_positions: 2, published_at: '2026-09-30T00:00:00Z', closing_at: null, spot_break_minutes: null,
  verified_workplace: null, verified_finance: null,
};
const profile = { clerk_user_id: 'user_e2e_fixture', email: 'e2e@example.invalid', name: '保育 みさき', name_kana: null, phone: null, prefecture: '東京都', desired_positions: ['保育士'], desired_employment_types: ['正社員'], qualifications: ['保育士'], years_of_experience: 3, desired_start_date: null, self_intro: null };

type Prefs = Record<string, unknown> & { childcare_values: string[]; desired_prefectures: string[] };

async function mockApi(page: Page, opts: { prefs?: Partial<Prefs>; failUpserts?: number; upsertDelayMs?: number } = {}) {
  const state = {
    prefs: { desired_prefectures: ['東京都'], desired_cities: ['世田谷区'], desired_monthly_salary_min: 250000, desired_hourly_wage_min: null, available_weekdays: [], available_time_from: null, available_time_to: null, max_commute_minutes: null, classroom_experience: [], leadership_roles: [], preferred_child_ages: [], childcare_values: ['行事重視'], work_preferences: ['残業少なめ'], ...opts.prefs } as Prefs,
    upserts: [] as Record<string, unknown>[],
    failUpserts: opts.failUpserts ?? 0,
  };
  await page.route(/supabase\.co\//, async (route) => {
    const url = new URL(route.request().url());
    const json = (data: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
    if (!url.pathname.startsWith('/rest/v1/rpc/')) return json([]);
    const name = url.pathname.split('/').pop() || '';
    const body = (route.request().postDataJSON() ?? {}) as Record<string, unknown>;
    switch (name) {
      case 'hc_jobseeker_get_matching_preferences': return json(state.prefs);
      case 'hc_jobseeker_upsert_matching_preferences': {
        state.upserts.push(body);
        if (opts.upsertDelayMs) await new Promise((resolve) => setTimeout(resolve, opts.upsertDelayMs));
        if (state.failUpserts > 0) { state.failUpserts -= 1; return json({ message: 'internal error' }, 500); }
        state.prefs = { ...state.prefs, childcare_values: body.p_childcare_values as string[], desired_prefectures: body.p_desired_prefectures as string[], desired_cities: body.p_desired_cities as string[], desired_monthly_salary_min: body.p_desired_monthly_salary_min, work_preferences: body.p_work_preferences as string[] };
        return json(state.prefs);
      }
      case 'hc_jobseeker_get_profile': return json(profile);
      case 'hc_jobseeker_search_jobs':
      case 'hc_jobseeker_search_jobs_v2': return json([{ ...jobA, rank_quality: 1, rank_transparency: 1, total_count: 1, has_more: false }]);
      case 'hc_jobseeker_get_ranked_job':
      case 'hc_jobseeker_get_job_v2': return json([jobA]);
      case 'hc_jobseeker_job_search_facets':
      case 'hc_jobseeker_job_search_facets_v2': return json([{ prefectures: ['東京都'], employment_types: ['正社員'] }]);
      case 'hc_jobseeker_attention_summary': return json({ unanswered_interviews_count: 0, unread_messages_count: 0, pending_scouts_count: 0, next_interview: null, next_message: null, next_scout: null });
      default: return json([]);
    }
  });
  return state;
}

const dialog = (page: Page) => page.getByRole('dialog', { name: 'この保育観をマイページに保存しますか？' });

for (const viewport of [{ width: 375, height: 812 }, { width: 390, height: 844 }, { width: 1280, height: 800 }]) {
  test.describe(`${viewport.width}px`, () => {
    test.use({ viewport });

    test('confirms, adds values without overwriting, survives reload, ignores double clicks', async ({ page }) => {
      const state = await mockApi(page, { upsertDelayMs: 300 });
      await page.goto('/?hc_values=agency,outdoor&hc_pref=東京都');
      await expect(dialog(page)).toBeVisible();
      expect(new URL(page.url()).search).toBe('');
      await expect(dialog(page).getByRole('listitem')).toHaveText(['追加子ども主体', '追加外遊び重視']);
      await expect(dialog(page)).toContainText('保存済みの保育観（そのまま残ります）：行事重視');
      expect(state.upserts).toHaveLength(0);

      // Refresh before answering: the choice is still offered.
      await page.reload();
      await expect(dialog(page)).toBeVisible();

      const save = dialog(page).getByRole('button', { name: '保存する' });
      const box = await save.boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(48);
      await save.dblclick();
      await expect(page.getByRole('dialog', { name: '保育観を保存しました' })).toBeVisible();
      expect(state.upserts).toHaveLength(1);
      expect(state.upserts[0].p_childcare_values).toEqual(['行事重視', '子ども主体', '外遊び重視']);
      expect(state.upserts[0].p_desired_prefectures).toEqual(['東京都']);
      expect(state.upserts[0].p_desired_cities).toEqual(['世田谷区']);
      expect(state.upserts[0].p_desired_monthly_salary_min).toBe(250000);
      expect(state.upserts[0].p_work_preferences).toEqual(['残業少なめ']);

      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(1);
      await page.getByRole('button', { name: 'マッチ度を見る' }).click();
      await expect(page).toHaveURL(/\/matches$/);

      await page.reload();
      await expect(dialog(page)).toHaveCount(0);
      expect(state.upserts).toHaveLength(1);
    });
  });
}

test.describe('edge cases (390px)', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('declining writes nothing and is not asked again', async ({ page }) => {
    const state = await mockApi(page);
    await page.goto('/?hc_values=small');
    await dialog(page).getByRole('button', { name: '保存しない' }).click();
    await expect(dialog(page)).toHaveCount(0);
    await page.reload();
    await expect(dialog(page)).toHaveCount(0);
    expect(state.upserts).toHaveLength(0);
  });

  test('a failed save keeps the choice for a retry and never claims success', async ({ page }) => {
    const state = await mockApi(page, { failUpserts: 1 });
    await page.goto('/?hc_values=team');
    await dialog(page).getByRole('button', { name: '保存する' }).click();
    await expect(dialog(page).getByRole('alert')).toContainText('保存できませんでした');
    await expect(page.getByRole('dialog', { name: '保育観を保存しました' })).toHaveCount(0);
    await page.reload();
    await dialog(page).getByRole('button', { name: '保存する' }).click();
    await expect(page.getByRole('dialog', { name: '保育観を保存しました' })).toBeVisible();
    expect(state.upserts).toHaveLength(2);
    expect(state.prefs.childcare_values).toEqual(['行事重視', 'チーム保育']);
  });

  test('already-saved values and tampered or missing params show nothing', async ({ page }) => {
    const state = await mockApi(page, { prefs: { childcare_values: ['子ども主体'] } });
    const checked = page.waitForResponse(/hc_jobseeker_get_matching_preferences/);
    await page.goto('/?hc_values=agency&hc_pref=東京都');
    await checked;
    await expect(page.getByText('こんにちは、保育 みさきさん')).toBeVisible();
    await expect(dialog(page)).toHaveCount(0);
    await page.goto('/?hc_values=%3Cscript%3Ealert(1)%3C%2Fscript%3E,unknown&hc_pref=Narnia');
    await expect(dialog(page)).toHaveCount(0);
    await page.goto('/');
    await expect(dialog(page)).toHaveCount(0);
    expect(state.upserts).toHaveLength(0);
  });

  test('the selected job and the handoff both survive the same entry link', async ({ page }) => {
    await mockApi(page);
    await page.goto(`/jobs?job_id=${jobA.id}&hc_values=outdoor`);
    await expect(dialog(page)).toBeVisible();
    expect(new URL(page.url()).searchParams.get('job_id')).toBe(jobA.id);
    await dialog(page).getByRole('button', { name: '保存しない' }).click();
    await expect(page.locator(`[data-job-id="${jobA.id}"]`).first()).toBeVisible();
  });
});
