import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

const UUID = 'f27bc132-ced7-4bda-a4de-f81580385e77';
const isolated = (caseName) => import('../src/lib/authInitialLinkReturn.ts?case=r372-' + caseName);

test('stale EntryScreen effect must not steal pending route from a new effect in the SAME Clerk session', async () => {
  const links = await isolated('concurrent');
  let resolveInitial;
  links.beginInitialCandidateLinkCapture(() => new Promise((resolve) => { resolveInitial = resolve; }));
  links.recordInitialCandidateAuth(false);
  links.openSignedOutCandidateLinkWindow();
  let sessionOneCurrent = true;
  const staleRead = links.consumePostAuthCandidateRoute(() => sessionOneCurrent, 'session-A');
  // Same Clerk session re-enters after its old EntryScreen effect was revoked.
  sessionOneCurrent = false;
  const freshRead = links.consumePostAuthCandidateRoute(() => true, 'session-A');
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
  assert.match(source, /consumePostAuthCandidateRoute\(\(\) => live, currentSession\)/);
  assert.match(source, /return \(\) => \{ live = false; \};/);
});

test('direct Clerk account switch cannot inherit another session’s pending notification return', async () => {
  const links = await isolated('account-switch');
  let resolveInitial;
  links.beginInitialCandidateLinkCapture(() => new Promise((resolve) => { resolveInitial = resolve; }));
  links.recordInitialCandidateAuth(false);
  links.openSignedOutCandidateLinkWindow();
  let firstCurrent = true;
  const first = links.consumePostAuthCandidateRoute(() => firstCurrent, 'session-A');
  firstCurrent = false;
  const second = links.consumePostAuthCandidateRoute(() => true, 'session-B');
  await Promise.resolve();
  await Promise.resolve();
  resolveInitial('hoikucolor://application/' + UUID + '?focus=messages');
  assert.equal(await first, null);
  assert.equal(await second, null);
  assert.equal(await links.consumePostAuthCandidateRoute(() => true, 'session-B'), null);
});

test('sign-out clears the old session return intent but permits a NEW signed-out warm link', async () => {
  // Claim the intent, then simulate sign-out before it can be published.
  let resolveInitial;
  const delayed = await isolated('signout-during-capture');
  delayed.beginInitialCandidateLinkCapture(() => new Promise((resolve) => { resolveInitial = resolve; }));
  delayed.recordInitialCandidateAuth(false);
  delayed.openSignedOutCandidateLinkWindow();
  let alive = true;
  const old = delayed.consumePostAuthCandidateRoute(() => alive, 'session-A');
  alive = false;
  delayed.openSignedOutCandidateLinkWindow();
  delayed.rememberSignedOutCandidateLink('hoikucolor://scouts');
  await Promise.resolve();
  await Promise.resolve();
  resolveInitial('hoikucolor://messages');
  assert.equal(await old, null);
  assert.equal(await delayed.consumePostAuthCandidateRoute(() => true, 'session-B'), '/scouts');
});
