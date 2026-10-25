import test from 'node:test';
import assert from 'node:assert/strict';
import { assertBoundaryPreviewUrl, probeAnonymousMcpBoundary } from './anonymous-boundary-live.mjs';

const url = 'https://hoikucolor-mcp-preview-only.hc-workspace.workers.dev/mcp';
const denied = ({ url: destination, options }) => {
  const target = new URL(destination);
  if (target.pathname !== '/mcp') return 404;
  if (target.search) return 403;
  if (options.method === 'GET') return 405;
  if (options.headers.authorization || options.headers.cookie || options.headers.origin) return 403;
  if (options.headers['content-type'] !== 'application/json') return 415;
  return 200;
};

test('checks seven remote negative HTTP boundaries without an access token or mutation', async () => {
  const calls = [];
  const fetcher = async (destination, options) => {
    calls.push({ url: destination, options });
    return new Response(null, { status: denied({ url: destination, options }) });
  };
  const result = await probeAnonymousMcpBoundary({ url, fetcher });
  assert.deepEqual(result, { status: 'PASS', checks: 7, changes_performed: false });
  assert.equal(calls.length, 7);
  assert(calls.every(c => c.options.redirect === 'error' && c.options.signal));
  assert(calls.every(c => c.options.method === 'GET' || c.options.method === 'POST'));
  assert(calls.every(c => !/service_role|sb_secret_|candidate:read/.test(JSON.stringify(c))));
  assert.equal(calls.filter(c => c.options.headers.authorization).length, 1);
});

test('refuses production, arbitrary domains, credentials, query parameters and insecure remote URLs', async () => {
  for (const bad of [
    'https://hoikucolor.jp/mcp', 'https://app.hoikupoppy.ai/mcp',
    'https://mcp.random.workers.dev/mcp', 'http://hoikucolor-mcp-preview-only.hc-workspace.workers.dev/mcp',
    'https://token:pass@hoikucolor-mcp-preview-only.hc-workspace.workers.dev/mcp',
    url + '?key=not-allowed', url + '#fragment', url.replace('/mcp', '/admin'),
  ]) {
    assert.throws(() => assertBoundaryPreviewUrl(bad), /BOUNDARY_URL_NOT_APPROVED_PREVIEW/);
  }
});

test('negative probe fails closed if denied request is accidentally accepted', async () => {
  await assert.rejects(probeAnonymousMcpBoundary({ url,
    fetcher: async () => new Response(null, { status: 200 }),
  }), /BOUNDARY_BEARER_NOT_DENIED/);
});

test('network failures use safe codes and never echo a provider body', async () => {
  await assert.rejects(probeAnonymousMcpBoundary({ url,
    fetcher: async () => { throw Error('SECRET-DO-NOT-PRINT'); },
  }), error => error.message === 'BOUNDARY_TRANSPORT_FAILED');
  await assert.rejects(probeAnonymousMcpBoundary({ url,
    fetcher: async () => new Response('private candidate data', { status: 500 }),
  }), error => error.message === 'BOUNDARY_BEARER_NOT_DENIED');
});

test('loopback QA is accepted but arbitrary HTTP target is not', async () => {
  assert.equal(assertBoundaryPreviewUrl('http://127.0.0.1:3107/mcp').port, '3107');
  assert.throws(() => assertBoundaryPreviewUrl('http://127.0.0.2:3107/mcp'),
    /BOUNDARY_URL_NOT_APPROVED_PREVIEW/);
});
