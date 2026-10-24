import { createServer } from 'node:http';
import test from 'node:test';
import assert from 'node:assert/strict';
import { runHttpMcpProbe } from './mcp-protocol-probe.mjs';

// Exercises actual Node HTTP sockets and the real global fetch transport.
// The peer is a deliberately synthetic JSON-RPC fixture, NOT the MCP SDK.
test('real loopback HTTP handshake/tools/list/tools/call probe', async () => {
  const methods = [];
  const server = createServer((request, response) => {
    if (request.url !== '/mcp' || request.method !== 'POST') {
      response.writeHead(404).end();
      return;
    }
    let body = '';
    request.setEncoding('utf8');
    request.on('data', chunk => { body += chunk; });
    request.on('end', () => {
      const message = JSON.parse(body);
      methods.push(message.method);
      if (message.method === 'notifications/initialized') {
        response.writeHead(202).end();
        return;
      }
      let result;
      switch (message.method) {
        case 'initialize': result = { protocolVersion: '2025-06-18', capabilities: { tools: {} } }; break;
        case 'tools/list': result = { tools: [
          'search_public_childcare_jobs', 'list_public_childcare_job_filters', 'get_public_childcare_job',
        ].map(name => ({ name, securitySchemes: [{ type: 'noauth' }],
          annotations: { readOnlyHint: true, destructiveHint: false } })) }; break;
        case 'tools/call': {
          const data = message.params.name === 'search_public_childcare_jobs'
            ? { jobs: [], returned: 0, reported_total: 0, offset: 0, requested_limit: 1,
              next_offset: null, possible_more_source_rows: false, scanned_source_rows: 0,
              note: '公開情報のみ' }
            : { prefectures: [], employment_types: [] };
          result = { structuredContent: data, content: [{ type: 'text', text: JSON.stringify(data) }] };
          break;
        }
        default: result = { isError: true };
      }
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ jsonrpc: '2.0', id: message.id, result }));
    });
  });
  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    const { port } = server.address();
    const outcome = await runHttpMcpProbe({ url: `http://127.0.0.1:${port}/mcp` });
    assert.equal(outcome.status, 'PASS');
    assert.equal(outcome.anonymous_search_returned, 0);
    assert.deepEqual(methods, [
      'initialize', 'notifications/initialized', 'tools/list', 'tools/call', 'tools/call',
    ]);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
