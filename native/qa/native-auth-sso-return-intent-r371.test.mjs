import assert from 'node:assert/strict';
import test from 'node:test';

const UUID = 'f27bc132-ced7-4bda-a4de-f81580385e77';
const mod = (caseId) => import(`../src/lib/authInitialLinkReturn.ts?case=r371-${caseId}`);

test('Google OAuth callback must not erase a pending candidate application link', async () => {
  const links = await mod('google');
  links.recordInitialCandidateAuth(false);
  links.openSignedOutCandidateLinkWindow();
  links.rememberSignedOutCandidateLink('hoikucolor://application/' + UUID + '?focus=messages');
  // Mirrors AuthSession.makeRedirectUri({ scheme: 'hoikucolor', path: 'sso-callback' }).
  links.rememberSignedOutCandidateLink('hoikucolor://sso-callback?code=synthetic-only&state=synthetic-only');
  assert.equal(await links.consumePostAuthCandidateRoute(), '/application/' + UUID + '?focus=messages');
  assert.equal(await links.consumePostAuthCandidateRoute(), null);
});

test('callback URL slash and fragment variants do not discard signed-out return intent', async () => {
  const links = await mod('callback-variants');
  links.recordInitialCandidateAuth(false);
  links.openSignedOutCandidateLinkWindow();
  links.rememberSignedOutCandidateLink('hoikucolor://messages');
  links.rememberSignedOutCandidateLink('hoikucolor:///sso-callback#_=_');
  assert.equal(await links.consumePostAuthCandidateRoute(), '/messages');
});

test('unrelated URI cannot silently inherit a pending private link', async () => {
  const links = await mod('reject-unrelated');
  links.recordInitialCandidateAuth(false);
  links.openSignedOutCandidateLinkWindow();
  links.rememberSignedOutCandidateLink('hoikucolor://messages');
  links.rememberSignedOutCandidateLink('hoikucolor://sso-callback-attacker?code=synthetic');
  assert.equal(await links.consumePostAuthCandidateRoute(), null);
});

test('callback alone does not create a candidate redirect', async () => {
  const links = await mod('callback-alone');
  links.recordInitialCandidateAuth(false);
  links.openSignedOutCandidateLinkWindow();
  links.rememberSignedOutCandidateLink('hoikucolor://sso-callback?code=synthetic');
  assert.equal(await links.consumePostAuthCandidateRoute(), null);
});
