import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shouldRefreshOpenedApplicationDocuments } from '../src/lib/manualApplicationConversationRefresh.ts';
const visible = Object.freeze({
  open: true, focused: true, foreground: true, privateAccess: true,
  ownerCurrent: true, mutationPending: false,
});
test('r324: manual Web-equivalent refresh includes an opened, current document panel', () => {
  assert.equal(shouldRefreshOpenedApplicationDocuments(1, 0, visible, false), true);
});
test('r324: no first-render or duplicate refresh request', () => {
  assert.equal(shouldRefreshOpenedApplicationDocuments(0, 0, visible, false), false);
  assert.equal(shouldRefreshOpenedApplicationDocuments(1, 1, visible, false), false);
  assert.equal(shouldRefreshOpenedApplicationDocuments(2, 3, visible, false), false);
  assert.equal(shouldRefreshOpenedApplicationDocuments(2, 1, visible, false), true);
});
test('r324: closed document panel is not fetched; its separate open path must refresh', () => {
  assert.equal(shouldRefreshOpenedApplicationDocuments(1, 0, { ...visible, open: false }, false), false);
});
test('r324: hidden or backgrounded Native document panel cannot refresh', () => {
  assert.equal(shouldRefreshOpenedApplicationDocuments(1, 0, { ...visible, focused: false }, false), false);
  assert.equal(shouldRefreshOpenedApplicationDocuments(1, 0, { ...visible, foreground: false }, false), false);
});
test('r324: private shield and changed candidate owner prevent reads', () => {
  assert.equal(shouldRefreshOpenedApplicationDocuments(1, 0, { ...visible, privateAccess: false }, false), false);
  assert.equal(shouldRefreshOpenedApplicationDocuments(1, 0, { ...visible, ownerCurrent: false }, false), false);
});
test('r324: duplicate fetches and submission pending cannot race manual refresh', () => {
  assert.equal(shouldRefreshOpenedApplicationDocuments(1, 0, visible, true), false);
  assert.equal(shouldRefreshOpenedApplicationDocuments(1, 0, { ...visible, mutationPending: true }, false), false);
});
test('r324: reject noninteger and unsafe sequence counters', () => {
  assert.equal(shouldRefreshOpenedApplicationDocuments(1.5, 0, visible, false), false);
  assert.equal(shouldRefreshOpenedApplicationDocuments(Number.MAX_SAFE_INTEGER + 1, 0, visible, false), false);
  assert.equal(shouldRefreshOpenedApplicationDocuments(1, -0.2, visible, false), false);
  assert.equal(shouldRefreshOpenedApplicationDocuments(1, -1, visible, false), false);
});
