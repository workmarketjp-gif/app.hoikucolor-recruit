import test from 'node:test';
import assert from 'node:assert/strict';
import { searchPublicChildcareJobs, getPublicChildcareJob } from '../public-jobs.mjs';

// Synthetic public data only. These URLs and identifiers are deliberately fake.
const id = '11111111-1111-4111-8111-000000000001';
const base = {
  id, title: '保育士募集', facility_name: '公開保育園',
  description: 'こどもと遊ぶ仕事。', published_at: '2026-10-25T00:00:00Z',
  closing_at: null, is_external: false, total_count: 1,
};
function config(changes) {
  const row = { ...base, ...changes };
  return {
    supabaseUrl: 'https://abcdefgh.supabase.co/',
    publishableKey: 'sb_publishable_synthetic_test_key',
    now: () => Date.parse('2026-10-26T00:00:00Z'),
    fetcher: async () => new Response(JSON.stringify([row]), {
      headers: { 'content-type': 'application/json' },
    }),
  };
}
async function search(changes) {
  const result = await searchPublicChildcareJobs({ limit: 10 }, config(changes));
  assert.equal(result.returned, 1);
  return result.jobs[0];
}

test('Japanese-language domain in source text cannot expose a secret query parameter', async () => {
  const job = await search({
    description: '保育内容の説明。応募先 example.みんな/apply?token=PRIVATE_ID_123 休日は週2日。',
  });
  assert.equal(job.description.includes('PRIVATE_ID_123'), false);
  assert.equal(job.description.includes('example.みんな'), false);
  assert.match(job.description, /\[連絡先省略\]/);
  assert.match(job.description, /保育内容の説明/);
  assert.match(job.description, /休日は週2日/);
  assert.equal(job.url, `https://hoikucolor.jp/jobs/${id}`);
});

test('punycode TLD must be removed in full rather than leaving URL token data behind', async () => {
  const job = await search({
    description: '応募先 example.xn--p1ai/entry?candidate=PRIVATE_CASE_456 福利厚生あり。',
  });
  assert.equal(job.description.includes('PRIVATE_CASE_456'), false);
  assert.equal(job.description.includes('xn--p1ai'), false);
  assert.match(job.description, /\[連絡先省略\]/);
  assert.match(job.description, /福利厚生あり/);
});

test('full-width compatibility characters and internationalized domain in facility text are scrubbed', async () => {
  const job = await search({
    facility_name: '公開園 ｅｘａｍｐｌｅ．みんな／entry?token=PRIVATE_CASE_789',
  });
  assert.equal(job.facility_name.includes('PRIVATE_CASE_789'), false);
  assert.match(job.facility_name, /^公開園 /);
  assert.match(job.facility_name, /\[連絡先省略\]/);
});

test('job detail uses the same redaction boundary and preserves ordinary description text', async () => {
  const detail = await getPublicChildcareJob({ job_id: id }, config({
    description: '休日120日。保育園.みんな/contact?token=DO_NOT_RETURN 年休あり。',
  }));
  assert.equal(detail.job?.description.includes('DO_NOT_RETURN'), false);
  assert.match(detail.job?.description ?? '', /休日120日/);
  assert.match(detail.job?.description ?? '', /年休あり/);
  assert.match(detail.job?.description ?? '', /\[連絡先省略\]/);
});
