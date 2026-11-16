import assert from 'node:assert/strict';
import test from 'node:test';
import { visibleCandidateFacilityMessageIdWhenKeyboardHidden } from '../src/lib/candidateMessageReadVisibility.ts';

const visible = {
  facilityMessageId: 'facility-2', measuredMessageId: 'facility-2',
  sectionTop: 600, messageTop: 90, messageHeight: 110,
  scrollY: 450, viewportHeight: 390,
};

test('a materially visible facility bubble is readable with no keyboard', () => {
  assert.equal(visibleCandidateFacilityMessageIdWhenKeyboardHidden(visible, false), 'facility-2');
});

test('do not acknowledge a keyboard-obscured facility bubble despite stale layout height', () => {
  assert.equal(visibleCandidateFacilityMessageIdWhenKeyboardHidden(visible, true), null);
});

test('keyboard hiding cannot bypass canonical bubble geometry', () => {
  assert.equal(visibleCandidateFacilityMessageIdWhenKeyboardHidden({ ...visible, scrollY: 100 }, false), null);
  assert.equal(visibleCandidateFacilityMessageIdWhenKeyboardHidden({ ...visible, measuredMessageId: 'older' }, false), null);
  assert.equal(visibleCandidateFacilityMessageIdWhenKeyboardHidden({ ...visible, viewportHeight: null }, false), null);
});

test('candidate-only conversation stays unread in either keyboard state', () => {
  for (const keyboardVisible of [true, false]) {
    assert.equal(visibleCandidateFacilityMessageIdWhenKeyboardHidden({ ...visible, facilityMessageId: null }, keyboardVisible), null);
  }
});
