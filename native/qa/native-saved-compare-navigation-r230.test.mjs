import { test } from 'node:test';
import assert from 'node:assert/strict';
import { requestedComparisonJobIds, reconcileComparedSelection, savedComparisonRoute } from '../src/lib/comparisonSelection.ts';
const A = '123e4567-e89b-42d3-a456-426614174000';
const B = '123e4567-e89b-42d3-a456-426614174001';
const C = '123e4567-e89b-42d3-a456-426614174002';
const D = '123e4567-e89b-42d3-a456-426614174003';
test('verified saved rows yield the requested two or three job compare route', () => {
  assert.equal(savedComparisonRoute([A,B]), `/compare?job_id=${A}&job_id=${B}`);
  assert.equal(savedComparisonRoute([C,A,B,D]), `/compare?job_id=${C}&job_id=${A}&job_id=${B}`);
});
test('one, duplicate or malformed saved ids never create a comparison route', () => {
  for (const ids of [[],[A],[A,A],['../../profile',A],[A+'?admin=true',B]])
    assert.equal(savedComparisonRoute(ids),null);
});
test('invalid or duplicate ids do not consume slots or inject route parameters', () => {
  assert.equal(savedComparisonRoute([A,'../../profile',B,B,C,D]),
    `/compare?job_id=${A}&job_id=${B}&job_id=${C}`);
  assert.deepEqual(requestedComparisonJobIds([A,B,B,C,D]), [A,B,C]);
});
test('Compare must still intersect incoming ids with its published authorized catalog', () => {
  const params = new URLSearchParams(savedComparisonRoute([A,B,C]).split('?')[1]);
  assert.deepEqual(reconcileComparedSelection(requestedComparisonJobIds(params.getAll('job_id')),[B,C]),[B,C]);
});
