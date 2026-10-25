import assert from 'node:assert/strict';
import test from 'node:test';
import {
  searchPublicChildcareJobs, getPublicChildcareJob, listPublicChildcareJobFilters,
} from '../public-jobs.mjs';

const id = '11111111-1111-4111-8111-000000000122';
const now = Date.parse('2026-10-25T03:00:00Z');
const base = {
  id, title: '保育士求人', is_external: false,
  published_at: '2026-10-24T00:00:00Z', closing_at: null,
  total_count: 1,
};
const config = row => ({
  supabaseUrl: 'https://fixture.supabase.co',
  publishableKey: 'sb_publishable_fixture',
  now: () => now,
  fetcher: async () => Response.json([row]),
});

test('search removes protocol-relative and FTP links with opaque identifiers', async () => {
  const result = await searchPublicChildcareJobs({}, config({
    ...base,
    description: '東京都で勤務。応募先 //external.example/apply?candidate=private-123 または ftp://external.example/data?token=hidden-456 は使用しないでください。',
  }));
  assert.equal(result.jobs[0].description,
    '東京都で勤務。応募先 [連絡先省略] または [連絡先省略] は使用しないでください。');
  assert.equal(JSON.stringify(result).includes('private-123'), false);
  assert.equal(JSON.stringify(result).includes('hidden-456'), false);
  assert.equal(result.jobs[0].url, `https://hoikucolor.jp/jobs/${id}`);
});

test('detail removes query values wrapped in nested parentheses without breaking markdown', async () => {
  const result = await getPublicChildcareJob({ job_id: id }, config({
    ...base,
    description: '給与は月給25万円。[詳細](https://outside.example/?token=(secret(foo))&candidate=hidden) をご覧ください。',
  }));
  assert.equal(result.job.description,
    '給与は月給25万円。[詳細]([連絡先省略]) をご覧ください。');
  assert.equal(JSON.stringify(result).includes('secret'), false);
  assert.equal(JSON.stringify(result).includes('candidate=hidden'), false);
});

test('detail removes javascript and data URI destinations without deleting unrelated text', async () => {
  const result = await getPublicChildcareJob({ job_id: id }, config({
    ...base,
    description: '勤務は週5日。javascript:alert(1) と data:text/plain;base64,c2VjcmV0 は参照しないでください。',
  }));
  assert.equal(result.job.description,
    '勤務は週5日。[連絡先省略] と [連絡先省略] は参照しないでください。');
});

test('public filter facets cannot advertise protocol-relative or script links', async () => {
  const result = await listPublicChildcareJobFilters({}, config({
    prefectures: ['大阪府', '//external.example/path?candidate=hidden', '東京都'],
    employment_types: ['正社員', 'javascript:alert(1)', 'パート'],
  }));
  assert.deepEqual(result.prefectures, ['大阪府', '東京都']);
  assert.deepEqual(result.employment_types, ['正社員', 'パート']);
});
