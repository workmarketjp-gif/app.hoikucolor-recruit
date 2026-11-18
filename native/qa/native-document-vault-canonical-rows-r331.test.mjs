import assert from 'node:assert/strict';
import test from 'node:test';
import { requireCanonicalDocumentRows } from '../src/lib/canonicalDocumentRows.ts';

const labels = ['保存済み書類', '提出済み応募書類', '応募時の必要書類'];
for (const label of labels) {
  test(`${label}: successful empty array is authoritative`, () => {
    const result = requireCanonicalDocumentRows([], label);
    assert.deepEqual(result, []);
  });
  test(`${label}: nonempty array preserves canonical result identity`, () => {
    const canonical = [{ id: `synthetic-${label}` }];
    assert.equal(requireCanonicalDocumentRows(canonical, label), canonical);
  });
  test(`${label}: null response does not fabricate an empty list`, () => {
    assert.throws(() => requireCanonicalDocumentRows(null, label), /取得結果を確認できませんでした/);
  });
  test(`${label}: missing or malformed body fails closed`, () => {
    for (const value of [undefined, {}, { data: [] }, '', '[]', 0, false]) {
      assert.throws(() => requireCanonicalDocumentRows(value, label), /もう一度読み込んでください/);
    }
  });
}

test('a failed read produces a fixed Japanese error with no raw server or candidate payload', () => {
  const injected = { id: 'private-candidate-token', error: 'secret' };
  let message = '';
  try { requireCanonicalDocumentRows(injected, '保存済み書類'); } catch (error) { message = error.message; }
  assert.ok(message.includes('保存済み書類'));
  assert.equal(message.includes('private-candidate-token'), false);
  assert.equal(message.includes('secret'), false);
});
