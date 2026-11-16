import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canStartFocusedApplicationDocumentsRefresh,
  canApplyFocusedApplicationDocumentsRefresh,
  shouldRevokeDocumentReadOnBlur,
} from '../src/lib/focusedApplicationDocumentsRefresh.ts';

const openPanel = {
  open: true, focused: true, foreground: true,
  privateAccess: true, ownerCurrent: true, mutationPending: false,
};

test('open focused owned application document panel may refresh', () => {
  assert.equal(canStartFocusedApplicationDocumentsRefresh(openPanel, false), true);
  assert.equal(canApplyFocusedApplicationDocumentsRefresh(openPanel), true);
});

test('a second polling request cannot overlap an in-flight canonical read', () => {
  assert.equal(canStartFocusedApplicationDocumentsRefresh(openPanel, true), false);
});

test('closed panel, blurred route and background OS cannot read or present documents', () => {
  for (const change of [{ open: false }, { focused: false }, { foreground: false }]) {
    const state = { ...openPanel, ...change };
    assert.equal(canStartFocusedApplicationDocumentsRefresh(state, false), false);
    assert.equal(canApplyFocusedApplicationDocumentsRefresh(state), false);
  }
});

test('App Lock and candidate/session replacement reject document presentation', () => {
  for (const change of [{ privateAccess: false }, { ownerCurrent: false }]) {
    const state = { ...openPanel, ...change };
    assert.equal(canStartFocusedApplicationDocumentsRefresh(state, false), false);
    assert.equal(canApplyFocusedApplicationDocumentsRefresh(state), false);
  }
});

test('in-progress document mutation quarantines refresh before and after an await', () => {
  const changed = { ...openPanel, mutationPending: true };
  assert.equal(canStartFocusedApplicationDocumentsRefresh(changed, false), false);
  assert.equal(canApplyFocusedApplicationDocumentsRefresh(changed), false);
});

test('read that began while open must be discarded after the panel closes', () => {
  assert.equal(canStartFocusedApplicationDocumentsRefresh(openPanel, false), true);
  assert.equal(canApplyFocusedApplicationDocumentsRefresh({ ...openPanel, open: false }), false);
});

test('blur revokes ordinary reads but preserves an in-flight attachment lease', () => {
  assert.equal(shouldRevokeDocumentReadOnBlur(false), true);
  assert.equal(shouldRevokeDocumentReadOnBlur(true), false);
});
