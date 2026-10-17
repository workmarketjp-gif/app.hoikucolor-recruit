import { expect, test, type Page } from '@playwright/test';

/*
 * Apply-time documents and qualification evidence on the real candidate UI (e2e build:
 * fixture Clerk session; every Supabase request answered here, nothing reaches a project).
 * Runs at the 8 release-check widths.
 */

const jobA = {
  id: '11111111-1111-4111-8111-111111111111',
  facility_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  facility_name: 'ひだまり保育園（テスト）', facility_type: '認可保育園',
  prefecture: '東京都', city: '世田谷区', address: '東京都世田谷区テスト1-2-3',
  title: '看護師（正社員）', description: '園児の健康管理を担当します。',
  employment_type: '正社員', salary_type: 'monthly', salary_min: 260000, salary_max: 300000, salary_note: null,
  working_hours: '8:30〜17:30', holidays: '土日祝', required_qualification: '看護師または准看護師',
  benefits: '社会保険完備', number_of_positions: 1,
  published_at: '2026-09-30T00:00:00Z', closing_at: null, spot_break_minutes: null,
  verified_workplace: null, verified_finance: null,
};
const searchRows = [{ ...jobA, rank_quality: 1, rank_transparency: 1, total_count: 1, has_more: false }];
const profile = { clerk_user_id: 'user_e2e_fixture', email: 'e2e@example.invalid', name: '保育 みさき', name_kana: null, phone: null, prefecture: '東京都', desired_positions: ['看護師'], desired_employment_types: ['正社員'], qualifications: ['看護師', '保育士'], years_of_experience: 3, desired_start_date: null, self_intro: null };
const requirements = [
  { document_type: 'resume', requirement: 'required', note: null },
  { document_type: 'nurse_license', requirement: 'required', note: '写しで可' },
  { document_type: 'work_history', requirement: 'optional', note: null },
];
const resume = { id: '0a000000-0000-4000-8000-000000000001', jobseeker_clerk_user_id: 'user_e2e_fixture', document_type: 'resume', title: '履歴書（保育みさき）.pdf', file_path: 'jobseekers/user_e2e_fixture/0a000000-0000-4000-8000-000000000001/document.pdf', mime_type: 'application/pdf', file_size: 1200, is_default: true, uploaded_at: '2026-10-10T00:00:00Z', created_at: '2026-10-10T00:00:00Z', updated_at: '2026-10-10T00:00:00Z' };
const applicationId = '33333333-3333-4333-8333-333333333333';

async function mockApi(page: Page) {
  const vault = [{ ...resume }];
  const submitted: { ids: string[] | null; v1: boolean } = { ids: null, v1: false };
  const json = (data: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
  await page.route(/supabase\.co\//, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    if (path.includes('/storage/v1/object/')) {
      // upload / copy / sign: report success with the canonical key.
      if (path.includes('/object/sign/')) return route.fulfill(json({ signedURL: `${path.replace('/storage/v1', '')}?token=e2e` }));
      return route.fulfill(json({ Key: path.replace('/storage/v1/object/', '') }));
    }
    if (path.endsWith('/rest/v1/hc_jobseeker_documents')) return route.fulfill(json(vault));
    if (path.endsWith('/rest/v1/hc_applications')) return route.fulfill(json({ id: applicationId, organization_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', facility_id: jobA.facility_id }));
    if (!path.startsWith('/rest/v1/rpc/')) return route.fulfill(json([]));
    const name = path.split('/').pop() || '';
    const body = (request.postDataJSON() ?? {}) as Record<string, unknown>;
    switch (name) {
      case 'hc_jobseeker_get_profile': return route.fulfill(json(profile));
      case 'hc_jobseeker_search_jobs':
      case 'hc_jobseeker_search_jobs_v2': return route.fulfill(json(searchRows));
      case 'hc_jobseeker_job_search_facets':
      case 'hc_jobseeker_job_search_facets_v2': return route.fulfill(json([{ prefectures: ['東京都'], employment_types: ['正社員'] }]));
      case 'hc_jobseeker_get_job_v2':
      case 'hc_jobseeker_get_ranked_job': return route.fulfill(json([jobA]));
      case 'hc_jobseeker_list_ranked_jobs': return route.fulfill(json([jobA]));
      case 'hc_jobseeker_attention_summary': return route.fulfill(json({ unanswered_interviews_count: 0, unread_messages_count: 0, pending_scouts_count: 0, next_interview: null, next_message: null, next_scout: null }));
      case 'hc_jobseeker_get_job_document_requirements': return route.fulfill(json(requirements));
      case 'hc_register_jobseeker_document_source': {
        const doc = { ...resume, id: String(body.p_document_id), document_type: String(body.p_document_type), title: String(body.p_title), file_path: String(body.p_file_path), mime_type: String(body.p_mime_type), file_size: Number(body.p_file_size), is_default: false, uploaded_at: '2026-10-17T00:00:00Z' };
        vault.push(doc);
        return route.fulfill(json(doc));
      }
      case 'hc_set_jobseeker_document_default': {
        const doc = vault.find((d) => d.id === body.p_document_id);
        if (doc) doc.is_default = true;
        return route.fulfill(json(doc));
      }
      case 'hc_jobseeker_submit_application_v2': submitted.ids = (body.p_document_ids as string[]) ?? []; return route.fulfill(json(applicationId));
      case 'hc_jobseeker_submit_application': submitted.v1 = true; return route.fulfill(json(applicationId));
      case 'hc_register_jobseeker_document_attachment': return route.fulfill(json({ id: crypto.randomUUID(), application_id: applicationId }));
      default: return route.fulfill(json([]));
    }
  });
  return { vault, submitted };
}

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
}

async function expectMinHeight(page: Page, selector: string, min: number) {
  const heights = await page.locator(selector).evaluateAll((nodes) => nodes.filter((n) => (n as HTMLElement).offsetParent !== null).map((n) => Math.round(n.getBoundingClientRect().height)));
  expect(heights.length).toBeGreaterThan(0);
  for (const height of heights) expect(height, `${selector} height`).toBeGreaterThanOrEqual(min);
}

async function expectNoTinyText(page: Page, scope: string) {
  const sizes = await page.locator(`${scope} *`).evaluateAll((nodes) => nodes
    .filter((n) => (n as HTMLElement).offsetParent !== null && (n.textContent || '').trim() && n.children.length === 0)
    .map((n) => parseFloat(getComputedStyle(n).fontSize)));
  for (const size of sizes) expect(size).toBeGreaterThanOrEqual(12);
}

for (const width of [320, 375, 390, 430, 768, 1024, 1440, 1920]) {
  test.describe(`${width}px`, () => {
    test.use({ viewport: { width, height: width >= 768 ? 900 : 844 } });

    test('apply: job documents, plain block on a missing licence, inline upload, submit chosen ids', async ({ page }) => {
      const { submitted } = await mockApi(page);
      await page.goto('/jobs');
      const card = page.locator('.hc-job-card').first();
      await card.getByRole('button', { name: '応募する' }).click();

      const step = card.locator('.hc-apply-docs');
      await expect(step.getByRole('heading', { name: '応募の前に、送る書類を確認してください' })).toBeVisible();
      await expect(step.locator('.hc-apply-doc')).toHaveCount(3);
      await expect(step.locator('.hc-apply-doc').nth(0)).toContainText('履歴書');
      await expect(step.locator('.hc-apply-doc').nth(0)).toContainText('必須');
      await expect(step.getByRole('radio', { name: /履歴書（保育みさき）\.pdf/ })).toBeChecked();
      await expect(step.locator('.hc-apply-doc').nth(2)).toContainText('看護師免許証');
      await expect(step).toContainText('園からのメモ：写しで可');

      const submit = step.getByRole('button', { name: 'この内容で応募する' });
      await expect(submit).toHaveAttribute('aria-disabled', 'true');
      await submit.click({ force: true });
      await expect(step.getByRole('alert').filter({ hasText: '「看護師免許証」はこの求人の応募に必要です' })).toBeVisible();
      expect(submitted.ids).toBeNull();
      expect(submitted.v1).toBe(false);

      const chooser = page.waitForEvent('filechooser');
      await step.getByRole('button', { name: '看護師免許証を追加' }).click();
      await (await chooser).setFiles({ name: '看護師免許証.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 e2e licence') });
      await expect(step.getByRole('radio', { name: /看護師免許証\.pdf/ })).toBeChecked();
      await expect(submit).toHaveAttribute('aria-disabled', 'false');

      await expectMinHeight(page, '.hc-apply-doc-option', 48);
      await expectMinHeight(page, '.hc-apply-doc-upload', 48);
      await expectMinHeight(page, '.hc-apply-docs .hc-job-actions button', 48);
      await expectNoTinyText(page, '.hc-apply-docs');
      await expectNoHorizontalOverflow(page);
      await page.screenshot({ path: `test-results/qualification-documents/apply-${width}.png`, fullPage: true });

      await submit.click();
      await expect.poll(() => submitted.ids).not.toBeNull();
      expect(submitted.v1).toBe(false);
      expect(submitted.ids).toHaveLength(2);
      expect(submitted.ids).toContain(resume.id);
      await expect(page.locator('body')).not.toContainText(/HO|HM|HF|HC(?![a-z])/);
    });

    test('profile: declared qualifications next to saved evidence, never 確認済み', async ({ page }) => {
      await mockApi(page);
      await page.goto('/profile');
      const section = page.locator('.hc-qualification-list');
      await expect(page.getByRole('heading', { name: '資格と証明書類' })).toBeVisible();
      await expect(page.getByText('ご本人の申告', { exact: false })).toBeVisible();
      await expect(section.locator('.hc-qualification')).toHaveCount(2);
      await expect(section.locator('.hc-qualification').filter({ hasText: '看護師' })).toContainText('看護師免許証：まだ保存されていません');
      await expect(section.locator('.hc-qualification').filter({ hasText: '保育士' })).toContainText('保育士証：まだ保存されていません');
      await expect(section.getByRole('button', { name: '看護師免許証を追加' })).toBeVisible();
      const text = await page.locator('main').innerText();
      expect(text.replace('確認済みになるわけではありません', '')).not.toMatch(/確認済み|認証済み/);
      await expectMinHeight(page, '.hc-qualification-evidence .secondary-button', 48);
      await expectNoHorizontalOverflow(page);
      await page.screenshot({ path: `test-results/qualification-documents/profile-${width}.png`, fullPage: true });
    });
  });
}
