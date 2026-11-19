import assert from 'node:assert/strict';
import test from 'node:test';
import { candidateRouteFromInitialURL, beginInitialCandidateLinkCapture, recordInitialCandidateAuth, openSignedOutCandidateLinkWindow, rememberSignedOutCandidateLink, consumePostAuthCandidateRoute } from '../src/lib/authInitialLinkReturn.ts';
const UUID = 'f27bc132-ced7-4bda-a4de-f81580385e77';
test('explicit app links only; excludes external, encoded and hostile routes', () => {
  assert.equal(candidateRouteFromInitialURL(`hoikucolor://application/${UUID}`), `/application/${UUID}`);
  assert.equal(candidateRouteFromInitialURL(`hoikucolor:///job/${UUID}`), `/job/${UUID}`);
  assert.equal(candidateRouteFromInitialURL('hoikucolor://(tabs)/applications'), '/(tabs)/applications');
  assert.equal(candidateRouteFromInitialURL('hoikucolor://messages'), '/messages');
  for (const link of [
    'https://evil.example/application/'+UUID, 'hoikucolor://settings',
    'hoikucolor://application/../../other', 'hoikucolor://application/%2e%2e%2fother',
    'hoikucolor://application/random', 'hoikucolor://other/messages',
    'hoikucolor://application\\private', 'hoikucolor://application//'+UUID,
  ]) assert.equal(candidateRouteFromInitialURL(link), null, link);
});
// The module is a process-wide one-shot; these deliberately exercise the same lifecycle.
test('cold signed-out link survives protected-route redirect; consumed once on success', async () => {
  beginInitialCandidateLinkCapture(async () => `hoikucolor://application/${UUID}`);
  recordInitialCandidateAuth(false);
  openSignedOutCandidateLinkWindow();
  assert.equal(await consumePostAuthCandidateRoute(), `/application/${UUID}`);
  assert.equal(await consumePostAuthCandidateRoute(), null);
});
test('new signed-out warm link wins over the cold pending link and cannot be replayed', async () => {
  openSignedOutCandidateLinkWindow();
  rememberSignedOutCandidateLink('hoikucolor://messages');
  assert.equal(await consumePostAuthCandidateRoute(), '/messages');
  assert.equal(await consumePostAuthCandidateRoute(), null);
});
test('non-allowlisted warm links clear the old intent rather than rerouting elsewhere', async () => {
  openSignedOutCandidateLinkWindow();
  rememberSignedOutCandidateLink('hoikucolor://messages');
  rememberSignedOutCandidateLink('https://evil.example/steal');
  assert.equal(await consumePostAuthCandidateRoute(), null);
});
test('already signed-in launch never replays an initial private link after later sign-out', async () => {
  const mod = await import('../src/lib/authInitialLinkReturn.ts?case=initial-signed-in');
  mod.beginInitialCandidateLinkCapture(async () => `hoikucolor://application/${UUID}`);
  mod.recordInitialCandidateAuth(true);
  assert.equal(await mod.consumePostAuthCandidateRoute(), null);
  mod.openSignedOutCandidateLinkWindow();
  assert.equal(await mod.consumePostAuthCandidateRoute(), null);
});
test('late cold URL cannot overwrite newer signed-out warm link', async () => {
  const mod = await import('../src/lib/authInitialLinkReturn.ts?case=warm-wins');
  let resolve;
  mod.beginInitialCandidateLinkCapture(() => new Promise(r => { resolve = r; }));
  mod.recordInitialCandidateAuth(false);
  mod.openSignedOutCandidateLinkWindow();
  mod.rememberSignedOutCandidateLink('hoikucolor://messages');
  await Promise.resolve();
  await Promise.resolve();
  resolve(`hoikucolor://application/${UUID}`);
  assert.equal(await mod.consumePostAuthCandidateRoute(), '/messages');
});
test('non-resolving OS getInitialURL does not block successful login', async () => {
  const mod = await import('../src/lib/authInitialLinkReturn.ts?case=capture-timeout');
  mod.beginInitialCandidateLinkCapture(() => new Promise(() => {}));
  mod.recordInitialCandidateAuth(false);
  const t=Date.now();
  assert.equal(await mod.consumePostAuthCandidateRoute(), null);
  assert(Date.now()-t >= 750 && Date.now()-t < 2000);
});
