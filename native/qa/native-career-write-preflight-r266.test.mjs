import test from 'node:test';
import assert from 'node:assert/strict';
import { beginCareerWrite, finishCareerWrite } from '../src/lib/careerWriteFlight.ts';
import { careerMutationFailure } from '../src/lib/careerMutationRecovery.ts';
import { mayPresentCareerReadFailure } from '../src/lib/careerReadPreflight.ts';

const owner = '["candidate-a","session-1"]';
const nextSession = '["candidate-a","session-2"]';

for (const operation of ['salary', 'conditions', 'delete']) {
  test(`${operation}: unavailable token shows not-started notice and releases write lease`, () => {
    const flight = { current: null };
    const lease = beginCareerWrite(flight, owner, 12);
    assert.ok(lease);
    let writeStarted = false;
    const message = mayPresentCareerReadFailure(owner, owner, 12, 12, true)
      ? careerMutationFailure(writeStarted)
      : null;
    assert.ok(message);
    assert.equal(message.requiresCanonicalReload, false);
    assert.match(message.notice, /操作は開始していません/);
    finishCareerWrite(flight, lease);
    assert.equal(flight.current, null);
    assert.ok(beginCareerWrite(flight, owner, 13));
  });
}

test('token absence after account switch cannot report old candidate write failure', () => {
  assert.equal(mayPresentCareerReadFailure(owner, nextSession, 12, 12, true), false);
});

test('App Lock hides token-failure messages instead of revealing private UI', () => {
  assert.equal(mayPresentCareerReadFailure(owner, owner, 12, 12, false), false);
});

test('stale completion cannot report failure over a newer attempt', () => {
  assert.equal(mayPresentCareerReadFailure(owner, owner, 12, 13, true), false);
});
