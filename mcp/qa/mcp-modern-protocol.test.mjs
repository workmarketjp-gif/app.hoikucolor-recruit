import { createServer } from 'node:http';
import test from 'node:test';
import assert from 'node:assert/strict';
import { runModernHttpMcpProbe } from './mcp-protocol-probe.mjs';

const now = Date.parse('2026-10-16T01:00:00Z');
const id = '11111111-1111-4111-8111-000000000001';
const sampleJob = {
  id, title: 'Published position', published_at: '2026-10-15T12:00:00Z',
  closing_at: null, is_external: true,
  source_last_verified_at: '2026-10-16T00:00:00Z',
  url: `https://hoikucolor.jp/jobs/${id}`,
};
const TOOL_NAMES = ['search_public_childcare_jobs', 'list_public_childcare_job_filters', 'get_public_childcare_job'];
const toolList = TOOL_NAMES.map(name => ({ name, securitySchemes: [{ type: 'noauth' }],
  annotations: { readOnlyHint: true, destructiveHint: false } }));
function makeReply(id, result, sse = false) {
  const payload = { jsonrpc: '2.0', id, result: { resultType: 'complete', ...result } };
  return sse ? new Response(`event: message\ndata: ${JSON.stringify(payload)}\n\n`, {
    headers: { 'content-type': 'text/event-stream' },
  }) : Response.json(payload);
}
function fixture({ jobs = [sampleJob], tools = toolList, sse = false, wrongResultType = false,
                   wrongSession = false, wrongHttpStatus = null, detailOverride = undefined } = {}) {
  const calls = [];
  const fetcher = async (_url, options) => {
    const input = JSON.parse(options.body);
    calls.push({ input, headers: options.headers, options });
    if (wrongHttpStatus !== null) return new Response('unavailable', { status: wrongHttpStatus });
    let result;
    if (input.method === 'server/discover') result = { capabilities: { tools: {} } };
    else if (input.method === 'tools/list') result = { tools };
    else if (input.method === 'tools/call' && input.params.name === 'search_public_childcare_jobs') {
      result = { structuredContent: { jobs, returned: jobs.length,
        reported_total: jobs.length, offset: 0, requested_limit: 1, next_offset: null,
        possible_more_source_rows: false, scanned_source_rows: jobs.length, note: '公開情報のみ' } };
      result.content = [{ type: 'text', text: JSON.stringify(result.structuredContent) }];
    } else if (input.method === 'tools/call' && input.params.name === 'list_public_childcare_job_filters') {
      result = { structuredContent: { prefectures: ['東京都'], employment_types: ['正社員'] } };
      result.content = [{ type: 'text', text: JSON.stringify(result.structuredContent) }];
    } else if (input.method === 'tools/call' && input.params.name === 'get_public_childcare_job') {
      result = { structuredContent: {
        job: detailOverride !== undefined ? detailOverride :
          (jobs.find(x => x.id === input.params.arguments.job_id) ?? null),
        note: '公開情報のみ',
      } };
      result.content = [{ type: 'text', text: JSON.stringify(result.structuredContent) }];
    } else throw new Error('unexpected modern method');
    const response = makeReply(input.id, result, sse);
    if (wrongResultType) {
      const p = JSON.parse(await response.text());
      p.result.resultType = 'input_required';
      return Response.json(p);
    }
    if (wrongSession) response.headers.set('mcp-session-id', 'should-not-appear');
    return response;
  };
  return { calls, fetcher };
}
const probe = f => runModernHttpMcpProbe({ url: 'https://mcp.hoikucolor.jp/mcp', fetcher: f, now: () => now });

test('2026-07-28 stateless discovery and public catalog probe uses no legacy handshake', async () => {
  const f = fixture();
  const result = await probe(f.fetcher);
  assert.deepEqual(result, {
    status: 'PASS', protocol: '2026-07-28', tools: 3,
    anonymous_search_returned: 1, public_prefectures: 1, public_employment_types: 1,
    detail_state: 'found',
  });
  assert.deepEqual(f.calls.map(x => x.input.method), ['server/discover', 'tools/list', 'tools/call', 'tools/call', 'tools/call']);
  assert.equal(f.calls.at(-1).input.params.name, 'get_public_childcare_job');
  assert.deepEqual(f.calls.at(-1).input.params.arguments, { job_id: id });
  for (const { input, headers, options } of f.calls) {
    assert.equal(input.params._meta['io.modelcontextprotocol/protocolVersion'], '2026-07-28');
    assert.equal(typeof input.params._meta['io.modelcontextprotocol/clientInfo'].name, 'string');
    assert.deepEqual(input.params._meta['io.modelcontextprotocol/clientCapabilities'], {});
    assert.equal(headers['mcp-protocol-version'], '2026-07-28');
    assert.equal(headers['mcp-method'], input.method);
    assert.equal(headers['mcp-name'], input.method === 'tools/call' ? input.params.name : undefined);
    assert.equal(options.redirect, 'error');
    assert.equal(headers.cookie, undefined);
    assert.equal(headers.authorization, undefined);
    assert.equal(headers['mcp-session-id'], undefined);
  }
});

test('modern SSE-framed replies are accepted without waiting for a long-lived stream', async () => {
  assert.equal((await probe(fixture({ sse: true }).fetcher)).status, 'PASS');
});

test('modern zero-result search is valid', async () => {
  assert.equal((await probe(fixture({ jobs: [] }).fetcher)).anonymous_search_returned, 0);
});

test('modern request fails if protocol uses an unexpected session ID', async () => {
  await assert.rejects(probe(fixture({ wrongSession: true }).fetcher), /PROBE_MODERN_SESSION_INVALID/);
});

test('modern request fails if server requires input or returns unexpected resultType', async () => {
  await assert.rejects(probe(fixture({ wrongResultType: true }).fetcher), /PROBE_MODERN_RESULT_TYPE_INVALID/);
});

test('modern request fails when publication data contains applicant-only fields', async () => {
  await assert.rejects(probe(fixture({ jobs: [{ ...sampleJob, candidate_phone: '+64111222333' }] }).fetcher),
    /PROBE_PRIVATE_FIELD_DETECTED/);
});

test('modern request fails for expired and stale external jobs', async () => {
  await assert.rejects(probe(fixture({ jobs: [{ ...sampleJob, closing_at: '2026-10-15T00:00:00Z' }] }).fetcher),
    /PROBE_CLOSED_JOB_LEAK/);
  await assert.rejects(probe(fixture({ jobs: [{ ...sampleJob, source_last_verified_at: '2026-10-14T00:00:00Z' }] }).fetcher),
    /PROBE_STALE_EXTERNAL_JOB_LEAK/);
});

test('modern request detects unauthorized write tool exposure', async () => {
  const tools = [...toolList, { name: 'submit_application', annotations: { readOnlyHint: false } }];
  await assert.rejects(probe(fixture({ tools }).fetcher), /PROBE_UNEXPECTED_TOOL_EXPOSURE/);
});

test('modern request does not silently retry or fallback to legacy after 401, 403 or 503', async () => {
  for (const status of [401, 403, 503]) {
    const f = fixture({ wrongHttpStatus: status });
    await assert.rejects(probe(f.fetcher), /PROBE_HTTP_STATUS_INVALID/);
    assert.equal(f.calls.length, 1);
  }
});

test('modern transport fails closed on invalid endpoint URLs and network exceptions', async () => {
  await assert.rejects(runModernHttpMcpProbe({ url: 'http://evil.example/mcp' }), /PROBE_URL_NOT_ALLOWED/);
  await assert.rejects(runModernHttpMcpProbe({ url: 'https://evil.example/mcp?token=x' }), /PROBE_URL_NOT_ALLOWED/);
  await assert.rejects(probe(async () => { throw Error('SECRET_HOPEFULLY_NOT_LOGGED'); }), /PROBE_TRANSPORT_FAILURE/);
});

test('real modern HTTP loopback sockets exchange only stateless MCP 2026 requests', async () => {
  const methods = [];
  const server = createServer((req, res) => {
    if (req.method !== 'POST' || req.url !== '/mcp') { res.writeHead(404).end(); return; }
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      const input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      assert.equal(req.headers['mcp-method'], input.method);
      assert.equal(req.headers['mcp-protocol-version'], '2026-07-28');
      methods.push(input.method);
      let result;
      if (input.method === 'server/discover') result = { capabilities: { tools: {} } };
      else if (input.method === 'tools/list') result = { tools: toolList };
      else if (input.method === 'tools/call') {
        const data = input.params.name === 'search_public_childcare_jobs' ? { jobs: [], returned: 0, reported_total: 0, offset: 0, requested_limit: 1,
            next_offset: null, possible_more_source_rows: false, scanned_source_rows: 0,
            note: '公開情報のみ' } : { prefectures: [], employment_types: [] };
        result = { structuredContent: data, content: [{ type: 'text', text: JSON.stringify(data) }] };
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ jsonrpc: '2.0', id: input.id, result: { resultType: 'complete', ...result } }));
    });
  });
  try {
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    const output = await runModernHttpMcpProbe({ url: `http://127.0.0.1:${server.address().port}/mcp` });
    assert.equal(output.protocol, '2026-07-28');
    assert.deepEqual(methods, ['server/discover', 'tools/list', 'tools/call', 'tools/call']);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

function tamperedSearchResult(mutator) {
  const original = fixture().fetcher;
  return async (...args) => {
    const response = await original(...args);
    const input = JSON.parse(args[1].body);
    if (input.method !== 'tools/call' || input.params.name !== 'search_public_childcare_jobs') return response;
    const packet = await response.json();
    mutator(packet.result.structuredContent);
    packet.result.content[0].text = JSON.stringify(packet.result.structuredContent);
    return Response.json(packet);
  };
}

test('real search contract: pagination metadata is mandatory, not a false-positive fixture', async () => {
  const missing = tamperedSearchResult(result => { delete result.next_offset; });
  await assert.rejects(probe(missing), /PROBE_PRIVATE_FIELD_DETECTED/);
  const invalid = tamperedSearchResult(result => { result.next_offset = 501; });
  await assert.rejects(probe(invalid), /PROBE_SEARCH_METADATA_INVALID/);
  const applicant = tamperedSearchResult(result => { result.applicant_profiles = ['private']; });
  await assert.rejects(probe(applicant), /PROBE_PRIVATE_FIELD_DETECTED/);
});

test('preview probe rejects publication even one millisecond early and closing at exact instant', async () => {
  await assert.rejects(
    probe(fixture({ jobs: [{ ...sampleJob, published_at: new Date(now + 1).toISOString() }] }).fetcher),
    /PROBE_JOB_PUBLICATION_INVALID/,
  );
  await assert.rejects(
    probe(fixture({ jobs: [{ ...sampleJob, closing_at: new Date(now).toISOString() }] }).fetcher),
    /PROBE_CLOSED_JOB_LEAK/,
  );
});

test('preview probe accepts publication at exact instant and closure strictly afterward', async () => {
  const exact = {
    ...sampleJob,
    published_at: new Date(now).toISOString(),
    closing_at: new Date(now + 1).toISOString(),
  };
  assert.equal((await probe(fixture({ jobs: [exact] }).fetcher)).anonymous_search_returned, 1);
});

test('modern search validates detail identity and applicant-field exclusion', async () => {
  const mismatch = { ...sampleJob, id: '22222222-2222-4222-8222-000000000002',
    url: 'https://hoikucolor.jp/jobs/22222222-2222-4222-8222-000000000002' };
  await assert.rejects(probe(fixture({ detailOverride: mismatch }).fetcher), /PROBE_DETAIL_ID_MISMATCH/);
  await assert.rejects(probe(fixture({ detailOverride: { ...sampleJob,
    internal_interview_notes: 'PRIVATE' } }).fetcher), /PROBE_PRIVATE_FIELD_DETECTED/);
  assert.equal((await probe(fixture({ detailOverride: null }).fetcher)).detail_state, 'disappeared');
});

test('modern anonymous tool metadata cannot claim candidate OAuth scopes', async () => {
  const altered = toolList.map(x => ({ ...x,
    securitySchemes: [{ type: 'oauth2', scopes: ['candidate:read'] }] }));
  await assert.rejects(probe(fixture({ tools: altered }).fetcher), /PROBE_UNEXPECTED_TOOL_EXPOSURE/);
});

test('modern strict acceptance must obtain at least one actual published job', async () => {
  await assert.rejects(runModernHttpMcpProbe({ url: 'https://mcp.hoikucolor.jp/mcp',
    fetcher: fixture({ jobs: [] }).fetcher, now: () => now, requirePublished: true }),
    /PROBE_PUBLIC_CATALOG_EMPTY/);
});
