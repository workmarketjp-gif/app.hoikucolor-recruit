import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getPublicChildcareJob,
  listPublicChildcareJobFilters,
  searchPublicChildcareJobs,
} from '../public-jobs.mjs';

const jobId = '11111111-1111-4111-8111-000000000081';
const now = Date.parse('2026-10-26T00:00:00Z');
const baseJob = {
  id: jobId,
  title: '保育士募集',
  facility_name: 'ひまわり保育園',
  prefecture: '東京都',
  city: '新宿区',
  employment_type: 'full_time',
  salary_min: 220000,
  salary_max: 300000,
  published_at: '2026-10-25T00:00:00Z',
  closing_at: null,
  source_last_verified_at: null,
  is_external: false,
  total_count: 1,
};

function config(row = baseJob, facetRow = { prefectures: ['東京都'], employment_types: ['full_time'] }) {
  return {
    supabaseUrl: 'https://kcmmpjyngcysdfbumchk.supabase.co',
    publishableKey: 'sb_publishable_mock_public_key',
    now: () => now,
    fetcher: async url => new Response(JSON.stringify(
      new URL(url).pathname.endsWith('hc_public_job_search_facets_v2') ? [facetRow] : [row],
    ), { status: 200, headers: { 'content-type': 'application/json' } }),
  };
}

test('anonymous search redacts scheme-less off-site link query secrets, retaining useful job facts', async () => {
  const row = {
    ...baseJob,
    description: '求人詳細 example.com/apply?candidate_id=CANDIDATE_TOKEN&secret=TOP_SECRET をご覧ください。',
    salary_note: '月給22.5万円、完全週休2日',
  };
  const result = await searchPublicChildcareJobs({ limit: 10 }, config(row));
  assert.equal(result.returned, 1);
  assert.equal(result.jobs[0].description, '求人詳細 [連絡先省略] をご覧ください。');
  assert.equal(result.jobs[0].salary_note, row.salary_note);
  assert.equal(result.jobs[0].url, 'https://hoikucolor.jp/jobs/' + jobId);
  assert.doesNotMatch(JSON.stringify(result), /CANDIDATE_TOKEN|TOP_SECRET|example\.com/);
});

test('anonymous job detail also removes bare subdomains with tracking parameters', async () => {
  const row = {
    ...baseJob,
    description: '施設情報 nursery.example.co.jp/?candidate=IDENTIFIER&auth=TOKEN を確認',
    organization_name: '保育法人',
  };
  const result = await getPublicChildcareJob({ job_id: jobId }, config(row));
  assert.equal(result.job.id, jobId);
  assert.equal(result.job.description, '施設情報 [連絡先省略] を確認');
  assert.equal(result.job.organization_name, '保育法人');
  assert.doesNotMatch(JSON.stringify(result), /IDENTIFIER|TOKEN|nursery\.example/);
});

test('Unicode-width and Japanese-domain scheme-less links are redacted in the original text span', async () => {
  const row = {
    ...baseJob,
    description: '応募先 ｅｘａｍｐｌｅ．ｊｐ／ａｐｐｌｙ？ｔｏｋｅｎ＝ＳＥＣＲＥＴ と ほいく園.jp/?key=PRIVATE です。',
  };
  const result = await getPublicChildcareJob({ job_id: jobId }, config(row));
  assert.equal(result.job.description, '応募先 [連絡先省略] と [連絡先省略] です。');
  assert.doesNotMatch(JSON.stringify(result), /ＳＥＣＲＥＴ|PRIVATE|ほいく園\.jp|ｅｘａｍｐｌｅ/);
});

test('public facet suggestions reject off-site domain values without changing ordinary filters', async () => {
  const facets = {
    prefectures: ['東京都', 'example.com/apply?token=PRIVATE', '大阪府'],
    employment_types: ['full_time', 'nursery.example.co.jp/?token=SECRET', 'part_time'],
  };
  const result = await listPublicChildcareJobFilters({}, config(baseJob, facets));
  assert.deepEqual(result.prefectures, ['東京都', '大阪府']);
  assert.deepEqual(result.employment_types, ['full_time', 'part_time']);
  assert.doesNotMatch(JSON.stringify(result), /example\.com|PRIVATE|SECRET/);
});
