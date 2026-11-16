import assert from 'node:assert/strict';
import test from 'node:test';
import { presentApplicationDocumentError } from '../src/lib/applicationDocumentErrorPresentation.ts';

const samples = [
  new Error('supabase RPC: candidate=user_123, application=abc'),
  { message: 'https://signed.example.invalid/private/doc.pdf?token=verysecret', code: '403' },
  { storage_path: 'candidates/private/candidate-A/resume.pdf', owner_id: 'candidate-A' },
  'Authorization: Bearer confidential_token',
  null,
];

for (const operation of ['refresh', 'open']) {
  test(`${operation}: private error details never appear in the candidate screen`, () => {
    for (const cause of samples) {
      const result = presentApplicationDocumentError(operation, cause);
      assert.equal(typeof result, 'string');
      assert.ok(result.length > 0);
      assert.doesNotMatch(result, /user_123|candidate-A|private\/|signed\.example|token=|Bearer|verysecret|supabase|403|abc/);
      assert.match(result, operation === 'open' ? /開けませんでした/ : /読み込めませんでした/);
      assert.match(result, /もう一度お試しください/);
    }
  });
}

test('refresh and open errors remain action-specific and do not claim readback success', () => {
  assert.notEqual(presentApplicationDocumentError('refresh', {}), presentApplicationDocumentError('open', {}));
  assert.doesNotMatch(presentApplicationDocumentError('refresh', {}), /保存しました|提出しました|読み込み完了/);
});
