import test from 'node:test';
import assert from 'node:assert/strict';
import { makeStandalonePreviewConfig, verifyStandalonePreviewConfig, PREVIEW_WORKER_NAME } from './prepare-standalone.mjs';

function valid() { return makeStandalonePreviewConfig({ accountSubdomain: 'hc-team', rateNamespaceId: '24680' }); }
function replace(config, change) { return { ...config, ...change }; }

test('generated config is inactive, dedicated, and without production routes or secrets', () => {
  const config = valid();
  assert.equal(config.name, PREVIEW_WORKER_NAME);
  assert.equal(config.workers_dev, true);
  assert.equal(config.vars.HC_MCP_PREVIEW_ENABLED, 'false');
  assert.equal(verifyStandalonePreviewConfig(config).hostname, 'hoikucolor-mcp-preview-only.hc-team.workers.dev');
  assert.doesNotMatch(JSON.stringify(config), /supabase|service_role|token|api_key|secret|route/i);
  assert.throws(() => verifyStandalonePreviewConfig(config, { requireEnabled: true }), /PREVIEW_DISABLED/);
});

test('refuses invalid Cloudflare subdomains and placeholder/unbounded rate namespaces', () => {
  for (const accountSubdomain of ['example.workers.dev', 'foo.example', 'UpperCase', '-test', 'test-', 'a--b', '']) {
    assert.throws(() => makeStandalonePreviewConfig({ accountSubdomain, rateNamespaceId: '24680' }), /INVALID_CLOUDFLARE_SUBDOMAIN/);
  }
  for (const rateNamespaceId of ['1001', '0', '-2', 'abc', '12.5', '999999999999999999999']) {
    assert.throws(() => makeStandalonePreviewConfig({ accountSubdomain: 'hc-team', rateNamespaceId }), /PREVIEW_UNIQUE_RATE_NAMESPACE_REQUIRED/);
  }
});

test('refuses existing HC/Poppy Worker aliases and any production route or binding', () => {
  const config = valid();
  for (const name of ['hoikucolor-main', 'hoikupoppy', 'hc-preview']) {
    assert.throws(() => verifyStandalonePreviewConfig(replace(config, { name })), /PREVIEW_WORKER_IDENTITY_INVALID/);
  }
  for (const extra of [{routes:[]}, {route:'hoikucolor.jp/*'}, {custom_domains:true}, {env:{production:{}}}, {services:[]}]) {
    assert.throws(() => verifyStandalonePreviewConfig(replace(config, extra)), /PREVIEW_MUST_NOT_ATTACH_TO_EXISTING_SITE/);
  }
});

test('refuses hostname mismatch, unexpected variable and embedded Supabase credentials', () => {
  const config = valid();
  assert.throws(() => verifyStandalonePreviewConfig(replace(config, { vars: {...config.vars, HC_MCP_PUBLIC_HOST:'hoikucolor.jp'} })), /PREVIEW_HOST_MISMATCH/);
  assert.throws(() => verifyStandalonePreviewConfig(replace(config, { vars: {...config.vars, HC_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_forbidden'} })), /PREVIEW_VARIABLES_INVALID/);
  assert.throws(() => verifyStandalonePreviewConfig(replace(config, { vars: {...config.vars, HC_MCP_ALLOWED_ORIGINS:'*'} })), /PREVIEW_ACTIVATION_INVALID/);
  assert.throws(() => verifyStandalonePreviewConfig(replace(config, { name: PREVIEW_WORKER_NAME, note:'service_role' })), /PREVIEW_CREDENTIAL_IN_CONFIG/);
});

test('refuses missing or renamed Cloudflare rate-limit binding and unsafe rate period', () => {
  const config = valid();
  for (const ratelimits of [[], [{ ...config.ratelimits[0], name:'WRONG' }],
    [{ ...config.ratelimits[0], namespace_id:'1001' }],
    [{ ...config.ratelimits[0], simple:{limit:900,period:60} }],
    [{ ...config.ratelimits[0], simple:{limit:30,period:3600} }]]) {
    assert.throws(() => verifyStandalonePreviewConfig(replace(config, { ratelimits })), /PREVIEW_RATE_LIMIT_INVALID/);
  }
});

test('activation requires explicit true and validation still blocks production routes', () => {
  const config = valid();
  const activated = replace(config, { vars: {...config.vars, HC_MCP_PREVIEW_ENABLED:'true'} });
  assert.deepEqual(verifyStandalonePreviewConfig(activated, {requireEnabled:true}), {
    hostname:'hoikucolor-mcp-preview-only.hc-team.workers.dev', activated:true,
  });
  assert.throws(() => verifyStandalonePreviewConfig(replace(activated,{routes:['hoikucolor.jp/*']}),{requireEnabled:true}), /PREVIEW_MUST_NOT_ATTACH_TO_EXISTING_SITE/);
});
