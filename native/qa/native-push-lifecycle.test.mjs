// Behavioural suite: push registration lifecycle against the real notifications.ts with a
// synthetic platform. No device, no network, no real tokens.
import assert from 'node:assert/strict';
import test, { beforeEach } from 'node:test';
import { registerHooks } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const stub = pathToFileURL(fileURLToPath(new URL('./fixtures/push-platform.stub.mjs', import.meta.url))).href;
const platformPackages = new Set(['expo-crypto', 'expo-device', 'expo-notifications', 'expo-secure-store', 'expo-constants', 'expo-application', 'react-native']);
registerHooks({ resolve(specifier, context, nextResolve) {
  if (platformPackages.has(specifier)) return nextResolve(stub, context);
  if (/^\.\/[A-Za-z]+$/.test(specifier) && context.parentURL?.includes('/src/lib/')) return nextResolve(`${specifier}.ts`, context);
  return nextResolve(specifier, context);
} });
process.env.EXPO_PUBLIC_CLIENT_CONTRACT_VERSION = '7';
const push = await import('../src/lib/notifications.ts');
const platform = await import('./fixtures/push-platform.stub.mjs');
const { s } = platform;

function client(failWith = null) {
  const calls = [];
  return { calls, rpc: async (name, args) => { calls.push([name, args]); return { data: null, error: failWith }; } };
}
beforeEach(async () => {
  await push.quiescePushBindingOperations();
  push.unblockPushBindingOperations();
  platform.setIsDevice(true);
  Object.assign(s, { os: 'android', permission: { status: 'granted', canAskAgain: true }, requestResult: null, token: 'ExponentPushToken[synthetic]',
    tokenFails: false, projectId: 'project-1', calls: [], failUnregister: false, failPresentation: false, gate: null, listener: null });
  s.store.clear();
});

test('simulator/emulator is reported unavailable and registers nothing', async () => {
  platform.setIsDevice(false);
  const c = client();
  assert.deepEqual(await push.syncPushRegistration({ client: c, requestPermission: true }), { kind: 'unavailable', authorized: false, reason: 'PHYSICAL_DEVICE_REQUIRED' });
  assert.equal(c.calls.length, 0);
});
test('granted permission registers a token with release identity and no caller identity', async () => {
  const c = client();
  const state = await push.syncPushRegistration({ client: c, requestPermission: false });
  assert.equal(state.kind, 'registered');
  const [name, args] = c.calls[0];
  assert.equal(name, 'hc_mobile_register_installation_v1');
  assert.equal(args.p_push_token, 'ExponentPushToken[synthetic]');
  assert.equal(args.p_notifications_authorized, true);
  assert.equal(args.p_platform, 'android');
  assert.equal(args.p_build_number, 45);
  assert.equal(args.p_client_contract_version, 7);
  assert.ok(!Object.keys(args).some((k) => /user|candidate|owner|email/i.test(k)));
});
test('installation id is created once and stays stable across syncs', async () => {
  const c = client();
  const a = await push.syncPushRegistration({ client: c, requestPermission: false });
  const b = await push.syncPushRegistration({ client: c, requestPermission: false });
  assert.equal(a.installationId, b.installationId);
  assert.equal(c.calls[0][1].p_installation_id, c.calls[1][1].p_installation_id);
});
test('denied permission without asking registers the installation with no token', async () => {
  s.permission = { status: 'denied', canAskAgain: true };
  const c = client();
  const state = await push.syncPushRegistration({ client: c, requestPermission: false });
  assert.equal(state.kind, 'permission_denied');
  assert.equal(c.calls[0][1].p_push_token, null);
  assert.equal(c.calls[0][1].p_notifications_authorized, false);
  assert.ok(!s.calls.some(([n]) => n === 'requestPermission' || n === 'getToken'));
});
test('permission prompt is only shown when requested and askable', async () => {
  s.permission = { status: 'denied', canAskAgain: true };
  s.requestResult = { status: 'granted', canAskAgain: true };
  const state = await push.syncPushRegistration({ client: client(), requestPermission: true });
  assert.equal(state.kind, 'registered');
  assert.ok(s.calls.some(([n]) => n === 'requestPermission'));
  s.calls = []; s.permission = { status: 'denied', canAskAgain: false };
  const blocked = await push.syncPushRegistration({ client: client(), requestPermission: true });
  assert.equal(blocked.kind, 'permission_denied');
  assert.equal(blocked.canAskAgain, false);
  assert.ok(!s.calls.some(([n]) => n === 'requestPermission'));
});
test('iOS provisional authorization counts as authorized and reports badge permission', async () => {
  s.os = 'ios';
  s.permission = { status: 'granted', ios: { status: 3, allowsBadge: false } };
  const state = await push.syncPushRegistration({ client: client(), requestPermission: false });
  assert.equal(state.kind, 'registered');
  assert.equal(state.badgeAllowed, false);
  s.permission = { status: 'granted', ios: { status: 1 } };
  assert.equal((await push.syncPushRegistration({ client: client(), requestPermission: false })).kind, 'permission_denied');
});
test('token failure and placeholder project id surface as a non-throwing error state', async () => {
  s.tokenFails = true;
  assert.equal((await push.syncPushRegistration({ client: client(), requestPermission: false })).kind, 'error');
  s.tokenFails = false; s.projectId = 'SET_ME';
  const state = await push.syncPushRegistration({ client: client(), requestPermission: false });
  assert.equal(state.kind, 'error');
  assert.match(state.message, /EAS_PROJECT_ID_REQUIRED/);
});
test('server registration error propagates as an error state, not as success', async () => {
  const state = await push.syncPushRegistration({ client: client({ message: 'rls denied' }), requestPermission: false });
  assert.equal(state.kind, 'error');
});
test('token rotation re-registers with the rotated device token and without prompting', async () => {
  const c = client(); const states = [];
  push.addPushTokenRotationListener({ client: c, onState: (x) => states.push(x) });
  assert.ok(s.listener);
  s.listener('rotated-device-token');
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(states[0]?.kind, 'registered');
  assert.deepEqual(s.calls.find(([n]) => n === 'getToken')[1].devicePushToken, 'rotated-device-token');
  assert.ok(!s.calls.some(([n]) => n === 'requestPermission'));
});
test('sign-out quarantine blocks later bindings and presentation until explicitly unblocked', async () => {
  const gen = await push.quiescePushBindingOperations();
  await assert.rejects(push.syncPushRegistration({ client: client(), requestPermission: false }), (e) => push.isPushBindingQuarantinedError(e));
  await assert.rejects(push.setCandidateNotificationBadgeCount(3), (e) => push.isPushBindingQuarantinedError(e));
  assert.equal(push.unblockPushBindingOperations(gen + 1), false, 'stale generation cannot unblock');
  assert.equal(push.unblockPushBindingOperations(gen), true);
  assert.equal((await push.syncPushRegistration({ client: client(), requestPermission: false })).kind, 'registered');
});
test('in-flight registration is discarded when the session is quarantined mid-flight', async () => {
  let release; s.gate = new Promise((r) => { release = r; });
  const c = client();
  const pending = push.syncPushRegistration({ client: c, requestPermission: false });
  await new Promise((r) => setTimeout(r, 5));
  const quiesced = push.quiescePushBindingOperations();
  release();
  await assert.rejects(pending, (e) => push.isPushBindingQuarantinedError(e));
  await quiesced;
  assert.equal(c.calls.length, 0, 'a previous owner must not register its token after sign-out');
});
test('local identity quarantine unregisters, clears badge/notifications/response, and keeps the installation id', async () => {
  const r = await push.quarantineLocalPushIdentity();
  assert.deepEqual(r, { unregistered: true, installationIdPreserved: true });
  const names = s.calls.map(([n]) => n);
  for (const n of ['unregister', 'dismissAll', 'badge', 'clearResponse']) assert.ok(names.includes(n), n);
  assert.deepEqual(s.calls.find(([n]) => n === 'badge'), ['badge', 0]);
});
test('quarantine tolerates unregister failure, but can require presentation cleanup', async () => {
  s.failUnregister = true;
  assert.equal((await push.quarantineLocalPushIdentity()).unregistered, false);
  s.failPresentation = true;
  assert.equal((await push.quarantineLocalPushIdentity()).unregistered, false);
  await assert.rejects(push.quarantineLocalPushIdentity(undefined, { requirePresentationCleanup: true }), /LOCAL_PUSH_PRESENTATION_PURGE_INCOMPLETE/);
});
test('stale generation quarantine is a no-op', async () => {
  const r = await push.quarantineLocalPushIdentity(-5);
  assert.equal(r.unregistered, false);
  assert.equal(s.calls.length, 0);
});
test('revoke is skipped with no installation id and sends only the installation id otherwise', async () => {
  const c = client();
  await push.revokePush(c);
  assert.equal(c.calls.length, 0);
  await push.syncPushRegistration({ client: c, requestPermission: false });
  c.calls.length = 0;
  await push.revokePush(c);
  assert.equal(c.calls[0][0], 'hc_mobile_revoke_installation_v1');
  assert.deepEqual(Object.keys(c.calls[0][1]), ['p_installation_id']);
  await assert.rejects(push.revokePush(client({ message: 'x' })));
});
test('badge count accepts only non-negative integers', async () => {
  for (const bad of [-1, 1.5, NaN]) await assert.rejects(push.setCandidateNotificationBadgeCount(bad), /INVALID_NOTIFICATION_BADGE_COUNT/);
  await push.setCandidateNotificationBadgeCount(0);
  assert.deepEqual(s.calls.at(-1), ['badge', 0]);
});
test('notification routing uses verified ids only and never trusts payload links', () => {
  const id = '55555555-5555-4555-8555-555555555555';
  assert.equal(push.nativeNotificationHref({ route_key: 'application_messages', route_params: { applicationId: id } }, 'k1'), `/application/${id}?focus=messages&focusKey=k1`);
  assert.equal(push.nativeNotificationHref({ route_key: 'application_interview', route_params: { applicationId: id, interviewId: 'not-a-uuid' } }), `/application/${id}?focus=interview`);
  assert.equal(push.nativeNotificationHref({ route_key: 'scouts', route_params: { scoutId: id } }), `/scouts?scoutId=${id}`);
  assert.throws(() => push.nativeNotificationHref({ route_key: 'scouts', route_params: { scoutId: '../x' } }), /NOTIFICATION_TARGET_UNAVAILABLE/);
  assert.equal(push.nativeNotificationHref({ route_key: 'unknown', route_params: {} }), '/(tabs)/notifications');
});
test('unread count rejects non-integer or negative server values', async () => {
  const mk = (data) => ({ rpc: async () => ({ data, error: null }) });
  assert.equal(await push.getUnreadNotificationCount(mk(4)), 4);
  for (const bad of [-1, 1.5, 'x', null]) {
    if (bad === null) { assert.equal(await push.getUnreadNotificationCount(mk(null)), 0); continue; }
    await assert.rejects(push.getUnreadNotificationCount(mk(bad)), /UNAVAILABLE/);
  }
});
