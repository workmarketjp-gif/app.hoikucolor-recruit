import test from 'node:test';
import assert from 'node:assert/strict';
import { organicJobRankLabels } from '../src/lib/jobRankingDisclosure.ts';

test('ordinary search results use Web-matched organic position labels', () => {
  assert.deepEqual(organicJobRankLabels(['a', 'b', 'c']), [
    { text: '表示順 1', ariaLabel: '検索結果の表示順 1番目' },
    { text: '表示順 2', ariaLabel: '検索結果の表示順 2番目' },
    { text: '表示順 3', ariaLabel: '検索結果の表示順 3番目' },
  ]);
});
test('a requested deep-link result is not misrepresented as an organic position', () => {
  assert.deepEqual(organicJobRankLabels(['pinned', 'a', 'b'], 'pinned'), [
    { text: '指定求人', ariaLabel: 'Google求人などから指定された求人' },
    { text: '表示順 1', ariaLabel: '検索結果の表示順 1番目' },
    { text: '表示順 2', ariaLabel: '検索結果の表示順 2番目' },
  ]);
});
test('zero results do not manufacture a rank', () => {
  assert.deepEqual(organicJobRankLabels([]), []);
});
