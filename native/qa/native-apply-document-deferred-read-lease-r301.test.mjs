import assert from 'node:assert/strict';
import test from 'node:test';
import { boundedPrivateRead } from '../src/lib/privateReadDeadline.ts';
import { withCurrentApplyDocumentReadLease } from '../src/lib/applyDocumentReadLease.ts';

test('expired session at invocation never launches a private read', async () => {
  let launched = 0;
  await assert.rejects(withCurrentApplyDocumentReadLease(() => false, async () => { launched++; }), /閲覧状態/);
  assert.equal(launched, 0);
});

test('owner switch between bounded request and deferred RPC blocks the read', async () => {
  let current = true;
  let launched = 0;
  const result = boundedPrivateRead(() => withCurrentApplyDocumentReadLease(
    () => current,
    async () => { launched++; return ['document']; },
  ), 100);
  current = false;
  await assert.rejects(result, /閲覧状態/);
  assert.equal(launched, 0);
});

test('revocation at the additional deferred checkpoint blocks the RPC', async () => {
  let current = true;
  let launched = 0;
  const result = withCurrentApplyDocumentReadLease(() => current, async () => { launched++; });
  current = false;
  await assert.rejects(result, /閲覧状態/);
  assert.equal(launched, 0);
});

test('current lease starts the canonical read once and preserves returned data', async () => {
  let launched = 0;
  const result = await boundedPrivateRead(() => withCurrentApplyDocumentReadLease(
    () => true,
    async () => { launched++; return ['requirements', 'vault']; },
  ), 100);
  assert.deepEqual(result, ['requirements', 'vault']);
  assert.equal(launched, 1);
});

test('an actual authorization error propagates without retries', async () => {
  let launched = 0;
  await assert.rejects(withCurrentApplyDocumentReadLease(() => true, async () => {
    launched++;
    throw new Error('OWNER_REVOKED');
  }), /OWNER_REVOKED/);
  assert.equal(launched, 1);
});

test('suspended canonical read remains subject to the existing deadline', async () => {
  let launched = 0;
  await assert.rejects(boundedPrivateRead(() => withCurrentApplyDocumentReadLease(
    () => true, () => { launched++; return new Promise(() => {}); },
  ), 8), /タイムアウト/);
  assert.equal(launched, 1);
});
