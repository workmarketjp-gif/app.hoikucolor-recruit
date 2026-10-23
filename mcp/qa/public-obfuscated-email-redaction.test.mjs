import test from 'node:test';
import assert from 'node:assert/strict';
import {
  searchPublicChildcareJobs,
  getPublicChildcareJob,
  listPublicChildcareJobFilters,
} from '../public-jobs.mjs';

const id = '11111111-1111-4111-8111-000000000091';
const now = Date.parse('2026-10-23T08:00:00Z');
const row = {
  id, is_external: false, title: '保育士募集',
  description: 'ご応募は alice [at] example [dot] jp へ。勤務条件は週休2日です。',
  facility_name: 'ひかり保育園', prefecture: '東京都', employment_type: '正社員',
  published_at: '2026-10-22T00:00:00Z', closing_at: null, total_count: 1,
};
const config = (source) => ({
  supabaseUrl: 'https://kcmmpjyngcysdfbumchk.supabase.co',
  publishableKey: 'sb_publishable_public_only_fixture',
  now: () => now,
  fetcher: async () => Response.json([source]),
});

test('public search removes the entire [at]/[dot] email, including local part', async () => {
  const data = await searchPublicChildcareJobs({}, config(row));
  assert.equal(data.jobs.length, 1);
  assert.equal(data.jobs[0].description,
    'ご応募は [連絡先省略] へ。勤務条件は週休2日です。');
});

test('public detail removes parenthesized at/dot contact without removing context', async () => {
  const data = await getPublicChildcareJob({ job_id: id }, config({
    ...row, description: '採用: example.person(at)example(dot)co(dot)jp 担当まで。',
  }));
  assert.equal(data.job.description, '採用: [連絡先省略] 担当まで。');
});

test('ordinary non-contact childcare text is preserved verbatim', async () => {
  const source = { ...row, description: 'ドット絵の教材を使います。週休2日、保育士資格必須。' };
  const data = await searchPublicChildcareJobs({}, config(source));
  assert.equal(data.jobs[0].description, source.description);
});

test('Unicode NFKC email disguise keeps adjacent emoji and Japanese text', async () => {
  const data = await getPublicChildcareJob({ job_id: id }, config({
    ...row, description: '🌸連絡: 𝐚𝐥𝐢𝐜𝐞 [ＡＴ] 𝐞𝐱𝐚𝐦𝐩𝐥𝐞 [ＤＯＴ] jp →🌼',
  }));
  assert.equal(data.job.description, '🌸連絡: [連絡先省略] →🌼');
});

test('filter suggestions omit disguised contacts instead of advertising them', async () => {
  const facets = await listPublicChildcareJobFilters({}, {
    ...config(row),
    fetcher: async () => Response.json([{
      prefectures: ['東京都', 'alice [at] example [dot] jp'],
      employment_types: ['正社員', 'alice(at)example(dot)co(dot)jp'],
    }]),
  });
  assert.deepEqual(facets.prefectures, ['東京都']);
  assert.deepEqual(facets.employment_types, ['正社員']);
});
