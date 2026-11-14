import test from 'node:test';
import assert from 'node:assert/strict';
import { verifiedOptionalNotificationFocusId } from '../src/lib/scopedNotificationRoute.ts';

const valid = '123e4567-e89b-42d3-a456-426614174011';

test('canonical optional focus IDs preserve exact valid UUIDs', () => {
  assert.equal(verifiedOptionalNotificationFocusId(valid), valid);
  assert.equal(verifiedOptionalNotificationFocusId(valid.toUpperCase()), valid.toUpperCase());
});
test('optional absent identities remain allowed for existing generic fallback', () => {
  assert.equal(verifiedOptionalNotificationFocusId(undefined), null);
  assert.equal(verifiedOptionalNotificationFocusId(null), null);
});
test('invalid present visit focus never degrades to read-but-unfocused navigation', () => {
  for (const value of ['', 'abc', '../profile', valid + '?untrusted=1',
    [valid], { visitId: valid }, 7, false]) {
    assert.throws(() => verifiedOptionalNotificationFocusId(value),
      { message: 'NOTIFICATION_TARGET_UNAVAILABLE' });
  }
});
test('invalid present job or interview focus never silently drops its ID', () => {
  for (const value of ['0'.repeat(36), '00000000-0000-0000-0000-000000000000',
    'javascript:alert(1)', valid + '&focus=other']) {
    assert.throws(() => verifiedOptionalNotificationFocusId(value),
      { message: 'NOTIFICATION_TARGET_UNAVAILABLE' });
  }
});
test('UUID syntax itself is not server-side recipient authorization', () => {
  assert.equal(verifiedOptionalNotificationFocusId(valid), valid);
});
