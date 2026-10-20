import assert from 'node:assert/strict';
import test from 'node:test';
import { ensurePublicToolAuthWire } from '../tool-list-auth-wire.mjs';
import { publicJobToolDefinitions } from '../public-jobs.mjs';

const request = new TextEncoder().encode(JSON.stringify({
  jsonrpc: '2.0', id: 21, method: 'tools/list', params: {},
}));
const tools = () => publicJobToolDefinitions.map(({name}) => ({
  name,
  inputSchema: {type:'object'}, outputSchema: {type:'object'},
  annotations: {readOnlyHint:true, destructiveHint:false},
}));
const envelope = (list = tools()) => ({jsonrpc:'2.0', id:21, result:{tools:list}});
const response = (payload) => Response.json(payload);

test('SDK tools/list wire declares noauth at both metadata locations', async () => {
  const fixed = await ensurePublicToolAuthWire(request, response(envelope()));
  assert.equal(fixed.status, 200);
  const {result} = await fixed.json();
  assert.equal(result.tools.length, 3);
  for (const tool of result.tools) {
    assert.deepEqual(tool.securitySchemes, [{type:'noauth'}]);
    assert.deepEqual(tool._meta.securitySchemes, [{type:'noauth'}]);
  }
});

test('does not rewrite contradictory auth schemes as anonymous', async () => {
  const list = tools();
  list[0].securitySchemes = [{type:'oauth2'}];
  const fixed = await ensurePublicToolAuthWire(request, response(envelope(list)));
  assert.equal(fixed.status, 503);
});

test('rejects wrong request IDs and unexpected non-public tools', async () => {
  assert.equal((await ensurePublicToolAuthWire(request, response({...envelope(),id:22}))).status, 503);
  const list = tools();
  list.push({...list[0], name:'submit_application'});
  assert.equal((await ensurePublicToolAuthWire(request, response(envelope(list)))).status, 503);
});
