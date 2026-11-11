import assert from 'node:assert/strict';
import test from 'node:test';
import { canStartManualJobSearch } from '../src/lib/jobSearchManualSubmit.ts';

test('same-generation keyboard or button submit is single-flight even before React rerender', () => {
  const currentGeneration = 21;
  const inFlightGeneration = 21;
  assert.equal(canStartManualJobSearch(currentGeneration, inFlightGeneration, 'user:session', true), false);
  // A second callback from a stale render cannot submit again.
  assert.equal(canStartManualJobSearch(currentGeneration, inFlightGeneration, 'user:session', true), false);
});

test('a new keyword edit invalidates the older in-flight request synchronously', () => {
  let generation = 21;
  const olderInFlightGeneration = 21;
  generation += 1; // onChangeText happens before React has rerendered `loading`.
  assert.equal(canStartManualJobSearch(generation, olderInFlightGeneration, 'user:session', true), true);
  const newInFlightGeneration = ++generation; // load() claims the generation synchronously.
  assert.equal(canStartManualJobSearch(generation, newInFlightGeneration, 'user:session', true), false);
});

test('a settled request permits deliberate resubmission', () => {
  assert.equal(canStartManualJobSearch(7, null, 'user:session', true), true);
});

test('locked, signed-out, and session-unconfirmed screens never submit', () => {
  assert.equal(canStartManualJobSearch(8, null, null, true), false);
  assert.equal(canStartManualJobSearch(8, 7, 'user:session', false), false);
  assert.equal(canStartManualJobSearch(8, null, '', true), false);
});

test('stale completion cannot clear a newer request generation', () => {
  let active = 31;
  const oldRequestGeneration = active;
  const newRequestGeneration = 33;
  active = newRequestGeneration;
  if (active === oldRequestGeneration) active = null;
  assert.equal(active, newRequestGeneration);
  assert.equal(canStartManualJobSearch(newRequestGeneration, active, 'user:session', true), false);
});
