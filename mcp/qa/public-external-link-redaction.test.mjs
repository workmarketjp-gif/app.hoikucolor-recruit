import assert from 'node:assert/strict';
import test from 'node:test';
import { searchPublicChildcareJobs, getPublicChildcareJob, listPublicChildcareJobFilters } from '../public-jobs.mjs';

// Published third-party descriptions can embed off-site tracking, personal
// contact details or prefilled applicant data in links. The official HC
// canonical job URL is the only clickable URL advertised by these tools.
const id = '11111111-1111-4111-8111-000000000121';
const now = Date.parse('2026-10-25T03:00:00Z');
const base = {
  id, title: '公開中の保育士求人', is_external: false,
  published_at: '2026-10-24T00:00:00Z', closing_at: null,
  total_count: 1,
};
const config = row => ({
  supabaseUrl: 'https://fixture.supabase.co',
  publishableKey: 'sb_publishable_fixture',
  now: () => now,
  fetcher: async () => Response.json([row]),
});

test('anonymous search redacts a full external URL including encoded private query values', async () => {
  const result = await searchPublicChildcareJobs({}, config({
    ...base,
    description: '勤務は週休2日。詳細は https://outside.example/apply?email=alice%40private.jp&token=secret-123 を参照。月給25万円。',
  }));
  const job = result.jobs[0];
  assert.ok(job);
  assert.equal(job.description, '勤務は週休2日。詳細は [連絡先省略] を参照。月給25万円。');
  assert.equal(job.url, `https://hoikucolor.jp/jobs/${id}`);
  assert.equal(JSON.stringify(job).includes('secret-123'), false);
  assert.equal(JSON.stringify(job).includes('outside.example'), false);
});

test('detail redacts compatibility-width URL, mailto and tel while retaining surrounding copy', async () => {
  const result = await getPublicChildcareJob({ job_id: id }, config({
    ...base,
    description: '🌸 ｈｔｔｐｓ：／／ｅｖｉｌ．ｅｘａｍｐｌｅ／ａ?candidate=hidden を使わず、mailto:alice@example.jp または tel:09012345678 も使わないでください。',
  }));
  assert.ok(result.job);
  assert.equal(result.job.description,
    '🌸 [連絡先省略] を使わず、[連絡先省略] または [連絡先省略] も使わないでください。');
  assert.equal(JSON.stringify(result).includes('hidden'), false);
  assert.equal(JSON.stringify(result).includes('alice@example.jp'), false);
});

test('markdown link is fully redacted without retaining its encoded contact argument', async () => {
  const result = await getPublicChildcareJob({ job_id: id }, config({
    ...base,
    description: '応募受付は [外部フォーム](https://example.jp/apply?candidate=secret-xyz) です。保育士資格。',
  }));
  assert.equal(result.job.description,
    '応募受付は [外部フォーム]([連絡先省略]) です。保育士資格。');
  assert.equal(JSON.stringify(result).includes('secret-xyz'), false);
});

test('facet suggestions exclude URL payloads and keep legitimate search filters', async () => {
  const result = await listPublicChildcareJobFilters({}, config({
    prefectures: ['東京都', 'www.ex.jp/?token=secret', '大阪府'],
    employment_types: ['正社員', 'ｈｔｔｐｓ：／／evil.example／private', 'パート'],
  }));
  assert.deepEqual(result.prefectures, ['東京都', '大阪府']);
  assert.deepEqual(result.employment_types, ['正社員', 'パート']);
});
