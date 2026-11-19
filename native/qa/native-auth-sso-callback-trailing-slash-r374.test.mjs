import assert from 'node:assert/strict';
import test from 'node:test';

// The app uses Expo AuthSession.makeRedirectUri({ scheme: 'hoikucolor', path: 'sso-callback' }).
// Native link providers may normalize a callback URL with a single trailing slash.
// Test the actual production link-intent helper, not a fabricated navigation stub.
const UUID = 'f27bc132-ced7-4bda-a4de-f81580385e77';
const read = (name) => import(`../src/lib/authInitialLinkReturn.ts?case=r374-${name}`);

for (const callback of [
  'hoikucolor://sso-callback/',
  'hoikucolor:///sso-callback/?code=synthetic&state=synthetic',
  'hoikucolor://sso-callback/#_=_',
]) {
  test(`Google callback trailing slash preserves a pending application return: ${callback}`, async () => {
    const links = await read(encodeURIComponent(callback));
    links.recordInitialCandidateAuth(false);
    links.openSignedOutCandidateLinkWindow();
    links.rememberSignedOutCandidateLink(`hoikucolor://application/${UUID}?focus=messages`);
    links.rememberSignedOutCandidateLink(callback);
    assert.equal(await links.consumePostAuthCandidateRoute(() => true, 'session-A'), `/application/${UUID}?focus=messages`);
    assert.equal(await links.consumePostAuthCandidateRoute(() => true, 'session-A'), null);
  });
}

test('trailing-slash callback during Clerk hydration cannot discard a valid warm intent', async () => {
  const links = await read('pre-hydration');
  links.rememberCandidateLinkDuringBoot(`hoikucolor://application/${UUID}?focus=interview`);
  links.rememberCandidateLinkDuringBoot('hoikucolor:///sso-callback/?state=synthetic');
  links.recordInitialCandidateAuth(false);
  links.openSignedOutCandidateLinkWindow();
  assert.equal(await links.consumePostAuthCandidateRoute(() => true, 'session-B'), `/application/${UUID}?focus=interview`);
});

test('lookalike and extra-separator routes still invalidate an old private return intent', async () => {
  for (const unsafeUrl of ['hoikucolor://sso-callback-attacker/', 'hoikucolor://sso-callback//', 'https://example.invalid/sso-callback/']) {
    const links = await read(encodeURIComponent('unsafe-' + unsafeUrl));
    links.recordInitialCandidateAuth(false);
    links.openSignedOutCandidateLinkWindow();
    links.rememberSignedOutCandidateLink('hoikucolor://messages');
    links.rememberSignedOutCandidateLink(unsafeUrl);
    assert.equal(await links.consumePostAuthCandidateRoute(() => true, 'session-C'), null);
  }
});
