import assert from 'node:assert/strict';
import test from 'node:test';
import { requireApplicationScopedDocumentRows } from '../src/lib/canonicalDocumentRows.ts';

const appA = 'synthetic-application-a';
const appB = 'synthetic-application-b';
const labels = ['応募時の必要書類', '提出済み応募書類'];

for (const label of labels) {
  test(`${label}: verified empty list remains empty for a valid application`, () => {
    assert.deepEqual(requireApplicationScopedDocumentRows([], appA, label), []);
  });
  test(`${label}: verified application rows retain original array identity`, () => {
    const rows = [{ id: 'synthetic-document', application_id: appA }];
    assert.equal(requireApplicationScopedDocumentRows(rows, appA, label), rows);
  });
  test(`${label}: a cross-application row quarantines the entire response`, () => {
    const rows = [{ id: 'safe', application_id: appA }, { id: 'private-candidate-b', application_id: appB }];
    assert.throws(() => requireApplicationScopedDocumentRows(rows, appA, label), (error) => {
      assert.match(error.message, /応募先を確認できませんでした/);
      assert.equal(error.message.includes(appB), false);
      assert.equal(error.message.includes('private-candidate-b'), false);
      return true;
    });
  });
  test(`${label}: malformed rows do not masquerade as scoped data`, () => {
    for (const rows of [[null], [undefined], [1], ['entry'], [{}], [{ application_id: null }]]) {
      assert.throws(() => requireApplicationScopedDocumentRows(rows, appA, label));
    }
  });
  test(`${label}: missing scope cannot authorize an otherwise valid empty result`, () => {
    for (const scope of ['', '  ', null, undefined]) {
      assert.throws(() => requireApplicationScopedDocumentRows([], scope, label), /応募先を確認できませんでした/);
    }
  });
  test(`${label}: a null transport body is not an empty collection`, () => {
    assert.throws(() => requireApplicationScopedDocumentRows(null, appA, label), /取得結果を確認できませんでした/);
  });
}
