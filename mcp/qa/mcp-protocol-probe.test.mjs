import test from 'node:test';
import assert from 'node:assert/strict';
import { runHttpMcpProbe } from './mcp-protocol-probe.mjs';

const nowMs = Date.parse('2026-10-16T01:00:00Z');
const id = '11111111-1111-4111-8111-000000000001';
const tools = ['search_public_childcare_jobs', 'list_public_childcare_job_filters', 'get_public_childcare_job']
  .map(name => ({ name, securitySchemes: [{ type: 'noauth' }],
    annotations: { readOnlyHint: true, destructiveHint: false } }));
const job = {
  id, title: 'Public job', url: `https://hoikucolor.jp/jobs/${id}`,
  published_at: '2026-10-15T03:00:00Z', closing_at: null,
  is_external: true, source_last_verified_at: '2026-10-15T21:00:00Z',
};
function packet(id, result, ctype='application/json') {
  const rpc = { jsonrpc: '2.0', id, result };
  if (ctype === 'text/event-stream') return new Response(`event: message\ndata: ${JSON.stringify(rpc)}\n\n`, { status: 200, headers: { 'content-type': ctype } });
  return Response.json(rpc);
}
function fixture({ listTools = tools, catalogJobs = [job], responseType = 'application/json', session = false,
                   forceError = null, addPrivateField = false, detailOverride = undefined } = {}) {
  const calls = [];
  const fetcher = async (url, options) => {
    const body = JSON.parse(options.body);
    calls.push({ url, options, body });
    const index = calls.length;
    if (forceError === index) return new Response('bad', { status: 503 });
    if (body.method === 'notifications/initialized') return new Response(null, { status: 202 });
    let result;
    switch (body.method) {
      case 'initialize': result = { protocolVersion: '2025-06-18', capabilities: { tools: {} } }; break;
      case 'tools/list': result = { tools: listTools }; break;
      case 'tools/call':
        if (body.params.name === 'search_public_childcare_jobs') result = { structuredContent: {
          jobs: catalogJobs.map(j => addPrivateField ? { ...j, candidate_email: 'PRIVATE@example.com' } : j),
          returned: catalogJobs.length,
          reported_total: catalogJobs.length, offset: 0, requested_limit: 1,
          next_offset: null, possible_more_source_rows: false,
          scanned_source_rows: catalogJobs.length, note: '公開情報のみ',
        } };
        else if (body.params.name === 'get_public_childcare_job') result = { structuredContent: {
          job: detailOverride !== undefined ? detailOverride :
            (catalogJobs.find(x => x.id === body.params.arguments.job_id) ?? null),
          note: '公開情報のみ',
        } };
        else result = { structuredContent: { prefectures: ['東京都'], employment_types: ['正社員'] } };
        break;
      default: throw new Error('unexpected method');
    }
    if (body.method === 'tools/call') {
      result.content = [{ type: 'text', text: JSON.stringify(result.structuredContent) }];
    }
    const res = packet(body.id, result, responseType);
    if (session) res.headers.set('mcp-session-id', 'qa-session-123');
    return res;
  };
  return { fetcher, calls };
}
const base = opts => runHttpMcpProbe({ url: 'https://mcp.hoikucolor.jp/mcp', now: () => nowMs, ...opts });

test('real HTTP method sequence, read-only tools and minimal metrics', async () => {
  const f = fixture();
  const result = await base({ fetcher: f.fetcher });
  assert.deepEqual(result, { status: 'PASS', protocol: '2025-06-18', tools: 3,
    anonymous_search_returned: 1, public_prefectures: 1, public_employment_types: 1,
    detail_state: 'found' });
  assert.deepEqual(f.calls.map(c => c.body.method), ['initialize', 'notifications/initialized',
    'tools/list', 'tools/call', 'tools/call', 'tools/call']);
  assert.equal(f.calls.at(-1).body.params.name, 'get_public_childcare_job');
  assert.deepEqual(f.calls.at(-1).body.params.arguments, { job_id: id });
  assert(f.calls.every(c => !Object.keys(c.options.headers).some(key => /authorization|cookie|api.?key/i.test(key))));
  assert(f.calls.every(c => c.options.redirect === 'error'));
});

test('legacy 2025 SSE responses are parsed and stream is not exposed', async () => {
  const f = fixture({ responseType: 'text/event-stream' });
  assert.equal((await base({ fetcher: f.fetcher })).status, 'PASS');
});

test('stateless HTTP permits zero public jobs', async () => {
  assert.equal((await base({ fetcher: fixture({ catalogJobs: [] }).fetcher })).anonymous_search_returned, 0);
});

test('MCP session id is carried between requests when server provides it', async () => {
  const f = fixture({ session: true });
  await base({ fetcher: f.fetcher });
  assert.equal(f.calls[1].options.headers['mcp-session-id'], 'qa-session-123');
});

test('any extra tool or a write-capable tool fails closed', async () => {
  const plus = [...tools, { name: 'send_application', annotations: { readOnlyHint: false } }];
  await assert.rejects(base({ fetcher: fixture({ listTools: plus }).fetcher }), /PROBE_UNEXPECTED_TOOL_EXPOSURE/);
  const bad = tools.map(x => ({ ...x, annotations: { ...x.annotations, destructiveHint: true } }));
  await assert.rejects(base({ fetcher: fixture({ listTools: bad }).fetcher }), /PROBE_UNEXPECTED_TOOL_EXPOSURE/);
});

test('detects private fields in public job results', async () => {
  await assert.rejects(base({ fetcher: fixture({ addPrivateField: true }).fetcher }), /PROBE_PRIVATE_FIELD_DETECTED/);
});

test('detects expired jobs and stale external listings', async () => {
  await assert.rejects(base({ fetcher: fixture({ catalogJobs: [{ ...job, closing_at: '2026-10-15T00:00:00Z' }] }).fetcher }), /PROBE_CLOSED_JOB_LEAK/);
  await assert.rejects(base({ fetcher: fixture({ catalogJobs: [{ ...job, source_last_verified_at: '2026-10-15T00:00:00Z' }] }).fetcher }), /PROBE_STALE_EXTERNAL_JOB_LEAK/);
});

test('transport failures and HTML error pages do not pass as MCP results', async () => {
  await assert.rejects(base({ fetcher: fixture({ forceError: 3 }).fetcher }), /PROBE_HTTP_STATUS_INVALID/);
  await assert.rejects(base({ fetcher: async () => { throw Error('secret=do-not-echo'); } }), /PROBE_TRANSPORT_FAILURE/);
});

test('refuses non-HTTPS remote endpoint and arbitrary URL paths and userinfo', async () => {
  await assert.rejects(runHttpMcpProbe({ url: 'http://mcp.hoikucolor.jp/mcp' }), /PROBE_URL_NOT_ALLOWED/);
  await assert.rejects(runHttpMcpProbe({ url: 'https://mcp.hoikucolor.jp/admin' }), /PROBE_URL_NOT_ALLOWED/);
  await assert.rejects(runHttpMcpProbe({ url: 'https://token:mypass@mcp.hoikucolor.jp/mcp' }), /PROBE_URL_NOT_ALLOWED/);
});

test('accepts local HTTP loopback only when used explicitly for QA', async () => {
  const f = fixture();
  assert.equal((await runHttpMcpProbe({ url: 'http://127.0.0.1:3107/mcp', fetcher: f.fetcher, now: () => nowMs })).status, 'PASS');
});

test('text content cannot smuggle private data outside structuredContent', async () => {
  const f = fixture();
  const original = f.fetcher;
  const fetcher = async (...args) => {
    const response = await original(...args);
    const req = JSON.parse(args[1].body);
    if (req.method !== 'tools/call') return response;
    const body = await response.json();
    body.result.content[0].text = JSON.stringify({ ...body.result.structuredContent, candidate_email: 'PRIVATE@example.com' });
    return Response.json(body);
  };
  await assert.rejects(base({ fetcher }), /PROBE_TOOL_CONTENT_MISMATCH/);
});

test('search metadata cannot expose applicant records as top-level fields', async () => {
  const f = fixture();
  const original = f.fetcher;
  const fetcher = async (...args) => {
    const response = await original(...args);
    const req = JSON.parse(args[1].body);
    if (req.method !== 'tools/call' || req.params.name !== 'search_public_childcare_jobs') return response;
    const body = await response.json();
    body.result.structuredContent.applicants = [{ email: 'PRIVATE@example.com' }];
    body.result.content[0].text = JSON.stringify(body.result.structuredContent);
    return Response.json(body);
  };
  await assert.rejects(base({ fetcher }), /PROBE_PRIVATE_FIELD_DETECTED/);
});

test('nested private data in job fields are rejected', async () => {
  const malicious = { ...job, description: { candidate_email: 'PRIVATE@example.com' } };
  await assert.rejects(base({ fetcher: fixture({ catalogJobs: [malicious] }).fetcher }), /PROBE_PRIVATE_FIELD_DETECTED/);
});

test('legacy detail lookup rejects wrong IDs and candidate fields', async () => {
  const mismatch = { ...job, id: '22222222-2222-4222-8222-000000000002',
    url: 'https://hoikucolor.jp/jobs/22222222-2222-4222-8222-000000000002' };
  await assert.rejects(base({ fetcher: fixture({ detailOverride: mismatch }).fetcher }),
    /PROBE_DETAIL_ID_MISMATCH/);
  await assert.rejects(base({ fetcher: fixture({ detailOverride: { ...job,
    applicant_email: 'PRIVATE@example.com' } }).fetcher }), /PROBE_PRIVATE_FIELD_DETECTED/);
  assert.equal((await base({ fetcher: fixture({ detailOverride: null }).fetcher })).detail_state, 'disappeared');
});

test('legacy anonymous tool metadata must advertise noauth only', async () => {
  const altered = tools.map(x => ({ ...x,
    securitySchemes: [{ type: 'oauth2', scopes: ['candidate:read'] }] }));
  await assert.rejects(base({ fetcher: fixture({ listTools: altered }).fetcher }),
    /PROBE_UNEXPECTED_TOOL_EXPOSURE/);
});

test('legacy strict acceptance rejects an empty public feed', async () => {
  await assert.rejects(base({ fetcher: fixture({ catalogJobs: [] }).fetcher,
    requirePublished: true }), /PROBE_PUBLIC_CATALOG_EMPTY/);
});
