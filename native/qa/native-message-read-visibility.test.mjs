import assert from 'node:assert/strict';
import test from 'node:test';
import { visibleCandidateFacilityMessageId } from '../src/lib/candidateMessageReadVisibility.ts';

const base = { facilityMessageId: 'facility-2', measuredMessageId: 'facility-2', sectionTop: 600, messageTop: 90, messageHeight: 110, scrollY: 220, viewportHeight: 390 };

test('fetching the application while the message remains below the fold is not reading it', () => {
  assert.equal(visibleCandidateFacilityMessageId(base), null);
});
test('scrolling to show the actual last facility bubble permits a read acknowledgement', () => {
  assert.equal(visibleCandidateFacilityMessageId({ ...base, scrollY: 450 }), 'facility-2');
});
test('a tiny sliver of a bubble is not treated as read', () => {
  assert.equal(visibleCandidateFacilityMessageId({ ...base, scrollY: 305 }), null);
});
test('scrolled out of view, even after previously being visible, is not reading it now', () => {
  assert.equal(visibleCandidateFacilityMessageId({ ...base, scrollY: 850 }), null);
});
test('a stale measurement from an older facility message cannot acknowledge a new message', () => {
  assert.equal(visibleCandidateFacilityMessageId({ ...base, measuredMessageId: 'facility-1', scrollY: 450 }), null);
});
test('candidate-only conversations and missing layout never acknowledge a facility message', () => {
  assert.equal(visibleCandidateFacilityMessageId({ ...base, facilityMessageId: null, scrollY: 450 }), null);
  for (const field of ['sectionTop', 'messageTop', 'messageHeight', 'scrollY', 'viewportHeight']) {
    assert.equal(visibleCandidateFacilityMessageId({ ...base, [field]: null }), null, field);
  }
});
test('rejects negative or nonfinite Native measurements', () => {
  for (const field of ['sectionTop', 'messageTop', 'scrollY']) {
    assert.equal(visibleCandidateFacilityMessageId({ ...base, [field]: -1 }), null, field);
  }
  for (const field of ['messageHeight', 'viewportHeight']) {
    assert.equal(visibleCandidateFacilityMessageId({ ...base, [field]: 0 }), null, field);
  }
  assert.equal(visibleCandidateFacilityMessageId({ ...base, messageTop: Infinity }), null);
  assert.equal(visibleCandidateFacilityMessageId({ ...base, viewportHeight: NaN }), null);
});
test('short bubbles are acknowledged only when at least half is visible', () => {
  const short = { ...base, sectionTop: 0, messageTop: 120, messageHeight: 20, scrollY: 0, viewportHeight: 125 };
  assert.equal(visibleCandidateFacilityMessageId(short), null);
  assert.equal(visibleCandidateFacilityMessageId({ ...short, viewportHeight: 130 }), 'facility-2');
});
