import test from 'node:test';
import assert from 'node:assert/strict';
import { checkCloudflareAccountReadOnly } from './check-account-readonly.mjs';

const accountId = 'a'.repeat(32);
const apiToken = 'fake-read-token-only';
const expectedSubdomain = 'hc-workspace';
const domainPath = `/accounts/${accountId}/workers/subdomain`;
const scriptsPath = `/accounts/${accountId}/workers/scripts`;
function endpoint(result, extra = {}) {
  return new Response(JSON.stringify({ success: true, result, ...extra }), {
    status: 200, headers: { 'content-type': 'application/json' },
  });
}
function harness({ domain = expectedSubdomain, scripts = [{ id: 'old-app' }],
  scriptsMeta, override } = {}) {
  const calls = [];
  const fetcher = async (url, options) => {
    calls.push({ url, options });
    if (override) return override(url, options);
    if (url.endsWith(domainPath)) return endpoint({ subdomain: domain });
    if (url.endsWith(scriptsPath)) return endpoint(scripts, scriptsMeta ? { result_info: scriptsMeta } : {});
    throw new Error('unexpected endpoint');
  };
  return { calls, args: { accountId, apiToken, expectedSubdomain, fetcher } };
}

test('preflight reads only authoritative Cloudflare account endpoints, never deploys', async () => {
  const { calls, args } = harness();
  const result = await checkCloudflareAccountReadOnly(args);
  assert.deepEqual(result, {
    checks: 'read_only_cloudflare_account', workers_dev_subdomain_matches: true,
    isolated_worker_name_available: true, rate_namespace_uniqueness: 'NOT_VERIFIED',
    changes_performed: false, approved_to_deploy: false,
  });
  assert.deepEqual(calls.map(c => c.url), [
    `https://api.cloudflare.com/client/v4${domainPath}`,
    `https://api.cloudflare.com/client/v4${scriptsPath}`,
  ]);
  for (const call of calls) {
    assert.equal(call.options.method, 'GET');
    assert.equal(call.options.redirect, 'error');
    assert.equal(call.options.headers.authorization, `Bearer ${apiToken}`);
    assert.ok(call.options.signal);
    assert.equal(call.url.includes(apiToken), false);
  }
});

test('wrong account subdomain stops before worker list inspection', async () => {
  const { calls, args } = harness({ domain: 'unrelated-account' });
  await assert.rejects(checkCloudflareAccountReadOnly(args), /CLOUDFLARE_WORKERS_SUBDOMAIN_MISMATCH/);
  assert.equal(calls.length, 1);
});

test('existing dedicated Worker is never silently reused or overwritten', async () => {
  const { args } = harness({ scripts: [{ id: 'hc-app' }, { id: 'hoikucolor-mcp-preview-only' }] });
  await assert.rejects(checkCloudflareAccountReadOnly(args), /HC_PREVIEW_WORKER_NAME_ALREADY_USED/);
});

test('untrusted configuration cannot choose arbitrary API hosts or missing credentials', async () => {
  const { args, calls } = harness();
  for (const bad of [
    { accountId: '../other' }, { accountId: '0'.repeat(31) },
    { expectedSubdomain: 'my-host.workers.dev' }, { expectedSubdomain: 'foo--bar' },
    { expectedSubdomain: 'not.our.domain' }, { apiToken: '' }, { fetcher: null },
  ]) {
    await assert.rejects(checkCloudflareAccountReadOnly({ ...args, ...bad }), /CLOUDFLARE_READ_CONFIG_REQUIRED/);
  }
  assert.equal(calls.length, 0);
});

test('missing rights / Cloudflare HTTP failure fail closed without reflecting provider text', async () => {
  const { args } = harness({ override: async () => new Response('SECRET_ERROR_BODY', { status: 403 }) });
  await assert.rejects(checkCloudflareAccountReadOnly(args), error =>
    error.message === 'CLOUDFLARE_READ_UNAVAILABLE' && !error.message.includes('SECRET'));
});

test('incomplete list or unrecognized worker metadata does not claim name availability', async () => {
  for (const o of [
    { scripts: [{ id: 'other' }], scriptsMeta: { total_count: 2 } },
    { scripts: [{ name: 'other' }] }, { scripts: null },
  ]) {
    const { args } = harness(o);
    await assert.rejects(checkCloudflareAccountReadOnly(args), /CLOUDFLARE_WORKER_LIST_INCOMPLETE/);
  }
});

test('Cloudflare Worker inventory metadata must describe a complete list', async () => {
  const badMetadata = [
    { count: 1 },
    { total_count: '1' },
    { total_count: null },
    { total_count: -1 },
    { total_count: 1.5 },
    { total_count: 0 },
    { total_count: 2 },
    { total_count: 1, count: 0 },
    { total_count: 1, count: '1' },
  ];
  for (const scriptsMeta of badMetadata) {
    const { args } = harness({ scripts: [{ id: 'other-app' }], scriptsMeta });
    await assert.rejects(checkCloudflareAccountReadOnly(args),
      /CLOUDFLARE_WORKER_LIST_INCOMPLETE/, JSON.stringify(scriptsMeta));
  }
  const { args } = harness({
    scripts: [{ id: 'other-app' }], scriptsMeta: { total_count: 1, count: 1 },
  });
  assert.equal((await checkCloudflareAccountReadOnly(args)).isolated_worker_name_available, true);
});

test('duplicate and case-variant script IDs are not accepted as a safe inventory', async () => {
  for (const scripts of [
    [{ id: 'existing' }, { id: 'EXISTING' }],
    [{ id: '' }],
    [{ id: '  ' }],
  ]) {
    const { args } = harness({ scripts });
    await assert.rejects(checkCloudflareAccountReadOnly(args), /CLOUDFLARE_WORKER_LIST_INCOMPLETE/);
  }
  const { args } = harness({ scripts: [{ id: 'HOIKUCOLOR-MCP-PREVIEW-ONLY' }] });
  await assert.rejects(checkCloudflareAccountReadOnly(args), /HC_PREVIEW_WORKER_NAME_ALREADY_USED/);
});

test('invalid JSON or oversized account responses fail closed', async () => {
  const oversized = new Response('x', { headers: { 'content-length': '1048577' } });
  for (const response of [new Response('{bad'), oversized]) {
    const { args } = harness({ override: async () => response.clone() });
    await assert.rejects(checkCloudflareAccountReadOnly(args),
      /CLOUDFLARE_RESPONSE_INVALID|CLOUDFLARE_RESPONSE_TOO_LARGE/);
  }
});
