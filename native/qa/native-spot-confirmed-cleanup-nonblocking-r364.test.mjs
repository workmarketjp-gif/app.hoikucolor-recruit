import assert from 'node:assert/strict';
import test from 'node:test';
import { navigateAfterConfirmedSpotSubmission } from '../src/lib/spotConfirmedApplication.ts';

const pendingForever = () => new Promise(() => {});

test('confirmed submission navigates immediately even when SecureStore cleanup never resolves', () => {
  let navigated = 0;
  let cleared = 0;
  navigateAfterConfirmedSpotSubmission({
    isCurrent: () => true,
    clearPending: () => { cleared++; return pendingForever(); },
    navigate: () => { navigated++; },
  });
  assert.equal(cleared, 1);
  assert.equal(navigated, 1);
});

test('rejected cleanup cannot unconfirm a candidate-owned application', async () => {
  let navigated = 0;
  navigateAfterConfirmedSpotSubmission({
    isCurrent: () => true,
    clearPending: () => Promise.reject(new Error('storage unavailable')),
    navigate: () => { navigated++; },
  });
  await Promise.resolve();
  assert.equal(navigated, 1);
});

test('a changed account before cleanup neither clears nor navigates', () => {
  let cleared = 0;
  let navigated = 0;
  navigateAfterConfirmedSpotSubmission({
    isCurrent: () => false,
    clearPending: async () => { cleared++; },
    navigate: () => { navigated++; },
  });
  assert.equal(cleared, 0);
  assert.equal(navigated, 0);
});

test('session loss during cleanup start prevents navigation to old candidate detail', () => {
  let current = true;
  let navigated = 0;
  navigateAfterConfirmedSpotSubmission({
    isCurrent: () => current,
    clearPending: async () => { current = false; },
    navigate: () => { navigated++; },
  });
  assert.equal(navigated, 0);
});

test('synchronous cleanup failure still permits canonical confirmation navigation', () => {
  let navigated = 0;
  navigateAfterConfirmedSpotSubmission({
    isCurrent: () => true,
    clearPending: () => { throw new Error('SecureStore unavailable'); },
    navigate: () => { navigated++; },
  });
  assert.equal(navigated, 1);
});
