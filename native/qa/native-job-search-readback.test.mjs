import assert from 'node:assert/strict';
import test from 'node:test';
import { verifiedJobSearchRows, verifiedJobSearchFacets } from '../src/lib/jobSearchReadback.ts';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const job = (patch = {}) => ({
  id: A, facility_id: B, facility_name: '合成ひまわり保育園', title: '合成求人',
  rank_quality: '2.50', rank_transparency: 3, total_count: '2', has_more: true,
  published_at: '2026-11-01T00:00:00Z', ...patch,
});

test('actual [] is valid no-result page, but missing/null/scalar RPC data is an error', () => {
  assert.deepEqual(verifiedJobSearchRows([]), []);
  for (const data of [null, undefined, {}, '[]', false, 0]) {
    assert.throws(() => verifiedJobSearchRows(data), /検索の結果/);
  }
});
test('canonical job rank, counts and Japanese text are preserved without synthetic scores', () => {
  const input = [job()];
  assert.equal(verifiedJobSearchRows(input), input);
  assert.deepEqual(verifiedJobSearchRows(input)[0], job());
});
test('malformed identity, ranking, counts or boolean pagination cannot masquerade as jobs', () => {
  for (const patch of [
    { id: 'not-an-id' }, { facility_id: null }, { facility_name: '' }, { title: null },
    { rank_quality: NaN }, { rank_quality: '' }, { rank_transparency: 'infinity' },
    { total_count: -1 }, { total_count: 'not-a-number' }, { total_count: 0 },
    { has_more: 'true' },
  ]) assert.throws(() => verifiedJobSearchRows([job(patch)]), /検索の結果/);
});
test('duplicate identities and contradictory pagination metadata reject the entire page', () => {
  assert.throws(() => verifiedJobSearchRows([job(), job()]), /検索の結果/);
  assert.throws(() => verifiedJobSearchRows([job(), job({ id: B, total_count: 3 })]), /検索の結果/);
  assert.throws(() => verifiedJobSearchRows([job(), job({ id: B, has_more: false })]), /検索の結果/);
});
test('genuine empty facets and complete facet records preserve user-selectable filters', () => {
  assert.deepEqual(verifiedJobSearchFacets([]), { prefectures: [], employmentTypes: [] });
  assert.deepEqual(verifiedJobSearchFacets([{ prefectures: ['東京都'], employment_types: ['正社員'] }]),
    { prefectures: ['東京都'], employmentTypes: ['正社員'] });
  assert.deepEqual(verifiedJobSearchFacets([{ prefectures: null, employment_types: [] }]),
    { prefectures: [], employmentTypes: [] });
});
test('missing, corrupted or partial facet results are errors instead of blank dropdowns', () => {
  for (const data of [null, undefined, {}, '[]', [null], [{}],
    [{ prefectures: ['東京都'] }],
    [{ prefectures: [3], employment_types: [] }],
    [{ prefectures: [], employment_types: [''] }],
    [{ prefectures: [], employment_types: [] }, { prefectures: [], employment_types: [] }]]) {
    assert.throws(() => verifiedJobSearchFacets(data), /絞り込み条件/);
  }
});
