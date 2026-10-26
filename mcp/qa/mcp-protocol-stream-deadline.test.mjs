import test from 'node:test';
import assert from 'node:assert/strict';
import { runHttpMcpProbe, runModernHttpMcpProbe } from './mcp-protocol-probe.mjs';

// Synthetic streaming peers only: no external endpoint, account, or job data.
const url = 'http://127.0.0.1:3107/mcp';
function hangingResponse(contentType, prefix = '', onCancel = () => {}) {
  const bytes = new TextEncoder().encode(prefix);
  return new Response(new ReadableStream({
    start(controller) { if (bytes.length) controller.enqueue(bytes); },
    cancel() { onCancel(); },
  }), { status: 200, headers: { 'content-type': contentType } });
}

test('legacy JSON stream cannot stall indefinitely after response headers', async () => {
  let cancelled = 0;
  await assert.rejects(
    runHttpMcpProbe({
      url, responseDeadlineMs: 35,
      fetcher: async () => hangingResponse('application/json', '{"jsonrpc":', () => cancelled++),
    }), /PROBE_RESPONSE_TIMEOUT/,
  );
  assert.equal(cancelled, 1);
});

test('modern SSE stream must deliver the requested reply before the body deadline', async () => {
  let cancelled = 0;
  await assert.rejects(
    runModernHttpMcpProbe({
      url, responseDeadlineMs: 35,
      fetcher: async () => hangingResponse('text/event-stream', ': heartbeat\n\n', () => cancelled++),
    }), /PROBE_RESPONSE_TIMEOUT/,
  );
  assert.equal(cancelled, 1);
});

test('SSE cancellation is best-effort and cannot trap an otherwise valid reply', async () => {
  let calls = 0;
  let cancellations = 0;
  const initialize = JSON.stringify({
    jsonrpc: '2.0', id: 1,
    result: { protocolVersion: '2025-06-18', capabilities: { tools: {} } },
  });
  const fetcher = async () => {
    if (++calls !== 1) throw new Error('synthetic second-request failure');
    // Simulate a peer that never settles reader.cancel().
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data: ' + initialize + '\n\n'));
      },
      cancel() { cancellations++; return new Promise(() => {}); },
    });
    return new Response(stream, { headers: { 'content-type': 'text/event-stream' } });
  };
  const finished = await Promise.race([
    runHttpMcpProbe({ url, fetcher, responseDeadlineMs: 50 })
      .then(() => 'UNEXPECTED_PASS', err => err.message),
    new Promise(resolve => setTimeout(() => resolve('STUCK_CANCELLATION'), 300)),
  ]);
  assert.equal(finished, 'PROBE_TRANSPORT_FAILURE');
  assert.equal(calls, 2);
  assert.equal(cancellations, 1);
});

test('callers cannot disable or extend the response timeout', async () => {
  for (const responseDeadlineMs of [0, -1, 15001, Infinity, NaN, 1.5]) {
    await assert.rejects(
      runHttpMcpProbe({ url, responseDeadlineMs, fetcher: async () => { throw Error('unexpected'); } }),
      /PROBE_CONFIG_INVALID/,
    );
    await assert.rejects(
      runModernHttpMcpProbe({ url, responseDeadlineMs, fetcher: async () => { throw Error('unexpected'); } }),
      /PROBE_CONFIG_INVALID/,
    );
  }
});
