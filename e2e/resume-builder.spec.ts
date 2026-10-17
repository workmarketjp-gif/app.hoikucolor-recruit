import { expect, test, type Page } from '@playwright/test';

/*
 * 履歴書・職務経歴書 builder. Every Supabase request is answered locally (fixture session,
 * mocked RPCs and Storage), so no real account or document is touched. The PDF is
 * really generated in the browser with the real Japanese font and pdf-lib.
 */

const owner = 'user_e2e_fixture';
const profile = {
  clerk_user_id: owner, email: 'e2e@example.invalid', name: '保育 みさき', name_kana: 'ほいく みさき', phone: '090-0000-0000',
  prefecture: '東京都', desired_positions: ['保育士'], desired_employment_types: ['正社員'], qualifications: ['保育士'],
  years_of_experience: 3, desired_start_date: null, self_intro: '子どもの「やってみたい」を大切にしています。',
};
const preferences = {
  desired_prefectures: ['東京都'], desired_cities: [], desired_monthly_salary_min: null, desired_hourly_wage_min: null,
  available_weekdays: [], available_time_from: null, available_time_to: null, max_commute_minutes: null,
  classroom_experience: ['1歳児'], leadership_roles: [], preferred_child_ages: [], childcare_values: [], work_preferences: [],
};
const emptyResume = {
  revision: 0, updated_at: null, birth_date: null, gender: null, postal_code: null, address: null, address_kana: null, contact_address: null,
  qualification_acquired: {}, work_summary: null, self_pr: null, strengths: null, motivation: null, personal_requests: null, education: [], employment: [],
};

type Recorded = { saves: Record<string, unknown>[]; profileSaves: Record<string, unknown>[]; registered: Record<string, unknown>[]; uploads: { path: string; bytes: Buffer }[] };

async function mockApi(page: Page) {
  const recorded: Recorded = { saves: [], profileSaves: [], registered: [], uploads: [] };
  let resume: Record<string, unknown> = { ...emptyResume };
  await page.route(/supabase\.co\//, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const json = (data: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
    if (url.pathname.startsWith('/storage/v1/object/')) {
      if (request.method() === 'POST' && !url.pathname.includes('/sign/')) {
        recorded.uploads.push({ path: url.pathname, bytes: request.postDataBuffer() ?? Buffer.alloc(0) });
        return json({ Key: url.pathname, Id: 'e2e' });
      }
      return json({ signedURL: '/e2e-signed' });
    }
    if (!url.pathname.startsWith('/rest/v1/rpc/')) return json([]);
    const name = url.pathname.split('/').pop() || '';
    const body = (request.postDataJSON() ?? {}) as Record<string, unknown>;
    switch (name) {
      case 'hc_jobseeker_get_profile': return json(profile);
      case 'hc_jobseeker_upsert_profile': recorded.profileSaves.push(body); return json({ ...profile, ...Object.fromEntries(Object.entries(body).map(([key, value]) => [key.replace(/^p_/, ''), value])) });
      case 'hc_jobseeker_get_matching_preferences': return json(preferences);
      case 'hc_jobseeker_upsert_matching_preferences': return json(preferences);
      case 'hc_jobseeker_get_resume': return json(resume);
      case 'hc_jobseeker_save_resume': {
        recorded.saves.push(body);
        if (body.p_expected_revision !== resume.revision) return json({ message: 'HC_RESUME_REVISION_CONFLICT', code: '40001' }, 409);
        resume = { ...(body.p_resume as Record<string, unknown>), revision: Number(resume.revision) + 1, updated_at: '2026-10-17T00:00:00Z' };
        return json(resume);
      }
      case 'hc_register_jobseeker_document_source': {
        recorded.registered.push(body);
        return json({ id: body.p_document_id, jobseeker_clerk_user_id: owner, document_type: body.p_document_type, title: body.p_title, file_path: body.p_file_path, mime_type: body.p_mime_type, file_size: body.p_file_size, is_default: false, uploaded_at: '2026-10-17T00:00:00Z', created_at: '2026-10-17T00:00:00Z', updated_at: '2026-10-17T00:00:00Z' });
      }
      case 'hc_set_jobseeker_document_default': {
        const source = recorded.registered.find((item) => item.p_document_id === body.p_document_id) ?? {};
        return json({ id: body.p_document_id, jobseeker_clerk_user_id: owner, document_type: source.p_document_type, title: source.p_title, file_path: source.p_file_path, mime_type: 'application/pdf', file_size: source.p_file_size, is_default: true, uploaded_at: '2026-10-17T00:00:00Z', created_at: '2026-10-17T00:00:00Z', updated_at: '2026-10-17T00:00:00Z' });
      }
      case 'hc_jobseeker_list_saved_job_ids':
      case 'hc_jobseeker_list_applications':
      case 'hc_jobseeker_list_notifications': return json([]);
      case 'hc_jobseeker_attention_summary': return json({ unanswered_interviews_count: 0, unread_messages_count: 0, pending_scouts_count: 0, next_interview: null, next_message: null, next_scout: null });
      default: return json([]);
    }
  });
  return recorded;
}

async function expectPageQuality(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, 'horizontal overflow').toBeLessThanOrEqual(1);
  const tiny = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('.rb *')]
    .filter((node) => node.offsetParent !== null && node.childNodes.length && [...node.childNodes].some((child) => child.nodeType === 3 && child.textContent?.trim()))
    .filter((node) => parseFloat(getComputedStyle(node).fontSize) < 12)
    .map((node) => `${node.tagName}.${node.className}:${node.textContent?.trim().slice(0, 20)}`));
  expect(tiny, 'visible text under 12px').toEqual([]);
  const smallTargets = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('.rb button, .rb a, .rb select, .rb input:not([type="checkbox"])')]
    .filter((node) => node.offsetParent !== null)
    .filter((node) => node.getBoundingClientRect().height < 44)
    .map((node) => `${node.tagName}:${node.textContent?.trim().slice(0, 20)}:${Math.round(node.getBoundingClientRect().height)}`));
  expect(smallTargets, 'tap targets under 44px').toEqual([]);
}

const widths = [375, 390, 393, 430, 940, 1280, 1440, 1536];

for (const width of widths) {
  test.describe(`${width}px`, () => {
    test.use({ viewport: { width, height: width < 900 ? 844 : 900 } });

    test('guided steps autosave, preview, and A4 PDFs saved to the vault', async ({ page }, testInfo) => {
      const recorded = await mockApi(page);
      await page.goto('/resume');
      await expect(page.getByRole('heading', { level: 1, name: '応募書類をつくる' })).toBeVisible();
      await expect(page.getByRole('heading', { level: 2, name: 'あなたのことを教えてください' })).toBeVisible();
      // Profile data is reused, not re-asked.
      await expect(page.getByLabel('お名前')).toHaveValue('保育 みさき');
      await expectPageQuality(page);
      await page.screenshot({ path: testInfo.outputPath(`step1-${width}.png`), fullPage: true });

      await page.getByLabel('生年月日').fill('1998-05-10');
      await page.getByLabel('住所', { exact: true }).fill('東京都世田谷区テスト1-2-3');
      await expect(page.getByText('✓ 自動保存しました')).toBeVisible({ timeout: 8000 });
      expect(recorded.saves.at(-1)?.p_expected_revision).toBe(0);
      expect((recorded.saves.at(-1)?.p_resume as Record<string, unknown>).address).toBe('東京都世田谷区テスト1-2-3');
      expect(JSON.stringify(recorded.saves.at(-1))).not.toContain(owner);

      await page.getByRole('button', { name: '次へ' }).click();
      await expect(page.getByRole('heading', { level: 2, name: 'どの学校を卒業しましたか？' })).toBeVisible();
      await page.getByRole('button', { name: '＋ 学校を追加' }).click();
      await page.getByLabel('学校名').fill('東京都立テスト高等学校');
      await page.getByLabel('入学した年月（年）').selectOption('2014');
      await page.getByLabel('入学した年月（月）').selectOption('04');
      await page.getByLabel('卒業した年月（年）').selectOption('2017');
      await page.getByLabel('卒業した年月（月）').selectOption('03');
      await page.getByLabel('卒業の状態').selectOption('卒業');
      await expectPageQuality(page);

      await page.getByRole('button', { name: '次へ' }).click();
      await page.getByRole('button', { name: '＋ 職場を追加' }).click();
      await page.getByLabel('園・会社の名前').fill('社会福祉法人テスト会 ひだまり保育園');
      await page.getByLabel('働き始めた年月（年）').selectOption('2021');
      await page.getByLabel('働き始めた年月（月）').selectOption('04');
      await page.getByLabel('今もここで働いている').check();
      await page.getByRole('button', { name: '1歳児', exact: true }).click();
      await page.getByLabel('クラス担任をした').check();
      await expectPageQuality(page);
      await page.screenshot({ path: testInfo.outputPath(`step3-${width}.png`), fullPage: true });

      // Skippable: jump straight to the last step via the step list.
      await page.getByRole('button', { name: /確認・作成/ }).click();
      await expect(page.getByRole('heading', { level: 2, name: '内容を確認して、PDFを作りましょう' })).toBeVisible();
      const paper = page.locator('.rb-paper');
      await expect(paper).toContainText('東京都立テスト高等学校 入学');
      await expect(paper).toContainText('社会福祉法人テスト会 ひだまり保育園 入職');
      await expect(paper).toContainText('現在に至る');
      await expect(paper).toContainText('保育士 取得');
      await expectPageQuality(page);
      await page.screenshot({ path: testInfo.outputPath(`preview-${width}.png`), fullPage: true });

      await page.getByRole('button', { name: '履歴書のPDFを作成して保存' }).click();
      await expect(page.getByText('履歴書を書類に保存しました')).toBeVisible({ timeout: 30_000 });
      await page.getByRole('tab', { name: '職務経歴書' }).click();
      await expect(page.locator('.rb-paper')).toContainText('■ 職務経歴');
      await page.getByRole('button', { name: '職務経歴書のPDFを作成して保存' }).click();
      await expect(page.getByText('職務経歴書を書類に保存しました')).toBeVisible({ timeout: 30_000 });
      await expectPageQuality(page);

      expect(recorded.registered.map((item) => item.p_document_type)).toEqual(['resume', 'work_history']);
      for (const item of recorded.registered) {
        expect(item.p_mime_type).toBe('application/pdf');
        expect(String(item.p_file_path)).toMatch(new RegExp(`^jobseekers/${owner}/[0-9a-f-]{36}/document\\.pdf$`));
        expect(Number(item.p_file_size)).toBeLessThan(1024 * 1024);
      }
      expect(recorded.uploads).toHaveLength(2);
      for (const [index, upload] of recorded.uploads.entries()) {
        // supabase-js sends the File as multipart form-data; the PDF is the file part.
        const start = upload.bytes.indexOf('%PDF-');
        const end = upload.bytes.lastIndexOf('%%EOF');
        expect(start, 'uploaded body contains a PDF').toBeGreaterThanOrEqual(0);
        expect(end).toBeGreaterThan(start);
        await testInfo.attach(`uploaded-${index}.pdf`, { body: upload.bytes.subarray(start, end + 5), contentType: 'application/pdf' });
      }

      const download = page.waitForEvent('download');
      await page.getByRole('link', { name: 'PDFをダウンロード' }).first().click();
      const file = await download;
      await file.saveAs(testInfo.outputPath(`${file.suggestedFilename()}`));
      expect(file.suggestedFilename()).toMatch(/^(履歴書|職務経歴書)_\d{8}\.pdf$/);
    });
  });
}

test('a stale revision from another tab is surfaced, not overwritten', async ({ page }) => {
  await mockApi(page);
  await page.route(/rpc\/hc_jobseeker_save_resume/, (route) => route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ message: 'HC_RESUME_REVISION_CONFLICT', code: '40001' }) }));
  await page.goto('/resume');
  await page.getByLabel('住所', { exact: true }).fill('東京都');
  await expect(page.getByText('別の画面や端末で先に保存されました')).toBeVisible({ timeout: 8000 });
  await expect(page.getByRole('button', { name: '読み込み直す' })).toBeVisible();
});
