import test from 'node:test';
import assert from 'node:assert/strict';
import { applicationDocumentActionAccessibilityLabel } from '../src/lib/applicationDocumentActionAccessibilityLabel.ts';

test('r322: submit button identifies the right private document, not just a generic action', () => {
  assert.equal(applicationDocumentActionAccessibilityLabel('submit', '保育士証', '保育士証 2026'), '保育士証「保育士証 2026」をこの応募に提出');
});

test('r322: already-submitted action is announced as a state, not another submit', () => {
  assert.equal(applicationDocumentActionAccessibilityLabel('submitted', '履歴書', '最新'), '履歴書「最新」は提出済み');
});

test('r322: open action identifies the document and does not suggest a resubmission', () => {
  assert.equal(applicationDocumentActionAccessibilityLabel('open', '職務経歴書', '2026年度'), '職務経歴書「2026年度」を開く');
});

test('r322: titles with line breaks are spoken as a single button label', () => {
  assert.equal(applicationDocumentActionAccessibilityLabel('open', '履歴書', '山田\n太郎\t版'), '履歴書「山田 太郎 版」を開く');
});

test('r322: blank title falls back to known document type without empty quote', () => {
  assert.equal(applicationDocumentActionAccessibilityLabel('submit', '資格証', '  '), '資格証をこの応募に提出');
});

test('r322: unexpected blank document type still has a meaningful accessible name', () => {
  assert.equal(applicationDocumentActionAccessibilityLabel('open', '', ''), '応募書類を開く');
});

test('r322: does not substitute any candidate identity, facility name, or destination ID', () => {
  const label = applicationDocumentActionAccessibilityLabel('submit', '履歴書', '自作');
  assert.equal(label, '履歴書「自作」をこの応募に提出');
  assert.doesNotMatch(label, /owner|application|clerk|facility/i);
});
