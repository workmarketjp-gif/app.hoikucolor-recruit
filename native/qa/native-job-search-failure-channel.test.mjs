import test from 'node:test';
import assert from 'node:assert/strict';
import { jobSearchFailureChannel } from '../src/lib/jobSearchFailureChannel.ts';

const attempt = (part = {}) => ({
  reset: false, owner: 'candidateA:session1', requestedOwner: 'candidateA:session1',
  requestGeneration: 4, currentGeneration: 4, privateAllowed: true,
  hasConfirmedResults: true, hasConfirmedBookmarks: true, ...part,
});

test('pagination RPC failure stays in a retryable page-error channel', () => {
  assert.equal(jobSearchFailureChannel(attempt()), 'pagination');
});
test('a first or changed-filter search failure is not disguised as a page error', () => {
  for (const patch of [{ reset: true }, { hasConfirmedResults: false }, { hasConfirmedBookmarks: false }]) {
    assert.equal(jobSearchFailureChannel(attempt(patch)), 'initial');
  }
});
test('stale, different owner, signed-out or locked page errors are discarded', () => {
  for (const patch of [
    { currentGeneration: 5 }, { requestedOwner: 'candidateB:session2' },
    { owner: null }, { privateAllowed: false },
  ]) assert.equal(jobSearchFailureChannel(attempt(patch)), null);
});
