import assert from 'node:assert/strict';
import test from 'node:test';
import { safeJobDetailErrorMessage } from '../src/lib/jobDetailErrorPresentation.ts';

const pii = 'candidate=CLERK_PRIVATE_PERSON storage=private/applications/uuid.pdf bearer=secret';

test('failed canonical detail load reports safe Japanese retry, never raw backend message', () => {
  const text = safeJobDetailErrorMessage('load', new Error(pii));
  assert.match(text, /求人情報を取得できませんでした/);
  assert.match(text, /再読み込み/);
  assert.ok(!text.includes(pii));
});
test('pre-submit failure gives truthful no-application-dispatched feedback', () => {
  const text = safeJobDetailErrorMessage('pre_submit', { message: pii, code: 'PGRST301' });
  assert.match(text, /応募は送信していません/);
  assert.ok(!text.includes('PGRST301'));
  assert.ok(!text.includes(pii));
});
test('never stringifies cyclic or hostile exception objects or reads thrown getters', () => {
  const obj = { }; obj.self = obj;
  Object.defineProperty(obj, 'message', { get() { throw new Error('MUST NOT READ'); } });
  assert.doesNotThrow(() => safeJobDetailErrorMessage('load', obj));
  assert.doesNotThrow(() => safeJobDetailErrorMessage('pre_submit', obj));
});
test('null, primitive, and leaked signed links never enter user-visible text', () => {
  for (const cause of [null, undefined, 404, pii, 'https://storage.example/private?token=PRIVATE']) {
    for (const stage of ['load', 'pre_submit']) {
      const shown = safeJobDetailErrorMessage(stage, cause);
      assert.ok(!shown.includes('PRIVATE'));
      assert.ok(!shown.includes('storage.example'));
      assert.ok(!shown.includes('CLERK_PRIVATE_PERSON'));
    }
  }
});
