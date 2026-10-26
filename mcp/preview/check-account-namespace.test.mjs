import test from 'node:test';
import assert from 'node:assert/strict';
import { checkCloudflareAccountReadOnly } from './check-account-readonly.mjs';

const accountId = 'a'.repeat(32);
const apiToken = 'synthetic-not-a-real-token';
const expectedSubdomain = 'hc-isolated-preview';
const base = `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers`;
const candidate = '208731';

function json(result, status = 200) {
  return new Response(JSON.stringify({ success: status === 200, result }), {
    status, headers: { 'content-type': 'application/json' },
  });
}
function fixture({ scripts = ['older-one', 'older-two'], settings = {}, settingsStatus = 200 } = {}) {
  const calls = [];
  const fetcher = async (url, options) => {
    calls.push({ url, options });
    if (url === `${base}/subdomain`) return json({ subdomain: expectedSubdomain });
    if (url === `${base}/scripts`) return json(scripts.map(id => ({ id })), 200);
    const match = url.match(new RegExp(`^${base}/scripts/([a-z0-9_-]+)/settings$`, 'i'));
    if (match) {
      const bindings = settings[match[1]] ?? [];
      return settingsStatus !== 200 ? json({}, settingsStatus) :
        json(bindings === 'MISSING' ? {} : { bindings });
    }
    throw new Error('unexpected URL');
  };
  return { calls, args: { accountId, apiToken, expectedSubdomain, rateNamespaceId: candidate, fetcher } };
}

test('read-only preflight proves candidate namespace is unused in current Worker settings', async () => {
  const { calls, args } = fixture({
    settings: {
      'older-one': [{ type: 'ratelimit', name: 'OLD_LIMIT', namespace_id: '1234' }],
      'older-two': [{ type: 'plain_text', name: 'PUBLIC_VAR' }],
    },
  });
  const result = await checkCloudflareAccountReadOnly(args);
  assert.equal(result.rate_namespace_uniqueness, 'VERIFIED_UNUSED_IN_CURRENT_WORKER_SETTINGS');
  assert.equal(result.approved_to_deploy, false);
  assert.equal(result.changes_performed, false);
  assert.equal(calls.length, 4);
  for (const call of calls) {
    assert.equal(call.options.method, 'GET');
    assert.equal(call.options.redirect, 'error');
    assert.equal(call.options.headers.authorization, `Bearer ${apiToken}`);
    assert.equal(call.url.includes(apiToken), false);
  }
});

test('namespace collision with an existing Worker fails closed', async () => {
  const { args } = fixture({
    settings: { 'older-two': [{ type: 'ratelimit', name: 'OTHER', namespace_id: candidate }] },
  });
  await assert.rejects(checkCloudflareAccountReadOnly(args),
    error => error.message === 'HC_PREVIEW_RATE_NAMESPACE_ALREADY_USED');
});

test('incomplete settings, denied access and malformed rate binding never prove uniqueness', async () => {
  for (const [settings, status, message] of [
    [{ 'older-one': 'MISSING' }, 200, 'CLOUDFLARE_RATE_NAMESPACE_SCAN_INCOMPLETE'],
    [{ 'older-one': [{ type: 'ratelimit', name: 'OLD' }] }, 200, 'CLOUDFLARE_RATE_NAMESPACE_SCAN_INCOMPLETE'],
    [{ 'older-one': [{ type: 'ratelimit', namespace_id: '000208731' }] }, 200, 'CLOUDFLARE_RATE_NAMESPACE_SCAN_INCOMPLETE'],
    [{}, 403, 'CLOUDFLARE_READ_UNAVAILABLE'],
  ]) {
    const { args } = fixture({ settings, settingsStatus: status });
    await assert.rejects(checkCloudflareAccountReadOnly(args), error => error.message === message);
  }
});

test('rate namespace is explicitly unverified unless requested by caller', async () => {
  const { args, calls } = fixture();
  delete args.rateNamespaceId;
  const result = await checkCloudflareAccountReadOnly(args);
  assert.equal(result.rate_namespace_uniqueness, 'NOT_VERIFIED');
  assert.deepEqual(calls.map(call => call.url), [`${base}/subdomain`, `${base}/scripts`]);
});

test('invalid candidate namespace and example placeholder rejected before any API call', async () => {
  for (const bad of ['1001', '0', '-1', '01', '1.5', '12345678901234567890', 12, null, '']) {
    const { args, calls } = fixture();
    await assert.rejects(checkCloudflareAccountReadOnly({ ...args, rateNamespaceId: bad }),
      error => error.message === 'CLOUDFLARE_READ_CONFIG_REQUIRED');
    assert.equal(calls.length, 0);
  }
});

test('incomplete or unsafely named Worker inventory blocks namespace scan', async () => {
  for (const scripts of [
    Array.from({ length: 101 }, (_, n) => `old-worker-${n}`),
    ['old/app'],
    ['old%2Fapp'],
  ]) {
    const { args, calls } = fixture({ scripts });
    await assert.rejects(checkCloudflareAccountReadOnly(args),
      error => error.message === 'CLOUDFLARE_RATE_NAMESPACE_SCAN_INCOMPLETE');
    assert.equal(calls.some(call => call.url.endsWith('/settings')), false);
  }
});
