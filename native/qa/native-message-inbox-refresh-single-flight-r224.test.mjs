import test from 'node:test';
import assert from 'node:assert/strict';
import { canStartMessageInboxRefresh } from '../src/lib/messageInboxRefreshPolicy.ts';

const idle = { refreshPending: false, threadOpenPending: false, secondaryNavigationPending: false };

test('new candidate-private inbox read is allowed only with no pending work', () => {
  assert.equal(canStartMessageInboxRefresh(idle), true);
  for (const condition of [
    { refreshPending: true },
    { threadOpenPending: true },
    { secondaryNavigationPending: true },
    { refreshPending: true, threadOpenPending: true },
  ]) {
    assert.equal(canStartMessageInboxRefresh({ ...idle, ...condition }), false);
  }
});

test('two synchronous refresh taps launch at most one read, and settle permits deliberate retry', () => {
  const refs = { ...idle };
  let canonicalReads = 0;
  function startRefresh() {
    if (!canStartMessageInboxRefresh(refs)) return false;
    refs.refreshPending = true; // same synchronous order as the real screen
    canonicalReads += 1;
    return true;
  }
  assert.equal(startRefresh(), true);
  assert.equal(startRefresh(), false);
  assert.equal(canonicalReads, 1);
  refs.refreshPending = false;
  assert.equal(startRefresh(), true);
  assert.equal(canonicalReads, 2);
});

test('queued route transitions cannot overlap a refresh even if UI has not rendered disabled', () => {
  const refs = { ...idle, secondaryNavigationPending: true };
  assert.equal(canStartMessageInboxRefresh(refs), false);
  refs.secondaryNavigationPending = false;
  refs.threadOpenPending = true;
  assert.equal(canStartMessageInboxRefresh(refs), false);
  refs.threadOpenPending = false;
  assert.equal(canStartMessageInboxRefresh(refs), true);
});
