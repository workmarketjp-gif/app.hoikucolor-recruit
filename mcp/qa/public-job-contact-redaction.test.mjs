import test from 'node:test';
import assert from 'node:assert/strict';
import { getPublicChildcareJob, listPublicChildcareJobFilters, searchPublicChildcareJobs } from '../public-jobs.mjs';

const id = '11111111-1111-4111-8111-000000000017';
const now = Date.parse('2026-10-17T00:00:00Z');
const fixture = {
  id, title: '保育士求人（03-1234-5678）',
  description: '園の活動を紹介します。担当者への連絡 alice@example.jp、090-1234-5678、+81 90 1234 5678。',
  salary_note: '給与は応相談。連絡先は03-9999-0000です。',
  required_qualification: '保育士資格 / jane.smith@company.co.jp に送らないでください',
  facility_name: '園名', source_name: 'ソース',
  published_at: '2026-10-16T00:00:00Z', closing_at: null,
  is_external: false, total_count: 1,
  applicant_email: 'never-leak@example.invalid',
  internal_selection_memo: 'private',
};
const config = {
  supabaseUrl: 'https://kcmmpjyngcysdfbumchk.supabase.co',
  publishableKey: 'sb_publishable_fixture',
  now: () => now,
  fetcher: async () => Response.json([fixture]),
};

test('anonymous search redacts phone numbers and email inside otherwise public free text', async () => {
  const data = await searchPublicChildcareJobs({}, config);
  assert.equal(data.jobs.length, 1);
  const job = data.jobs[0];
  const text = JSON.stringify(job);
  assert.ok(job.title.includes('[連絡先省略]'), 'job title also needs scrub');
  assert.equal(text.includes('alice@example.jp'), false);
  assert.equal(text.includes('090-1234-5678'), false);
  assert.equal(text.includes('+81 90 1234 5678'), false);
  assert.equal(text.includes('03-9999-0000'), false);
  assert.equal(text.includes('jane.smith@company.co.jp'), false);
  assert.equal(text.includes('never-leak@example.invalid'), false);
  assert.equal(text.includes('internal_selection_memo'), false);
  assert.equal(job.url, `https://hoikucolor.jp/jobs/${id}`);
  assert.match(job.description, /園の活動/);
});

test('anonymous detail uses the same redaction boundary', async () => {
  const data = await getPublicChildcareJob({ job_id: id }, config);
  assert.ok(data.job);
  assert.ok(data.job.description.includes('[連絡先省略]'));
  assert.ok(!JSON.stringify(data).includes('example.jp'));
});

test('non-contact employment facts are preserved', async () => {
  const row = {
    ...fixture, title: '正社員保育士',
    description: '月給 250,000円。週休2日。残業は月10時間程度。',
    salary_min: 250000, salary_max: 320000,
  };
  const data = await searchPublicChildcareJobs({}, { ...config, fetcher: async () => Response.json([row]) });
  assert.equal(data.jobs[0].description, row.description);
  assert.equal(data.jobs[0].salary_min, 250000);
  assert.equal(data.jobs[0].salary_max, 320000);
});

test('unicode bidi controls are removed from third-party descriptions', async () => {
  const row = { ...fixture, description: '勤務地：東京都\\u202e秘密\\u2066' };
  const data = await searchPublicChildcareJobs({}, { ...config, fetcher: async () => Response.json([row]) });
  assert.equal(/[\u202a-\u202e\u2066-\u2069]/u.test(data.jobs[0].description), false);
});


test('public filter facets never echo embedded candidate contacts from compromised public source', async () => {
  const facetConfig = {
    ...config,
    fetcher: async () => Response.json([{
      prefectures: ['東京都', 'alice@example.jp', '大阪府', '080-5555-1234'],
      employment_types: ['full_time', 'part_time', '+81 90 1234 5678'],
    }]),
  };
  const result = await listPublicChildcareJobFilters({}, facetConfig);
  assert.deepEqual(result.prefectures, ['東京都', '大阪府']);
  assert.deepEqual(result.employment_types, ['full_time', 'part_time']);
  assert.equal(JSON.stringify(result).includes('alice@example.jp'), false);
  assert.equal(JSON.stringify(result).includes('080-5555-1234'), false);
});

test('public filter facets reject bidi-control payloads instead of reflecting them to a model', async () => {
  const badConfig = {
    ...config,
    fetcher: async () => Response.json([{
      prefectures: ['東京都\u202e'], employment_types: ['full_time'],
    }]),
  };
  await assert.rejects(listPublicChildcareJobFilters({}, badConfig), /PUBLIC_JOB_SOURCE_INVALID_FACET/);
});
