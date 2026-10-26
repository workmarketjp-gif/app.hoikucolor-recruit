import assert from 'node:assert/strict';
import test from 'node:test';
import {
  searchPublicChildcareJobs,
  getPublicChildcareJob,
  listPublicChildcareJobFilters,
} from '../public-jobs.mjs';

// Synthetic published job only. A bare-domain scrub must not leave the
// mailbox name ("alice@") visible to anonymous ChatGPT/Claude clients.
const id = '11111111-1111-4111-8111-000000000122';
const row = {
  id, title: '保育士募集', facility_name: 'あおば保育園',
  description: '子どもと遊ぶお仕事です。',
  published_at: '2026-10-25T00:00:00Z',
  closing_at: null, is_external: false, total_count: 1,
};
const sourceConfig = (value) => ({
  supabaseUrl: 'https://public-fixture.supabase.co',
  publishableKey: 'sb_publishable_idn_synthetic_fixture',
  now: () => Date.parse('2026-10-26T00:00:00Z'),
  fetcher: async () => Response.json([value]),
});

test('search scrubs the whole mailbox with a Japanese IDN suffix', async () => {
  const result = await searchPublicChildcareJobs({}, sourceConfig({
    ...row,
    description: '施設情報です。連絡先 alice@example.みんな 応募は公式サイトから。',
  }));
  assert.equal(result.returned, 1);
  assert.equal(result.jobs[0].description,
    '施設情報です。連絡先 [連絡先省略] 応募は公式サイトから。');
  assert.equal(result.jobs[0].url, `https://hoikucolor.jp/jobs/${id}`);
});

test('details scrub the mailbox with a Punycode suffix and preserve other terms', async () => {
  const result = await getPublicChildcareJob({ job_id: id }, sourceConfig({
    ...row,
    salary_note: '月給25万円。担当 hiring+candidate@example.xn--p1ai 給与相談可能。',
  }));
  assert.ok(result.job);
  assert.equal(result.job.salary_note,
    '月給25万円。担当 [連絡先省略] 給与相談可能。');
  assert.equal(JSON.stringify(result).includes('hiring+candidate@'), false);
});

test('compatibility-width address with Japanese domain is removed as a complete span', async () => {
  const result = await searchPublicChildcareJobs({}, sourceConfig({
    ...row,
    facility_name: 'あおば保育園 ａｌｉｃｅ＠ｅｘａｍｐｌｅ．みんな 第2園',
  }));
  assert.equal(result.jobs[0].facility_name,
    'あおば保育園 [連絡先省略] 第2園');
});

test('public facet suggestions discard complete IDN contacts', async () => {
  const result = await listPublicChildcareJobFilters({}, sourceConfig({
    prefectures: ['東京都', 'alice@example.みんな', '大阪府'],
    employment_types: ['正社員', 'hiring+candidate@example.xn--p1ai', 'パート'],
  }));
  assert.deepEqual(result.prefectures, ['東京都', '大阪府']);
  assert.deepEqual(result.employment_types, ['正社員', 'パート']);
});

test('ordinary Japanese descriptions remain unchanged', async () => {
  const description = '月給25万円。保育士資格必須。週休2日。';
  const result = await searchPublicChildcareJobs({}, sourceConfig({ ...row, description }));
  assert.equal(result.jobs[0].description, description);
});
