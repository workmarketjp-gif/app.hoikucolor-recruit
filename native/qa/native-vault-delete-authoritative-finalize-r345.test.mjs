import test from 'node:test';
import assert from 'node:assert/strict';
import { confirmJobseekerVaultDeletion } from '../src/lib/confirmJobseekerVaultDeletion.ts';

const check = (change = {}) => confirmJobseekerVaultDeletion({
  storageRemoveError: null, finalizeError: null, finalized: true, ...change,
});

test('Storage positive acknowledgement plus RPC true permits success', () => {
  assert.equal(check(), undefined);
});
test('Storage response lost but server finalize true permits success', () => {
  assert.equal(check({ storageRemoveError: { status: 500 } }), undefined);
});
test('Storage permission error with server-authoritative finalize true permits success', () => {
  assert.equal(check({ storageRemoveError: { status: 403, message: 'denied' } }), undefined);
});
test('Storage response error and finalize true must match Web precedence, not r344 patch', () => {
  assert.equal(check({ storageRemoveError: new Error('network response lost'), finalized: true }), undefined);
});
test('Malformed Storage error does not override confirmed server absence', () => {
  assert.equal(check({ storageRemoveError: {}, finalized: true }), undefined);
});
test('Storage failure and finalize false must not claim deleted or suggest blind retry', () => {
  assert.throws(() => check({ storageRemoveError: { status: 403 }, finalized: false }), e =>
    e.message.includes('再読み込み') && !e.message.includes('一覧に残る') && !e.message.includes('再度削除'));
});
test('Storage failure and RPC transport error remains uncertain', () => {
  assert.throws(() => check({ storageRemoveError: new Error('storage'), finalizeError: new Error('rpc timeout'), finalized: null }), /結果を確認できませんでした/);
});
test('Storage success and RPC error preserves actual failure', () => {
  const e = new Error('synthetic RPC failure');
  assert.throws(() => check({ finalizeError: e, finalized: false }), caught => caught === e);
});
test('RPC error with spurious true must never be counted as success', () => {
  const e = new Error('RPC ambiguous');
  assert.throws(() => check({ finalizeError: e, finalized: true }), caught => caught === e);
});
test('Storage success with no true finalize remains uncertain', () => {
  for (const finalized of [false, null, undefined, 0, 1, 'true', {}, []]) {
    assert.throws(() => check({ finalized }), /再読み込み/);
  }
});
test('No finalize response with Storage error is not a confirmed deletion', () => {
  assert.throws(() => check({ finalized: undefined, storageRemoveError: new Error('unauthorized') }), /結果を確認できませんでした/);
});
test('No client-only Storage signed URL probe can substitute for server finalize', () => {
  assert.throws(() => check({ finalized: null, storageRemoveError: null }), /削除を完了できませんでした/);
});
