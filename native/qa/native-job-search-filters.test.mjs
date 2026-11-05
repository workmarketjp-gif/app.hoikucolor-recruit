import test from 'node:test';
import assert from 'node:assert/strict';
import { createJobSearchQuery, hasActiveJobFilters, EMPTY_JOB_SEARCH_FILTERS } from '../src/lib/jobSearchFilterCriteria.ts';

test('matches Web neutral search without inventing any filters', () => {
  assert.deepEqual(createJobSearchQuery('  ', EMPTY_JOB_SEARCH_FILTERS), {
    keyword: '', prefecture: '', employmentType: '', hoVerifiedOnly: false, hfVerifiedOnly: false,
  });
  assert.equal(hasActiveJobFilters('', EMPTY_JOB_SEARCH_FILTERS), false);
});

test('forwards authoritative prefecture/employment selections and verification switches', () => {
  const filters = {prefecture:'東京都',employmentType:'正社員',hoVerifiedOnly:true,hfVerifiedOnly:false};
  assert.deepEqual(createJobSearchQuery(' 保育士 ', filters), {
    keyword:'保育士',prefecture:'東京都',employmentType:'正社員',hoVerifiedOnly:true,hfVerifiedOnly:false,
  });
  assert.equal(hasActiveJobFilters('', filters), true);
});

test('maintains distinct official workplace and finance evidence switches', () => {
  const filters = {...EMPTY_JOB_SEARCH_FILTERS,hfVerifiedOnly:true};
  assert.equal(createJobSearchQuery('', filters).hoVerifiedOnly, false);
  assert.equal(createJobSearchQuery('', filters).hfVerifiedOnly, true);
});

test('keyword alone counts as an active search filter', () => {
  assert.equal(hasActiveJobFilters('  保育  ', EMPTY_JOB_SEARCH_FILTERS), true);
});
