import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const spot = readFileSync(new URL('../src/app/spot-jobs.tsx', import.meta.url), 'utf8');

test('Spot read gate is instantiated before account-change invalidation', () => {
  const declaration = spot.indexOf('const readSingleFlightRef = useRef(createSpotReadSingleFlight());');
  const use = spot.indexOf('readSingleFlightRef.current.invalidate();');
  assert.ok(declaration >= 0 && use > declaration);
});

test('a repeated visible retry exits before incrementing generation or setting loading', () => {
  const begin = spot.indexOf('readSingleFlightRef.current.begin(ownerKey)');
  const duplicateExit = spot.indexOf('if (privateAllowed && !readLease) return false;');
  const increment = spot.indexOf('const current = ++generation.current;');
  assert.ok(begin >= 0 && begin < duplicateExit && duplicateExit < increment);
});

test('candidate reads and their UI commits are gated to the exact lease', () => {
  assert.match(spot, /isCurrent: \(\) => Boolean\(readSingleFlightRef\.current\.isCurrent\(readLease\)/);
  assert.match(spot, /if \(!readSingleFlightRef\.current\.isCurrent\(readLease\) \|\|/);
  assert.match(spot, /readSingleFlightRef\.current\.finish\(readLease\)/);
});

test('blur, privacy closure and owner change invalidate stale leases', () => {
  const invalidations = spot.match(/readSingleFlightRef\.current\.invalidate\(\)/g) ?? [];
  assert.ok(invalidations.length >= 3);
  assert.match(spot, /readInFlight: readSingleFlightRef\.current\.isBusy\(ownerKey\)/);
  assert.doesNotMatch(spot, /readInFlightRef/);
});
