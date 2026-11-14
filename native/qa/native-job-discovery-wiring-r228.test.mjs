import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const screen = readFileSync(new URL('../src/app/(tabs)/jobs.tsx', import.meta.url), 'utf8');
test('facets and search/bookmark reads both use a bounded candidate-private read', () => {
  assert.match(screen, /import \{ readCandidateJobDiscoveryBounded \} from/);
  assert.equal((screen.match(/await readCandidateJobDiscoveryBounded\(\{/g) ?? []).length, 2);
  assert.match(screen, /read: \(pinned\) => getJobSearchFacets\(pinned\.client\)/);
  assert.match(screen, /searchJobseekerJobs\(pinned\.client/);
  assert.match(screen, /reset \? listSavedJobIds\(pinned\.client\)/);
});
test('both reads fence session, latest generation and privacy state', () => {
  assert.match(screen, /current === facetGeneration\.current && ownerKey === latestOwnerRef\.current/);
  assert.match(screen, /currentGeneration === generation\.current && ownerKey === latestOwnerRef\.current/);
  assert.ok((screen.match(/latestPrivateState\.current\.allowed && !latestPrivateState\.current\.shieldVisible/g) ?? []).length >= 2);
  assert.equal((screen.match(/ownsPin: \(pinned\) => candidateViewOwnerKey\(pinned\.ownerId, pinned\.ownerSessionId\) === ownerKey/g) ?? []).length, 2);
});
test('failed canonical results keep distinct initial and pagination retry channels', () => {
  assert.match(screen, /jobSearchFailureChannel\(\{/);
  assert.match(screen, /channel === 'pagination'/);
  assert.match(screen, /channel === 'initial'/);
  assert.match(screen, /testID="job-pagination-retry"/);
  assert.match(screen, /testID="job-search-retry"/);
});
