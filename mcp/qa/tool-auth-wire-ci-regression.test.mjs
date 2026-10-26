import assert from 'node:assert/strict';
import test from 'node:test';
import { ensurePublicToolAuthWire } from '../tool-list-auth-wire.mjs';
import { publicJobToolDefinitions } from '../public-jobs.mjs';

const request = new TextEncoder().encode(JSON.stringify({
  jsonrpc: '2.0', id: 21, method: 'tools/list', params: {},
}));
// Independent wire-contract fixture: if a future tool adds unreviewed
// model inputs or output envelopes, the noauth decorator must fail closed.
const contracts = {
  search_public_childcare_jobs: {
    input: ['keyword', 'prefecture', 'employment_type', 'limit', 'offset'],
    output: ['jobs', 'returned', 'reported_total', 'offset', 'requested_limit',
      'next_offset', 'possible_more_source_rows', 'scanned_source_rows', 'note'],
  },
  list_public_childcare_job_filters: {
    input: [], output: ['prefectures', 'employment_types', 'note'],
  },
  get_public_childcare_job: {
    input: ['job_id'], output: ['job', 'note'],
  },
};
const schema = names => ({
  type:'object',
  properties:Object.fromEntries(names.map(name=>[name,{type:'string'}])),
  additionalProperties:false,
});
const tools = () => publicJobToolDefinitions.map(({name}) => ({
  name,
  inputSchema: schema(contracts[name].input),
  outputSchema: schema(contracts[name].output),
  annotations: {readOnlyHint:true, destructiveHint:false, openWorldHint:true},
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

test('does not promote unreviewed candidate data or write-like inputs to noauth', async () => {
  const mutations = [
    list => { list[0].inputSchema.properties.candidate_email = {type:'string'}; },
    list => { list[0].outputSchema.properties.applicants = {type:'array'}; },
    list => { delete list[2].inputSchema.properties.job_id; },
    list => { list[1].outputSchema.properties.saved_jobs = {type:'array'}; },
    list => { list[0].inputSchema.properties = null; },
    list => { list[0].outputSchema.type = 'array'; },
  ];
  for (const change of mutations) {
    const list = tools();
    change(list);
    const guarded = await ensurePublicToolAuthWire(request, response(envelope(list)));
    assert.equal(guarded.status, 503, 'schema drift must fail closed');
    assert.equal((await guarded.text()).includes('candidate_email'), false);
  }
});

test('rejects missing or inaccurate read-only tool annotations', async () => {
  for (const change of [
    tool => { delete tool.annotations.destructiveHint; },
    tool => { tool.annotations.destructiveHint = true; },
    tool => { delete tool.annotations.openWorldHint; },
    tool => { tool.annotations.openWorldHint = false; },
    tool => { tool.annotations.readOnlyHint = false; },
  ]) {
    const list = tools();
    change(list[0]);
    assert.equal((await ensurePublicToolAuthWire(request, response(envelope(list)))).status, 503);
  }
});
