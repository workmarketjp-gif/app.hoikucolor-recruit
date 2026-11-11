import test from 'node:test';
import assert from 'node:assert/strict';
import { keywordForCurrentCandidate } from '../src/lib/jobSearchKeywordDraft.ts';

const A = 'candidate-a:session-1';
const B = 'candidate-b:session-2';

test('keyboard search uses the latest typed keyword even before a React rerender', () => {
  assert.equal(keywordForCurrentCandidate(A, { ownerKey: A, value: '保育士' }, '保育'), '保育士');
});

test('filter search uses the same latest draft rather than the prior render', () => {
  assert.equal(keywordForCurrentCandidate(A, { ownerKey: A, value: '東京都' }, '東京'), '東京都');
});

test('a candidate or session switch must not inherit another candidate keyword', () => {
  assert.equal(keywordForCurrentCandidate(B, { ownerKey: A, value: '非公開の検索語' }, ''), '');
  assert.equal(keywordForCurrentCandidate(B, { ownerKey: A, value: '非公開の検索語' }, '大阪'), '大阪');
  assert.equal(keywordForCurrentCandidate(null, { ownerKey: A, value: '非公開の検索語' }, '大阪'), '');
});

test('cleared draft and legitimate empty search remain empty, not stale', () => {
  assert.equal(keywordForCurrentCandidate(A, { ownerKey: A, value: '' }, '旧語'), '');
});

test('the view helper preserves raw Unicode and whitespace for the canonical API to trim', () => {
  const input = '  認可保育園　／担任  ';
  assert.equal(keywordForCurrentCandidate(A, { ownerKey: A, value: input }, '旧語'), input);
});
