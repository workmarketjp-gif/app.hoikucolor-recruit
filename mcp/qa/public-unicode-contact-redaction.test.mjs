import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getPublicChildcareJob,
  listPublicChildcareJobFilters,
  searchPublicChildcareJobs,
} from '../public-jobs.mjs';

// Compatibility-width and mixed-obfuscation contacts must never be copied
// from otherwise-public third-party text to an anonymous ChatGPT/Claude tool.
const id = '11111111-1111-4111-8111-000000000095';
const now = Date.parse('2026-10-24T03:00:00Z');
const base = {
  id, title: '保育士募集', is_external: false, total_count: 1,
  published_at: '2026-10-23T00:00:00Z', closing_at: null,
};
function config(row) {
  return {
    supabaseUrl: 'https://public-fixture.supabase.co',
    publishableKey: 'sb_publishable_fixture',
    now: () => now,
    fetcher: async () => Response.json([row]),
  };
}

test('search removes width-obfuscated email while preserving surrounding Japanese and emoji', async () => {
  const result = await searchPublicChildcareJobs({}, config({
    ...base, description: '🌸お問い合わせalice＠example．jpへ。休日は週休2日です🌼',
  }));
  assert.equal(result.jobs.length, 1);
  assert.equal(result.jobs[0].description, '🌸お問い合わせ[連絡先省略]へ。休日は週休2日です🌼');
  assert.ok(!JSON.stringify(result).includes('＠'));
});

test('detail removes mixed ASCII @ plus compatibility-width [dot] addresses', async () => {
  const result = await getPublicChildcareJob({ job_id: id }, config({
    ...base, description: '連絡: bob@example［ｄｏｔ］co［ｄｏｔ］jp / 勤務時間8:00-17:00',
  }));
  assert.equal(result.job.description, '連絡: [連絡先省略] / 勤務時間8:00-17:00');
});

test('search and detail redact compatibility-width Japanese phones in free text', async () => {
  const row = {
    ...base, title: '保育士（０３－９９９９－００００）',
    description: '電話０９０－１２３４－５６７８、勤務は8時間です。',
  };
  const found = await searchPublicChildcareJobs({}, config(row));
  const detail = await getPublicChildcareJob({ job_id: id }, config(row));
  for (const job of [found.jobs[0], detail.job]) {
    assert.equal(job.title, '保育士（[連絡先省略]）');
    assert.equal(job.description, '電話[連絡先省略]、勤務は8時間です。');
  }
});

test('public filter suggestions omit compatibility-width contact strings', async () => {
  const result = await listPublicChildcareJobFilters({}, config({
    prefectures: ['東京都', 'alice＠example．jp', '大阪府'],
    employment_types: ['正社員', '０９０－１２３４－５６７８', 'パート'],
  }));
  assert.deepEqual(result.prefectures, ['東京都', '大阪府']);
  assert.deepEqual(result.employment_types, ['正社員', 'パート']);
});

test('normal Japanese employment conditions remain unchanged', async () => {
  const description = '🌸週休2日・月給250,000円。保育士資格必須。';
  const result = await searchPublicChildcareJobs({}, config({
    ...base, description,
  }));
  assert.equal(result.jobs[0].description, description);
});
