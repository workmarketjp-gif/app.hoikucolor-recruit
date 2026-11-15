import assert from 'node:assert/strict';
import test from 'node:test';
import {
  rememberCareerFacetNames, careerPrefectureOptionsWithHistory, careerEmploymentOptions,
} from '../src/lib/careerPrefectureOptions.ts';

const first = {
  coverage: [{ prefecture: '東京都', count: 8 }, { prefecture: '大阪府', count: 4 }],
  employment_types: ['正社員', 'パート'],
};

test('a successful canonical response retains all its real facet names', () => {
  const saved = rememberCareerFacetNames(null, first);
  assert.deepEqual(saved.prefectures, ['大阪府', '東京都']);
  assert.deepEqual(saved.employmentTypes, ['パート', '正社員']);
});

test('after filter change / loading, previous regions remain selectable without stale counts', () => {
  const saved = rememberCareerFacetNames(null, first);
  assert.deepEqual(careerPrefectureOptionsWithHistory([], '東京都', saved.prefectures), [
    { value: '大阪府', count: null }, { value: '東京都', count: null },
  ]);
});

test('fresh counts are shown ONLY for regions in the current RPC, never inherited from history', () => {
  const saved = rememberCareerFacetNames(null, first);
  const afterChange = careerPrefectureOptionsWithHistory([{ prefecture: '大阪府', count: 2 }], '大阪府', saved.prefectures);
  assert.deepEqual(afterChange, [{ value: '大阪府', count: 2 }, { value: '東京都', count: null }]);
});

test('a verified region outside prior results is added without losing previous names', () => {
  const saved = rememberCareerFacetNames(null, first);
  const next = rememberCareerFacetNames(saved, {
    coverage: [{ prefecture: '神奈川県', count: 6 }], employment_types: ['契約社員'],
  });
  assert.deepEqual(next.prefectures, ['神奈川県', '大阪府', '東京都']);
  assert.deepEqual(next.employmentTypes, ['パート', '契約社員', '正社員']);
});

test('employment type can be changed back after a query returns only its current type', () => {
  const saved = rememberCareerFacetNames(null, first);
  assert.deepEqual(careerEmploymentOptions(['正社員'], '正社員', saved.employmentTypes), ['パート', '正社員']);
});

test('selected employment type remains visible during error while preserving no invented types', () => {
  assert.deepEqual(careerEmploymentOptions([], '契約社員', []), ['契約社員']);
  assert.deepEqual(careerEmploymentOptions([], '', []), []);
});

test('no mutation of frozen source arrays and no fabricated job counts', () => {
  const coverage = Object.freeze([{ prefecture: '兵庫県', count: 2 }]);
  const types = Object.freeze(['パート']);
  const result = rememberCareerFacetNames(null, { coverage, employment_types: types });
  assert.deepEqual(result.prefectures, ['兵庫県']);
  assert.deepEqual(careerPrefectureOptionsWithHistory([], '北海道', result.prefectures), [
    { value: '兵庫県', count: null }, { value: '北海道', count: null },
  ]);
  assert.equal(coverage.length, 1);
});

test('empty or invalid facet names are dropped', () => {
  const result = rememberCareerFacetNames(null, {
    coverage: [{ prefecture: '', count: 1 }, { prefecture: '京都府', count: 3 }],
    employment_types: ['', '  ', '正社員'],
  });
  assert.deepEqual(result.prefectures, ['京都府']);
  assert.deepEqual(result.employmentTypes, ['正社員']);
});
