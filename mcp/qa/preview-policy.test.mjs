import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bindWorkerMcpSdk, createPreviewGateway, createPreviewSecurity, parsePreviewConfig } from '../preview/preview-policy.mjs';

const makeEnv = (overrides = {}) => ({
  HC_MCP_PREVIEW_ENABLED: 'true',
  HC_MCP_PUBLIC_HOST: 'hc-preview.example.workers.dev',
  HC_MCP_ALLOWED_ORIGINS: 'https://chatgpt.com',
  HC_SUPABASE_URL: 'https://abcdefgh.supabase.co/',
  HC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_example1234',
  HC_MCP_RATE_LIMITER: { async limit() { return { success: true }; } },
  ...overrides,
});

test('preview cannot be activated by deployment defaults or missing enable flag', () => {
  for (const value of [undefined, '', '1', false, 'TRUE']) {
    assert.throws(() => parsePreviewConfig(makeEnv({ HC_MCP_PREVIEW_ENABLED: value })), /HC_PREVIEW_DISABLED/);
  }
});
test('preview host and origins are exact: never arbitrary host, wildcard or HTTP', () => {
  for (const host of ['', '*', 'localhost', '127.0.0.1:8080', 'https://evil.test', 'test..workers.dev']) {
    assert.throws(() => parsePreviewConfig(makeEnv({ HC_MCP_PUBLIC_HOST: host })), /HC_PREVIEW_HOST_INVALID/);
  }
  for (const origin of ['*', 'http://chatgpt.com', 'https://chatgpt.com,https://chatgpt.com', 'https://bad.test/path']) {
    assert.throws(() => parsePreviewConfig(makeEnv({ HC_MCP_ALLOWED_ORIGINS: origin })), /HC_PREVIEW_ORIGINS_INVALID/);
  }
  assert.deepEqual(parsePreviewConfig(makeEnv()).origins, ['https://chatgpt.com']);
});
test('preview refuses privileged keys and untrusted Supabase origins', () => {
  for (const key of ['sb_secret_abc123456', 'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.s', '']) {
    assert.throws(() => parsePreviewConfig(makeEnv({ HC_SUPABASE_PUBLISHABLE_KEY: key })), /HC_PREVIEW_PUBLIC_KEY_REQUIRED/);
  }
  for (const origin of ['http://abcdefgh.supabase.co/', 'https://test.evil.tld/', 'https://abcdefgh.supabase.co/other']) {
    assert.throws(() => parsePreviewConfig(makeEnv({ HC_SUPABASE_URL: origin })), /HC_PREVIEW_SOURCE_INVALID/);
  }
});
test('preview refuses remote execution without rate limiter', () => {
  assert.throws(() => parsePreviewConfig(makeEnv({ HC_MCP_RATE_LIMITER: undefined })), /HC_PREVIEW_RATE_LIMITER_REQUIRED/);
});
test('preview admits only binding-confirmed requests under a constant class key', async () => {
  const usedKeys = [];
  const env = makeEnv({ HC_MCP_RATE_LIMITER: { async limit(input) { usedKeys.push(input.key); return { success: true }; } } });
  const security = createPreviewSecurity(env, parsePreviewConfig(env), () => {});
  assert.equal(await security.admit(), true);
  assert.equal(await security.admit(), true);
  assert.deepEqual(usedKeys, ['hoikucolor-anon-preview', 'hoikucolor-anon-preview']);
  assert.deepEqual(security.allowedOrigins, ['https://chatgpt.com']);
  assert.deepEqual(security.allowedHosts, ['hc-preview.example.workers.dev']);
  assert.equal(security.allowLocalHttp, false);
});
test('rate-limited, malformed and rejected rate limiter responses fail closed', async () => {
  for (const result of [{ success: false }, undefined, { success: 1 }, {}]) {
    const env = makeEnv({ HC_MCP_RATE_LIMITER: { async limit() { return result; } } });
    assert.equal(await createPreviewSecurity(env, parsePreviewConfig(env), () => {}).admit(), false);
  }
  const env = makeEnv({ HC_MCP_RATE_LIMITER: { async limit() { throw new Error('PRIVATE_RATE_LIMIT_ERROR'); } } });
  await assert.rejects(createPreviewSecurity(env, parsePreviewConfig(env), () => {}).admit());
});
test('audit logs only bounded decision classes, not request/user data', async () => {
  const lines = [];
  const env = makeEnv();
  const security = createPreviewSecurity(env, parsePreviewConfig(env), line => { lines.push(JSON.parse(line)); });
  await security.audit({ decision: 'accepted', email: 'secret@example.com', query: 'private query' });
  await security.audit({ decision: 'rate_limited', headers: 'Bearer secret' });
  assert.deepEqual(lines, [
    { source: 'hc-mcp-preview', decision: 'accepted' },
    { source: 'hc-mcp-preview', decision: 'rate_limited' },
  ]);
  await assert.rejects(() => security.audit({ decision: 'unknown' }), /HC_PREVIEW_AUDIT_DECISION_INVALID/);
});
test('preview integrates existing gateway without widening MCP tool permissions', async () => {
  const sdk = { marker: 'official sdk injected' };
  let captured;
  const gateway = createPreviewGateway(sdk, makeEnv(), (actualSdk, config, security) => {
    captured = { actualSdk, config, security };
    return { fetch: async () => new Response('ok', { status: 200 }) };
  }, () => {});
  assert.equal((await gateway.fetch(new Request('https://hc-preview.example.workers.dev/mcp'))).status, 200);
  assert.equal(captured.actualSdk, sdk);
  assert.deepEqual(captured.config, {
    supabaseUrl: 'https://abcdefgh.supabase.co/',
    publishableKey: 'sb_publishable_example1234',
  });
  assert.deepEqual(captured.security.allowedHosts, ['hc-preview.example.workers.dev']);
});

test('Cloudflare Agents handler receives trusted Worker env/ctx and closed CORS policy', async () => {
  const env = makeEnv();
  const ctx = { waitUntil() {} };
  const request = new Request('https://hc-preview.example.workers.dev/mcp', { method: 'POST' });
  const observed = {};
  const bound = bindWorkerMcpSdk({
    McpServer: class StubServer {}, z: {},
    createMcpHandler(factory, options) {
      observed.factory = factory;
      observed.options = options;
      return async (actualRequest, actualEnv, actualCtx) => {
        observed.request = actualRequest;
        observed.env = actualEnv;
        observed.ctx = actualCtx;
        return new Response('ok');
      };
    },
  }, env, ctx);
  const factory = () => ({});
  const gatewayHandler = bound.createMcpHandler(factory, { responseMode: 'json' });
  assert.equal((await gatewayHandler(request)).status, 200);
  assert.equal(observed.factory, factory);
  assert.equal(observed.request, request);
  assert.equal(observed.env, env);
  assert.equal(observed.ctx, ctx);
  assert.equal(observed.options.corsOptions, false);
  assert.deepEqual(observed.options.allowedHostnames, ['hc-preview.example.workers.dev']);
  assert.deepEqual(observed.options.allowedOriginHostnames, ['chatgpt.com']);
  assert.equal(observed.options.responseMode, 'json');
});
test('Cloudflare handler rejects noncallable transports instead of falling back', () => {
  const env = makeEnv();
  const sdk = bindWorkerMcpSdk({
    McpServer: class Stub {}, z: {},
    createMcpHandler: () => ({ fetch() {} }),
  }, env, {});
  assert.throws(() => sdk.createMcpHandler(() => ({}), {}), /HC_PREVIEW_HANDLER_INVALID/);
});


test('preview host cannot impersonate production domains or reuse an unrelated Worker', () => {
  for (const host of [
    'hoikucolor.jp', 'www.hoikucolor.jp',
    'app.hoikupoppy.ai', 'hoikupoppy.ai',
    'preview.hoikucolor.jp', 'mcp-preview.example.com',
    'hoikucolor-main.example.workers.dev',
    'hc-preview.evil.example.workers.dev',
  ]) {
    assert.throws(() => parsePreviewConfig(makeEnv({ HC_MCP_PUBLIC_HOST: host })), /HC_PREVIEW_HOST_INVALID/, host);
  }
  assert.equal(
    parsePreviewConfig(makeEnv({ HC_MCP_PUBLIC_HOST: 'hoikucolor-mcp-preview-only.account.workers.dev' })).host,
    'hoikucolor-mcp-preview-only.account.workers.dev',
  );
  assert.equal(
    parsePreviewConfig(makeEnv({ HC_MCP_PUBLIC_HOST: 'hc-preview.account.workers.dev' })).host,
    'hc-preview.account.workers.dev',
  );
});
