import assert from 'node:assert/strict';
import test from 'node:test';
import { retainedJobSearchFacets } from '../src/lib/jobSearchFacetRetention.ts';

const confirmed = Object.freeze({ ownerKey: 'candidate-a:session-1', value: Object.freeze({
  prefectures: Object.freeze(['北海道', '東京都']),
  employmentTypes: Object.freeze(['正社員']),
}) });

test('same owner retains the original canonical filter names through a retry', () => {
  const value = retainedJobSearchFacets(confirmed, 'candidate-a:session-1', true);
  assert.equal(value, confirmed);
  assert.equal(value.value, confirmed.value);
  assert.equal('totalCount' in value.value, false);
});

test('owner change, session change, signed-out or shield rejects retained filters', () => {
  for (const owner of [null, '', 'candidate-a:session-2', 'candidate-b:session-1']) {
    assert.equal(retainedJobSearchFacets(confirmed, owner, true), null);
  }
  assert.equal(retainedJobSearchFacets(confirmed, 'candidate-a:session-1', false), null);
});

test('no confirmed facet result stays absent on an initial failed read', () => {
  assert.equal(retainedJobSearchFacets(null, 'candidate-a:session-1', true), null);
});
