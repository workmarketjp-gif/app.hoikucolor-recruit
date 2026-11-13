import test from 'node:test';
import assert from 'node:assert/strict';
import { presentMessageInboxReadFailure } from '../src/lib/messageInboxFailurePresentation.ts';

// Synthetic error content only. The real backend and candidate APIs are not called.
test('candidate-private inbox read failure uses a stable, recoverable Japanese message', () => {
  assert.equal(presentMessageInboxReadFailure(new Error('offline')),
    '応募先とのやりとりを取得できませんでした。通信状態を確認して再読み込みしてください。');
});

test('Clerk user, tokens, database detail and private identifiers are never echoed', () => {
  const secrets = ['user_synthetic_123', 'token_synthetic_abcdef',
    'rpc_internal_storage_object', 'candidate_private_document_abc'];
  const inputs = [new Error(secrets.join(' ')), { message: secrets.join(' '), code: '42501' },
    secrets.join(' '), undefined, null, Symbol('private')];
  for (const value of inputs) {
    const shown = presentMessageInboxReadFailure(value);
    for (const secret of secrets) assert.equal(shown.includes(secret), false);
  }
});

test('malicious exception with a throwing message getter is never dereferenced', () => {
  const hostile = Object.create(null, {
    message: { get() { throw Error('should not inspect untrusted error'); } },
  });
  assert.doesNotThrow(() => presentMessageInboxReadFailure(hostile));
});
