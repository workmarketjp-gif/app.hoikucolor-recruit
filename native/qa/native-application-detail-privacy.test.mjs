import assert from 'node:assert/strict';
import test from 'node:test';
import { candidateApplicationDetailKey } from '../src/lib/applicationDetailVisibility.ts';

const app1 = 'a0a0a0a0-0000-4000-8000-000000000001';
const app2 = 'a0a0a0a0-0000-4000-8000-000000000002';
const candidateA = '["candidate-a","session-1"]';
const candidateB = '["candidate-b","session-1"]';
const candidateANewSession = '["candidate-a","session-2"]';

test('same candidate, session, and application retain only the same detail instance', () => {
  assert.equal(candidateApplicationDetailKey(candidateA, app1, true), candidateApplicationDetailKey(candidateA, app1, true));
});
test('switching applications remounts the private detail and message/offer drafts', () => {
  assert.notEqual(candidateApplicationDetailKey(candidateA, app1, true), candidateApplicationDetailKey(candidateA, app2, true));
});
test('switching candidate account remounts rather than reusing private detail', () => {
  assert.notEqual(candidateApplicationDetailKey(candidateA, app1, true), candidateApplicationDetailKey(candidateB, app1, true));
});
test('a new session of the same candidate cannot reuse previous detail state', () => {
  assert.notEqual(candidateApplicationDetailKey(candidateA, app1, true), candidateApplicationDetailKey(candidateANewSession, app1, true));
});
test('App Lock or inactive foreground returns no private route instance', () => {
  assert.equal(candidateApplicationDetailKey(candidateA, app1, false), null);
});
test('signed-out or missing session returns no route instance', () => {
  assert.equal(candidateApplicationDetailKey(null, app1, true), null);
});
test('invalid application route cannot mount details', () => {
  for (const id of ['', 'not-an-application', 'a0a0a0a0-0000-4000-8000-000000000001/../../x', undefined]) {
    assert.equal(candidateApplicationDetailKey(candidateA, id, true), null);
  }
});
test('Expo Router array route takes only its first validated segment', () => {
  assert.equal(candidateApplicationDetailKey(candidateA, [app1, app2], true), candidateApplicationDetailKey(candidateA, app1, true));
  assert.equal(candidateApplicationDetailKey(candidateA, ['invalid', app1], true), null);
});
test('UUID casing does not create a duplicate private route instance', () => {
  assert.equal(candidateApplicationDetailKey(candidateA, app1.toUpperCase(), true), candidateApplicationDetailKey(candidateA, app1, true));
});
test('different serialized identities must not collide even with separator characters', () => {
  assert.notEqual(candidateApplicationDetailKey('["a:b","c"]', app1, true), candidateApplicationDetailKey('["a","b:c"]', app1, true));
});
