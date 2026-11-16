import assert from 'node:assert/strict';
import test from 'node:test';
import { canPublishApplicationDocumentHandoff, canOpenAttachedApplicationDocumentUrl } from '../src/lib/focusedApplicationDocumentsRefresh.ts';
import { boundedPrivateRead } from '../src/lib/privateReadDeadline.ts';

const live = Object.freeze({ open: true, focused: true, foreground: true, privateAccess: true, ownerCurrent: true, mutationPending: true, presentationUnchanged: true });

test('canonical document handoff and signed URL require a current live lease', () => {
  assert.equal(canPublishApplicationDocumentHandoff(live, true), true);
  assert.equal(canOpenAttachedApplicationDocumentUrl(live, true), true);
  assert.equal(canPublishApplicationDocumentHandoff(live, false), false);
  assert.equal(canOpenAttachedApplicationDocumentUrl(live, false), false);
});

test('blur, background, lock, account change, close and mutation end each revoke handoff', () => {
  for (const field of ['focused', 'foreground', 'privateAccess', 'ownerCurrent', 'open', 'mutationPending', 'presentationUnchanged']) {
    assert.equal(canPublishApplicationDocumentHandoff({ ...live, [field]: false }, true), false, field);
    assert.equal(canOpenAttachedApplicationDocumentUrl({ ...live, [field]: false }, true), false, field);
  }
});

test('rapid refocus and foreground return do not resurrect old signed URLs', () => {
  assert.equal(canOpenAttachedApplicationDocumentUrl({ ...live, presentationUnchanged: false }, true), false);
});

test('concurrent requirements and documents must both settle within deadline', async () => {
  const result = await boundedPrivateRead(() => Promise.all([Promise.resolve('requirements'), Promise.resolve('vault')]), 100);
  assert.deepEqual(result, ['requirements', 'vault']);
  await assert.rejects(boundedPrivateRead(() => Promise.all([Promise.resolve('requirements'), new Promise(() => {})]), 8), /タイムアウト/);
});

test('timed-out canonical reads cannot later grant application submission', async () => {
  let resolveRead;
  const late = new Promise(resolve => { resolveRead = resolve; });
  const checking = boundedPrivateRead(() => late, 8);
  await assert.rejects(checking, /タイムアウト/);
  resolveRead('late-ready');
  await Promise.resolve();
  await assert.rejects(checking, /タイムアウト/);
});

test('authorization exceptions remain errors under bounded reads', async () => {
  await assert.rejects(boundedPrivateRead(() => Promise.reject(new Error('OWNER_REVOKED')), 100), /OWNER_REVOKED/);
});
