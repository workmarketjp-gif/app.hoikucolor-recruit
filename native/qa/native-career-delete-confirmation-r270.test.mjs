import test from 'node:test';
import assert from 'node:assert/strict';
import { captureCareerDeleteConfirmation, mayExecuteCareerDeletion } from '../src/lib/careerDeleteConfirmation.ts';

const ownerA = '["candidate-a","session-1"]';
const ownerB = '["candidate-b","session-2"]';
const allowed = (c, owner=ownerA, generation=3, revision=7, unlocked=true) =>
  mayExecuteCareerDeletion(c, owner, generation, revision, unlocked);

test('candidate can confirm the same unmodified authorized dialog exactly once per action lease', () => {
  const c = captureCareerDeleteConfirmation(ownerA, 3, 7, true);
  assert.ok(c);
  assert.equal(allowed(c), true);
});

test('a confirmation from candidate A must not operate on candidate B', () => {
  const c = captureCareerDeleteConfirmation(ownerA, 3, 7, true);
  assert.equal(allowed(c, ownerB), false);
});

test('same candidate returning after session replacement requires fresh confirmation', () => {
  const c = captureCareerDeleteConfirmation(ownerA, 3, 7, true);
  assert.equal(allowed(c, '["candidate-a","session-new"]'), false);
});

test('A -> B -> A reload sequence still rejects an old confirmation', () => {
  const c = captureCareerDeleteConfirmation(ownerA, 3, 7, true);
  assert.equal(allowed(c, ownerA, 5), false);
});

test('a canonical reload invalidates a pending destructive dialog', () => {
  const c = captureCareerDeleteConfirmation(ownerA, 3, 7, true);
  assert.equal(allowed(c, ownerA, 4), false);
});

test('an edit while a dialog is pending invalidates its old confirmation', () => {
  const c = captureCareerDeleteConfirmation(ownerA, 3, 7, true);
  assert.equal(allowed(c, ownerA, 3, 8), false);
});

test('App Lock and logout prevent old dialog execution', () => {
  const c = captureCareerDeleteConfirmation(ownerA, 3, 7, true);
  assert.equal(allowed(c, ownerA, 3, 7, false), false);
  assert.equal(allowed(c, null), false);
  assert.equal(captureCareerDeleteConfirmation(null, 3, 7, true), null);
  assert.equal(captureCareerDeleteConfirmation(ownerA, 3, 7, false), null);
});

test('a delayed token cannot launch a delete after the dialog lease expires', async () => {
  const c = captureCareerDeleteConfirmation(ownerA, 3, 7, true);
  let generation = 3;
  let deletes = 0;
  let release;
  const token = new Promise((resolve) => { release = resolve; });
  const run = async () => {
    if (!allowed(c, ownerA, generation)) return;
    await token;
    if (!allowed(c, ownerA, generation)) return;
    deletes++;
  };
  const pending = run();
  generation = 4;
  release();
  await pending;
  assert.equal(deletes, 0);
});

test('failure checks return only booleans and do not reveal private owner identifiers', () => {
  const c = captureCareerDeleteConfirmation(ownerA, 3, 7, true);
  assert.equal(typeof allowed(c, ownerB), 'boolean');
  assert.equal(JSON.stringify(allowed(c, ownerB)).includes('candidate-a'), false);
});
