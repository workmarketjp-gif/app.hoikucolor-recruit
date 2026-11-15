import assert from 'node:assert/strict';
import test from 'node:test';
import { candidateTabGlyphs } from '../src/lib/candidateTabGlyphs.ts';
import { homeStatRowPresentation } from '../src/lib/homeStatRowPresentation.ts';

test('all five original tab glyphs retained', () => {
  for (const name of ['home', 'search', 'yen', 'heart', 'user']) assert.ok(candidateTabGlyphs[name]?.length);
});
test('Home Web briefcase/chat glyphs are in 24pt bounds with nonzero finite geometry', () => {
  for (const name of ['briefcase', 'chat']) {
    const segments = candidateTabGlyphs[name];
    assert.ok(segments.length > 8);
    for (const line of segments) {
      assert.equal(line.kind, 'stroke');
      for (const v of [line.x1, line.y1, line.x2, line.y2]) assert.ok(Number.isFinite(v) && v >= 0 && v <= 24);
      assert.ok(line.x1 !== line.x2 || line.y1 !== line.y2);
    }
  }
});
test('confirmed counts and retry/unknown semantics remain intact', () => {
  assert.deepEqual(homeStatRowPresentation(0, null), { value: '0', retry: false });
  assert.deepEqual(homeStatRowPresentation(2, null), { value: '2', retry: false });
  assert.deepEqual(homeStatRowPresentation(null, 'network'), { value: '読み込めませんでした', retry: true });
  assert.deepEqual(homeStatRowPresentation(null, null), { value: '…', retry: false });
});
