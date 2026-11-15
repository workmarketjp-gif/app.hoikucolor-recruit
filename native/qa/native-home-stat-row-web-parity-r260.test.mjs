import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { homeStatRowPresentation } from '../src/lib/homeStatRowPresentation.ts';

const home = readFileSync(new URL('../src/app/(tabs)/home.tsx', import.meta.url), 'utf8');

test('Web Home confirmed zero is visible, not unknown', () => {
  assert.deepEqual(homeStatRowPresentation(0, null), { value: '0', retry: false });
});

test('confirmed positive counts stay actionable despite unrelated partial warnings', () => {
  assert.deepEqual(homeStatRowPresentation(3, 'partial notification warning'), { value: '3', retry: false });
});

test('failed private count is an on-row retry, never a navigation/zero', () => {
  assert.deepEqual(homeStatRowPresentation(null, 'RPC failed'), { value: '読み込めませんでした', retry: true });
});

test('loading/missing private count uses the Web ellipsis, not fabricated zero', () => {
  assert.deepEqual(homeStatRowPresentation(null, null), { value: '…', retry: false });
});

test('malformed counts cannot silently claim a confirmed count', () => {
  for (const count of [-1, NaN, Infinity, 1.2]) {
    assert.deepEqual(homeStatRowPresentation(count, 'Invalid response'), { value: '読み込めませんでした', retry: true });
  }
});

test('Native home wires both stat rows to canonical refresh instead of stale navigation on failure', () => {
  assert.match(home, /homeStatRowPresentation\(count \?\? null, error \?\? null\)/);
  assert.match(home, /stat && statPresentation\?\.retry && onRetry/);
  assert.match(home, /id="home-applications"[\s\S]*?onRetry=\{applicationProgress\.refresh\}/);
  assert.match(home, /id="home-next-message"[\s\S]*?onRetry=\{notifications\.refresh\}/);
  assert.match(home, /void onRetry\(\)\.catch\(\(\) => undefined\)/);
});
