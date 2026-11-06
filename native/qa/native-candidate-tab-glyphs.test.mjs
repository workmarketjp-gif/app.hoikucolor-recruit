import { test } from 'node:test';
import assert from 'node:assert/strict';
import { candidateTabGlyphs } from '../src/lib/candidateTabGlyphs.ts';

const approved = ['home', 'search', 'yen', 'heart', 'user'];

test('exactly five Web mobile tab identities, no generic placeholder glyph', () => {
  assert.deepEqual(Object.keys(candidateTabGlyphs), approved);
  for (const key of approved) assert.ok(candidateTabGlyphs[key].length >= 2, key);
});

test('all glyph primitives stay within the Web 24x24 viewbox', () => {
  for (const [key, parts] of Object.entries(candidateTabGlyphs)) {
    for (const part of parts) {
      const coordinates = part.kind === 'stroke'
        ? [part.x1, part.y1, part.x2, part.y2]
        : [part.x, part.y, part.x + (part.kind === 'ring' ? part.diameter : part.width),
            part.y + (part.kind === 'ring' ? part.diameter : part.height)];
      for (const n of coordinates) assert.ok(Number.isFinite(n) && n >= 0 && n <= 24, key + ' ' + JSON.stringify(part));
      if (part.kind === 'stroke') assert.ok(Math.hypot(part.x2 - part.x1, part.y2 - part.y1) > 0);
    }
  }
});

test('Web source semantics remain visible through distinct line geometry', () => {
  const search = candidateTabGlyphs.search;
  assert.ok(search.some((s) => s.kind === 'ring' && s.diameter === 13));
  assert.ok(search.some((s) => s.kind === 'stroke' && s.x2 === 20.5));
  assert.equal(candidateTabGlyphs.user.filter((s) => s.kind === 'shoulders').length, 1);
  assert.ok(candidateTabGlyphs.home.some((s) => s.kind === 'stroke' && s.y2 === 4));
  assert.ok(candidateTabGlyphs.yen.some((s) => s.kind === 'stroke' && s.y2 === 20));
  assert.ok(candidateTabGlyphs.heart.length >= 16);
});
