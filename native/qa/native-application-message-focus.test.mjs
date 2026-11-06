import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { focusedApplicationMessagesOffset } from '../src/lib/focusedApplicationMessages.ts';

const ready = { focused: true, alreadyFocused: false, anchorY: 660, contentHeight: 1300, viewportHeight: 700 };

test('messages deep link scrolls to the visible message card with top inset', () => {
  assert.equal(focusedApplicationMessagesOffset({ ...ready, contentHeight: 1700 }), 648);
});

test('short page clamps the scroll to its real content extent', () => {
  assert.equal(focusedApplicationMessagesOffset(ready), 600);
  assert.equal(focusedApplicationMessagesOffset({ ...ready, contentHeight: 600 }), 0);
});

test('no focus, already consumed focus, and unfinished layout never scroll', () => {
  for (const input of [
    { ...ready, focused: false },
    { ...ready, alreadyFocused: true },
    { ...ready, anchorY: null },
    { ...ready, contentHeight: 0 },
    { ...ready, viewportHeight: 0 },
    { ...ready, anchorY: Number.NaN },
    { ...ready, anchorY: -1 },
    { ...ready, contentHeight: Number.POSITIVE_INFINITY },
  ]) assert.equal(focusedApplicationMessagesOffset(input), null);
});

test('anchor at the top does not introduce a negative scroll', () => {
  assert.equal(focusedApplicationMessagesOffset({ ...ready, anchorY: 4 }), 0);
});

test('application detail actually wires the focused anchor and ScrollView events', () => {
  // Static wiring regression only; rendered scrolling still requires Android/iOS QA.
  const filename = fileURLToPath(new URL('../src/app/application/[id].tsx', import.meta.url));
  const source = readFileSync(filename, 'utf8');
  assert.match(source, /focusedApplicationMessagesOffset\(/);
  assert.match(source, /ref=\{messageScrollRef\}/);
  assert.match(source, /onContentSizeChange=\{/);
  assert.match(source, /onLayout=\{\(event\) => \{\s*messageAnchorYRef\.current/);
  assert.match(source, /messageScrollRef\.current\?\.scrollTo/);
});
