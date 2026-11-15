import assert from 'node:assert/strict';
import test from 'node:test';
import { careerPrefectureOptions } from '../src/lib/careerPrefectureOptions.ts';

test('Web: every canonical coverage prefecture remains selectable, not just top 12', () => {
  const coverage = Array.from({ length: 20 }, (_, i) => ({ prefecture: '地域' + (i + 1), count: i }));
  const options = careerPrefectureOptions(coverage, '');
  assert.equal(options.length, 20);
  assert.equal(new Set(options.map(row => row.value)).size, 20);
  for (const row of coverage) assert.equal(options.find(item => item.value === row.prefecture)?.count, row.count);
});

test('selected preference outside reported coverage remains selectable without a fabricated zero count', () => {
  assert.deepEqual(careerPrefectureOptions([{ prefecture: '東京都', count: 7 }], '山形県'), [
    { value: '山形県', count: null }, { value: '東京都', count: 7 },
  ]);
});

test('selected existing region retains its canonical count and is not duplicated', () => {
  const result = careerPrefectureOptions([{ prefecture: '東京都', count: 5 }, { prefecture: '東京都', count: 9 }], '東京都');
  assert.deepEqual(result, [{ value: '東京都', count: 9 }]);
});

test('Japanese order follows the Web localeCompare ja sort', () => {
  const result = careerPrefectureOptions([
    { prefecture: '北海道', count: 1 }, { prefecture: '東京都', count: 2 },
    { prefecture: '大阪府', count: 3 }, { prefecture: '神奈川県', count: 4 },
  ], '');
  assert.deepEqual(result.map(row => row.value), ['神奈川県', '大阪府', '東京都', '北海道']);
});

test('invalid/unverified counts and unnamed regions are not represented as actual job counts', () => {
  const input = [{ prefecture: '', count: 3 }, { prefecture: '京都府', count: Number.NaN }, { prefecture: '沖縄県', count: -1 }];
  assert.deepEqual(careerPrefectureOptions(input, ''), [
    { value: '沖縄県', count: null }, { value: '京都府', count: null },
  ]);
});

test('source data is never mutated', () => {
  const input = Object.freeze([Object.freeze({ prefecture: '東京都', count: 12 })]);
  const options = careerPrefectureOptions(input, '大阪府');
  assert.equal(input.length, 1);
  assert.equal(options.find(v => v.value === '東京都')?.count, 12);
  assert.equal(options.find(v => v.value === '大阪府')?.count, null);
});
