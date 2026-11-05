import assert from 'node:assert/strict';
import test from 'node:test';
import { careerMutationNotice } from '../src/lib/careerMutationNotice.ts';

test('save confirmation reflects the submitted and still-visible salary', () => {
  assert.match(careerMutationNotice('salary', 4, 4), /保存しました/);
});
test('changed salary cannot be reported as saved after the older request succeeds', () => {
  const notice = careerMutationNotice('salary', 4, 5);
  assert.match(notice, /未保存/);
  assert.doesNotMatch(notice, /保存しました/);
});
test('complete conditions save only confirms an unchanged draft', () => {
  assert.match(careerMutationNotice('conditions', 7, 7), /保存しました/);
  assert.match(careerMutationNotice('conditions', 7, 8), /未保存/);
});
test('deletion confirms the cleared draft if no edits occurred', () => {
  assert.match(careerMutationNotice('delete', 3, 3), /削除しました/);
});
test('late deletion preserves the newer unsaved draft, not a false saved state', () => {
  const notice = careerMutationNotice('delete', 3, 4);
  assert.match(notice, /削除されました/);
  assert.match(notice, /未保存/);
  assert.doesNotMatch(notice, /削除しました/);
});
