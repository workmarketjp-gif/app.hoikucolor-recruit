import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcileComparedSelection } from '../src/lib/comparisonSelection.ts';

test('preserves authorized comparison order and de-duplicates selections', () => {
  assert.deepEqual(reconcileComparedSelection(['a', 'b', 'a', 'c'], ['c', 'a', 'b']), ['a', 'b', 'c']);
});
test('revoked, removed or closed jobs are never kept from a previous read', () => {
  assert.deepEqual(reconcileComparedSelection(['old-private', 'still-open'], ['still-open', 'new']), ['still-open']);
});
test('no previous account selections survive an empty authorized catalog', () => {
  assert.deepEqual(reconcileComparedSelection(['a', 'b'], []), []);
});
test('limits selections to the current maximum without restoring a removed id', () => {
  assert.deepEqual(reconcileComparedSelection(['a', 'b', 'c', 'd'], ['a', 'b', 'c', 'd']), ['a', 'b', 'c']);
  assert.deepEqual(reconcileComparedSelection(['a', 'b'], ['a', 'b'], 0), []);
});
test('null or absent selection is a safe empty set', () => {
  assert.deepEqual(reconcileComparedSelection(null, ['a']), []);
  assert.deepEqual(reconcileComparedSelection(undefined, ['a']), []);
});
