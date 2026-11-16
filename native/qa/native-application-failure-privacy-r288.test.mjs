import test from 'node:test';
import assert from 'node:assert/strict';
import { presentApplicationFailure } from '../src/lib/applicationFailurePresentation.ts';

const known = {
  'detail-read': /応募情報を読み込めませんでした。.*再読み込み/,
  'interview-response': /面接への回答結果を確認できませんでした。.*重複送信/,
  decision: /応募に関する操作結果を確認できませんでした。.*操作を繰り返さず/,
};
const secrets = [
  'candidate-123456',
  'Bearer secret-session',
  'https://storage.example.com/private/qa.pdf?token=signed-abc',
  '/user/hidden/applicant/cv.pdf',
];

for (const [operation, expected] of Object.entries(known)) {
  test(`${operation}: preserve a concrete Japanese recovery instruction`, () => {
    assert.match(presentApplicationFailure(operation, new Error('offline')), expected);
  });
  test(`${operation}: redact raw transport, private storage and identity content`, () => {
    for (const secret of secrets) {
      const output = presentApplicationFailure(operation, new Error(`RPC denied ${secret}`));
      assert.doesNotMatch(output, /candidate-123456|Bearer|signed-abc|storage\.example\.com|hidden\/applicant/);
      assert.equal(output, presentApplicationFailure(operation, null));
    }
  });
  test(`${operation}: never invoke a user-controlled toString`, () => {
    let invoked = false;
    const untrusted = { toString() { invoked = true; throw Error('private'); }, message: secrets[0] };
    assert.match(presentApplicationFailure(operation, untrusted), expected);
    assert.equal(invoked, false);
  });
}

test('mutation result ambiguity never advises blind resubmission or claims failure', () => {
  for (const operation of ['interview-response', 'decision']) {
    const output = presentApplicationFailure(operation, { detail: 'transport failed after response' });
    assert.match(output, /結果を確認できませんでした/);
    assert.match(output, /再読み込み/);
    assert.doesNotMatch(output, /送信できませんでした|もう一度送信/);
  }
});
