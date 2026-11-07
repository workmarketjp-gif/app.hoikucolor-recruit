import assert from 'node:assert/strict';
import test from 'node:test';
import { focusedVisitScrollY } from '../src/lib/focusedVisitScroll.ts';
const sized = (overrides = {}) => ({ sectionTop: 300, cardTop: 400, cardHeight: 200, viewportHeight: 600, contentHeight: 2000, ...overrides });
test('centres a deep-linked reservation even inside the second visit section', () => {
  assert.equal(focusedVisitScrollY(sized()), 500);
});
test('clamps at beginning and end on small and standard mobile screens', () => {
  assert.equal(focusedVisitScrollY(sized({sectionTop:0,cardTop:20,cardHeight:100})), 0);
  assert.equal(focusedVisitScrollY(sized({sectionTop:1750,cardTop:50,cardHeight:200})), 1400);
  assert.equal(focusedVisitScrollY(sized({viewportHeight:390,contentHeight:1700})), 605);
});
test('does not scroll before both section and card layout are available', () => {
  for (const field of ['sectionTop','cardTop','cardHeight','viewportHeight','contentHeight']) {
    assert.equal(focusedVisitScrollY(sized({[field]:null})), null, field);
  }
});
test('rejects invalid or stale dimensions rather than jumping to an unrelated appointment', () => {
  assert.equal(focusedVisitScrollY(sized({cardTop:1700})), null);
  assert.equal(focusedVisitScrollY(sized({sectionTop:-1})), null);
  assert.equal(focusedVisitScrollY(sized({cardHeight:0})), null);
  assert.equal(focusedVisitScrollY(sized({viewportHeight:Infinity})), null);
  assert.equal(focusedVisitScrollY(sized({contentHeight:NaN})), null);
});
test('short content cannot produce a negative scroll offset', () => {
  assert.equal(focusedVisitScrollY(sized({sectionTop:5,cardTop:15,cardHeight:70,viewportHeight:600,contentHeight:120})), 0);
});
