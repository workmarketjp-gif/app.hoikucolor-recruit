import assert from 'node:assert/strict';
import test from 'node:test';

const UUID = 'f27bc132-ced7-4bda-a4de-f81580385e77';
const isolated = (caseId) => import(`../src/lib/authInitialLinkReturn.ts?case=r373-${caseId}`);

test('OS warm notification during Clerk hydration survives a signed-out auth gate', async () => {
  const links = await isolated('boot-warm');
  assert.equal(typeof links.rememberCandidateLinkDuringBoot, 'function');
  links.rememberCandidateLinkDuringBoot(`hoikucolor://application/${UUID}?focus=messages`);
  links.recordInitialCandidateAuth(false);
  links.openSignedOutCandidateLinkWindow();
  assert.equal(await links.consumePostAuthCandidateRoute(() => true, 'session-A'),
    `/application/${UUID}?focus=messages`);
  assert.equal(await links.consumePostAuthCandidateRoute(() => true, 'session-A'), null);
});

test('warm hydration notification wins over late cold getInitialURL', async () => {
  const links = await isolated('warm-vs-cold');
  let resolveInitial;
  links.beginInitialCandidateLinkCapture(() => new Promise(resolve => { resolveInitial = resolve; }));
  links.rememberCandidateLinkDuringBoot('hoikucolor://messages');
  links.recordInitialCandidateAuth(false);
  links.openSignedOutCandidateLinkWindow();
  await Promise.resolve();
  await Promise.resolve();
  resolveInitial(`hoikucolor://application/${UUID}`);
  assert.equal(await links.consumePostAuthCandidateRoute(() => true, 'session-A'), '/messages');
});

test('Google SSO callback while Clerk hydrates cannot replace private return intent', async () => {
  const links = await isolated('callback');
  links.rememberCandidateLinkDuringBoot(`hoikucolor://application/${UUID}?focus=interview`);
  links.rememberCandidateLinkDuringBoot('hoikucolor://sso-callback?code=synthetic&state=synthetic');
  links.recordInitialCandidateAuth(false);
  links.openSignedOutCandidateLinkWindow();
  assert.equal(await links.consumePostAuthCandidateRoute(() => true, 'session-A'),
    `/application/${UUID}?focus=interview`);
});

test('already signed-in hydration discards the early warm link permanently', async () => {
  const links = await isolated('already-signed-in');
  links.rememberCandidateLinkDuringBoot('hoikucolor://messages');
  links.recordInitialCandidateAuth(true);
  assert.equal(await links.consumePostAuthCandidateRoute(() => true, 'session-A'), null);
  links.openSignedOutCandidateLinkWindow();
  assert.equal(await links.consumePostAuthCandidateRoute(() => true, 'session-B'), null);
});

test('boot-only listener ignores events after hydration; signed-out owner remains authoritative', async () => {
  const links = await isolated('handoff');
  links.recordInitialCandidateAuth(false);
  links.openSignedOutCandidateLinkWindow();
  links.rememberSignedOutCandidateLink('hoikucolor://messages');
  links.rememberCandidateLinkDuringBoot('https://malicious.example/cancel');
  assert.equal(await links.consumePostAuthCandidateRoute(() => true, 'session-A'), '/messages');
});

test('boot listener never turns untrusted routes into an auth return destination', async () => {
  const links = await isolated('untrusted');
  links.rememberCandidateLinkDuringBoot('hoikucolor://admin');
  links.recordInitialCandidateAuth(false);
  links.openSignedOutCandidateLinkWindow();
  assert.equal(await links.consumePostAuthCandidateRoute(() => true, 'session-A'), null);
});
