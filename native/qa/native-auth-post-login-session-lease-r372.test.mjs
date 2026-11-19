import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

const UUID = 'f27bc132-ced7-4bda-a4de-f81580385e77';
const isolated = (caseName) => import('../src/lib/authInitialLinkReturn.ts?case=r372-' + caseName);

test('session revoked while cold-link read is pending must not consume the next session return intent', async () => {
  const links = await isolated('concurrent');
  let resolveInitial;
  links.beginInitialCandidateLinkCapture(() => new Promise((resolve) => { resolveInitial = resolve; }));
  links.recordInitialCandidateAuth(false);
  links.openSignedOutCandidateLinkWindow();
  let sessionOneCurrent = true;
  const staleRead = links.consumePostAuthCandidateRoute(() => sessionOneCurrent);
  // Same app instance: Clerk session changes before Linking.getInitialURL settles.
  sessionOneCurrent = false;
  const freshRead = links.consumePostAuthCandidateRoute(() => true);
  await Promise.resolve();
  await Promise.resolve();
  resolveInitial('hoikucolor://application/' + UUID + '?focus=messages');
  assert.equal(await staleRead, null);
  assert.equal(await freshRead, '/application/' + UUID + '?focus=messages');
  assert.equal(await links.consumePostAuthCandidateRoute(() => true), null);
});

test('a revoked route consumer must never burn a newly received warm link', async () => {
  const links = await isolated('warm');
  links.recordInitialCandidateAuth(false);
  links.openSignedOutCandidateLinkWindow();
  links.rememberSignedOutCandidateLink('hoikucolor://messages');
  assert.equal(await links.consumePostAuthCandidateRoute(() => false), null);
  assert.equal(await links.consumePostAuthCandidateRoute(() => true), '/messages');
});

test('after a legitimate session consumes a link it is still one-shot, even with stale consumers', async () => {
  const links = await isolated('one-shot');
  links.recordInitialCandidateAuth(false);
  links.openSignedOutCandidateLinkWindow();
  links.rememberSignedOutCandidateLink('hoikucolor://scouts');
  assert.equal(await links.consumePostAuthCandidateRoute(() => true), '/scouts');
  assert.equal(await links.consumePostAuthCandidateRoute(() => false), null);
  assert.equal(await links.consumePostAuthCandidateRoute(() => true), null);
});

test('real Expo Router entry passes its current effect lease into one-shot consumption', () => {
  const source = readFileSync(new URL('../src/app/index.tsx', import.meta.url), 'utf8');
  assert.match(source, /let live = true;/);
  assert.match(source, /consumePostAuthCandidateRoute\(\(\) => live\)/);
  assert.match(source, /return \(\) => \{ live = false; \};/);
});
