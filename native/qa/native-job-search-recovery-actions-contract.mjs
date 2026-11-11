// Approved Web vs Native job-search recovery controls.
// Static contract on actual source, not Android/iOS rendering or a live RPC test.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const web = readFileSync(new URL('../../src/App.tsx', import.meta.url), 'utf8');
const native = readFileSync(new URL('../src/app/(tabs)/jobs.tsx', import.meta.url), 'utf8');

// Web shows an explicit retry on search failure and an inline clear-filter
// action when a successful empty search was caused by active filters.
assert.match(web, /status === 'error' && <InlineError[^>]*onRetry=/);
assert.match(web, /status === 'success' && !jobs\.length && <EmptyState/);
assert.ok(web.includes("action={hasFilters ? '条件をクリア' : undefined}"));

const failureStart = native.indexOf('{error ? (');
const failureEnd = native.indexOf('{loading && jobs.length === 0', failureStart);
assert.ok(failureStart >= 0 && failureEnd > failureStart, 'Native search failure panel');
const failure = native.slice(failureStart, failureEnd);
for (const snippet of [
  'testID="job-search-error-state"',
  'accessibilityRole="alert"',
  'testID="job-search-retry"',
  'accessibilityLabel="求人検索を再試行"',
  'disabled={loading}',
  'cancelKeywordTimer(); void load(true, query, filters);',
  '>再試行</Text>',
]) assert.ok(failure.includes(snippet), 'Missing failure recovery: ' + snippet);

const emptyStart = native.indexOf('!loading && !error && visibleJobs !== null && jobs.length === 0 ? (');
const emptyEnd = native.indexOf('{jobs.map(', emptyStart);
assert.ok(emptyStart >= 0 && emptyEnd > emptyStart, 'Successful empty-state boundary');
const empty = native.slice(emptyStart, emptyEnd);
for (const snippet of [
  'testID="job-search-empty-state"',
  '条件に合う求人はありません',
  'hasActiveJobFilters(query, filters) ? (',
  'testID="job-search-empty-clear"',
  'accessibilityLabel="条件をクリア"',
  'onPress={clearFilters}',
]) assert.ok(empty.includes(snippet), 'Missing empty recovery: ' + snippet);

// Recoveries keep the approved filters, canonical search RPC and error channel;
// they do not claim an empty result when a request failed.
assert.ok(native.includes('createJobSearchQuery(requestedQuery, requestedFilters)'));
assert.ok(native.includes('searchJobseekerJobs(pinned.client, {'));
assert.ok(native.includes("if (channel === 'pagination'"));
assert.ok(native.includes("else if (channel === 'initial'"));
console.log('PASS Native job search retry / empty filter CTA Web-parity source contract');
