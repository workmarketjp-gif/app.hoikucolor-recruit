import test from 'node:test';
import assert from 'node:assert/strict';
import { canOpenScoutsWithoutVerifiedMessageIndex } from '../src/lib/messageInboxRefreshPolicy.ts';

const pending = {
  candidateOwnerKey: '["candidate-a","clerk-session-a"]',
  privateAccessAllowed: true,
  verifiedMessageIndexPresent: false,
  threadOpenPending: false,
  secondaryNavigationPending: false,
};

test('Web scout destination remains available while the required message index is loading', () => {
  assert.equal(canOpenScoutsWithoutVerifiedMessageIndex(pending), true);
  // A failed first read has the same unverified state. Only the destination
  // may launch its own newly pinned authorization; no thread is opened.
  assert.equal(canOpenScoutsWithoutVerifiedMessageIndex({ ...pending }), true);
});

test('private-session invalidation denies opening Scouts from the inbox', () => {
  for (const invalid of [
    { candidateOwnerKey: null },
    { candidateOwnerKey: '' },
    { privateAccessAllowed: false },
    { threadOpenPending: true },
    { secondaryNavigationPending: true },
  ]) {
    assert.equal(canOpenScoutsWithoutVerifiedMessageIndex({ ...pending, ...invalid }), false);
  }
});

test('a current verified application list uses the existing direct navigation gate', () => {
  assert.equal(canOpenScoutsWithoutVerifiedMessageIndex({ ...pending, verifiedMessageIndexPresent: true }), false);
});
