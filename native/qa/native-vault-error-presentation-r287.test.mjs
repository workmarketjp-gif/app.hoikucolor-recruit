import assert from 'node:assert/strict';
import test from 'node:test';
import { presentDocumentVaultError } from '../src/lib/documentVaultErrorPresentation.ts';

const operations = ['read', 'prepare', 'upload', 'camera', 'open', 'default', 'delete'];
const privateCauses = [
  new Error('owner=user_PII, document_id=doc_private_ABC, path=candidates/u/private.pdf'),
  { message: 'https://signed.example.invalid/vault/123?token=secret' },
  'Authorization: Bearer leaked_credential',
  { toString() { throw new Error('must never call untrusted toString'); } },
  null,
];

for (const operation of operations) {
  test(`${operation}: private paths, signed links and identifiers stay out of alerts`, () => {
    for (const cause of privateCauses) {
      const message = presentDocumentVaultError(operation, cause);
      assert.ok(message.length > 0);
      assert.doesNotMatch(message, /user_PII|doc_private_ABC|candidates\/|signed\.example|token=|Bearer|leaked_credential/);
      assert.doesNotMatch(message, /保存しました|削除しました|アップロード完了/);
    }
  });
}

test('explicit client file-type and 10MB validations remain actionable during uploads', () => {
  const messages = [
    'PDF、JPEG、PNGのみ保存できます。',
    '書類は10MB以下のファイルを選択してください。',
    'ファイル内容と形式が一致しません。PDF、JPEG、PNGを選択してください。',
  ];
  for (const operation of ['prepare', 'upload', 'camera']) {
    for (const message of messages) assert.equal(presentDocumentVaultError(operation, new Error(message)), message);
  }
});

test('similar but augmented server text is not allowlisted', () => {
  const dangerous = '書類は10MB以下のファイルを選択してください。 private_owner=candidate-123';
  assert.doesNotMatch(presentDocumentVaultError('upload', new Error(dangerous)), /candidate-123/);
  assert.doesNotMatch(presentDocumentVaultError('camera', { message: dangerous }), /candidate-123/);
});

test('read/open/delete operation errors never disclose even known validation text', () => {
  for (const operation of ['read', 'open', 'default', 'delete']) {
    assert.notEqual(presentDocumentVaultError(operation, new Error('PDF、JPEG、PNGのみ保存できます。')), 'PDF、JPEG、PNGのみ保存できます。');
  }
});
