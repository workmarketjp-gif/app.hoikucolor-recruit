import assert from 'node:assert/strict';
import test from 'node:test';
import { searchPublicChildcareJobs, getPublicChildcareJob, listPublicChildcareJobFilters } from '../public-jobs.mjs';

// Published third-party job text may obfuscate phone numbers with Japanese
// punctuation or invisible Unicode characters. Such strings must never pass
// through to anonymous ChatGPT/Claude tools as candidate/recruiter contacts.
const id = '11111111-1111-4111-8111-000000000123';
const now = Date.parse('2026-10-25T00:00:00Z');
const base = {
  id, title: '公開中の保育士求人', is_external: false, total_count: 1,
  published_at: '2026-10-24T00:00:00Z', closing_at: null,
};
function publicConfig(row) {
  return {
    supabaseUrl: 'https://public-fixture.supabase.co',
    publishableKey: 'sb_publishable_fixture',
    now: () => now,
    fetcher: async () => Response.json([row]),
  };
}

test('anonymous search and detail redact Japanese punctuation and invisible-marker contacts', async () => {
  const job = {
    ...base,
    description: '連絡は０９０・１２３４・５６７８、03−1234−5678。保育室での業務です。',
    salary_note: '月給25万円。電話は090ー1234ー5678。',
    required_qualification: '保育士資格。相談は ali\u200bce@exa\u200bmple.jp',
  };
  const search = await searchPublicChildcareJobs({}, publicConfig(job));
  const detail = await getPublicChildcareJob({ job_id: id }, publicConfig(job));
  for (const projected of [search.jobs[0], detail.job]) {
    assert.ok(projected);
    assert.equal(projected.description, '連絡は[連絡先省略]、[連絡先省略]。保育室での業務です。');
    assert.equal(projected.salary_note, '月給25万円。電話は[連絡先省略]。');
    assert.equal(projected.required_qualification, '保育士資格。相談は [連絡先省略]');
    assert.equal(JSON.stringify(projected).includes('1234'), false);
    assert.equal(JSON.stringify(projected).includes('example.jp'), false);
    assert.equal(JSON.stringify(projected).includes('\u200b'), false);
  }
});

test('facet suggestions never expose phone or email strings disguised with separators', async () => {
  const facets = await listPublicChildcareJobFilters({}, publicConfig({
    prefectures: ['東京都', '０９０・１２３４・５６７８', '大阪府'],
    employment_types: ['正社員', 'bob\u200b@example.jp', 'パート'],
  }));
  assert.deepEqual(facets.prefectures, ['東京都', '大阪府']);
  assert.deepEqual(facets.employment_types, ['正社員', 'パート']);
});

test('ordinary job conditions are preserved while invisible controls are stripped', async () => {
  const description = '2026年10月25日・週休2日・月給250,000円。';
  const found = await searchPublicChildcareJobs({}, publicConfig({
    ...base, description: '2026年10月25日・週休2日・月給250,000円。\u200b',
  }));
  assert.equal(found.jobs[0].description, description);
});
