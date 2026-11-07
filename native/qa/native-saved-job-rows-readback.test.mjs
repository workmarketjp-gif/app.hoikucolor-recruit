import assert from 'node:assert/strict';
import test from 'node:test';
import { verifiedSavedJobRows } from '../src/lib/savedJobRowsReadback.ts';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const row = (patch = {}) => ({
  id: A, facility_id: B, title: '合成求人', facility_name: '合成保育園',
  is_open: false, salary_note: '掲載時の条件', ...patch,
});

test('genuine no-saves and canonical closed-job rows retain exact state', () => {
  assert.deepEqual(verifiedSavedJobRows([]), []);
  const closed = row();
  assert.equal(verifiedSavedJobRows([closed])[0], closed);
  assert.equal(verifiedSavedJobRows([row({ is_open: true })])[0].is_open, true);
});

test('failed/invalid RPC envelopes cannot become empty favorites', () => {
  for (const response of [null, undefined, {}, false, '[]', [null], [1]]) {
    assert.throws(() => verifiedSavedJobRows(response), /気になる求人を確認できませんでした/);
  }
});

test('saved job ID/title/facility/open-state must be canonical', () => {
  for (const patch of [
    { id: 'invalid' }, { facility_id: null }, { title: '' },
    { title: null }, { facility_name: ' ' }, { is_open: null },
    { is_open: 'false' }, { is_open: 0 },
  ]) assert.throws(() => verifiedSavedJobRows([row(patch)]), /気になる求人を確認できませんでした/);
});

test('duplicate saved IDs are not double-counted or sent to comparison', () => {
  for (const duplicate of [row(), row({ id: A.toUpperCase() })]) {
    assert.throws(() => verifiedSavedJobRows([row(), duplicate]), /気になる求人を確認できませんでした/);
  }
});
