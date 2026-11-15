import assert from 'node:assert/strict';
import test from 'node:test';
import { isJobSearchFacetSelected } from '../src/lib/jobSearchFacetSelection.ts';

const blank = Object.freeze({ prefecture: '', employmentType: '' });
const chosen = Object.freeze({ prefecture: '東京都', employmentType: '正社員' });

test('default row is marked selected in either picker only when its filter is empty', () => {
  assert.equal(isJobSearchFacetSelected('prefecture', blank, ''), true);
  assert.equal(isJobSearchFacetSelected('employment', blank, ''), true);
  assert.equal(isJobSearchFacetSelected('prefecture', chosen, ''), false);
  assert.equal(isJobSearchFacetSelected('employment', chosen, ''), false);
});

test('owner-scoped active prefecture and employment type are selected independently', () => {
  assert.equal(isJobSearchFacetSelected('prefecture', chosen, '東京都'), true);
  assert.equal(isJobSearchFacetSelected('employment', chosen, '正社員'), true);
  assert.equal(isJobSearchFacetSelected('employment', chosen, '東京都'), false);
  assert.equal(isJobSearchFacetSelected('prefecture', chosen, '正社員'), false);
  assert.equal(isJobSearchFacetSelected('prefecture', chosen, '大阪府'), false);
});

test('dismissed picker never marks a choice selected or mutates the filters', () => {
  assert.equal(isJobSearchFacetSelected(null, chosen, '東京都'), false);
  assert.deepEqual(chosen, { prefecture: '東京都', employmentType: '正社員' });
});
