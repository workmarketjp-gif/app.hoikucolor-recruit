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
// Separate fixture from the runtime schema definitions so an accidental
// SDK output change cannot silently authorize new nested candidate fields.
const reviewedJobFields = [
  'id','title','facility_name','organization_name','facility_type','prefecture',
  'city','employment_type','salary_type','salary_min','salary_max','salary_note',
  'required_qualification','description','published_at','closing_at',
  'is_external','source_name','source_last_verified_at',
  'has_verified_workplace_metrics','url',
];
const tools = () => publicJobToolDefinitions.map(({name}) => {
  const inputSchema = schema(contracts[name].input);
  const outputSchema = schema(contracts[name].output);
  if (name === 'search_public_childcare_jobs') {
    inputSchema.properties.limit = { type:'integer' };
    inputSchema.properties.offset = { type:'integer' };
    outputSchema.properties.jobs = { type:'array', items:schema(reviewedJobFields) };
  }
  if (name === 'list_public_childcare_job_filters') {
    for (const key of ['prefectures', 'employment_types'])
      outputSchema.properties[key] = { type:'array', items:{ type:'string' } };
  }
  if (name === 'get_public_childcare_job') {
    outputSchema.properties.job = { anyOf:[schema(reviewedJobFields), { type:'null' }] };
  }
  return { name, inputSchema, outputSchema,
    annotations: {readOnlyHint:true, destructiveHint:false, openWorldHint:true} };
});
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

test('refuses open-ended JSON Schemas even when all reviewed property names match', async () => {
  const mutations = [
    list => { list[0].inputSchema.additionalProperties = true; },
    list => { delete list[1].outputSchema.additionalProperties; },
    list => { list[2].inputSchema.additionalProperties = { type: 'string' }; },
    list => { list[0].outputSchema.patternProperties = { '^private_': { type: 'string' } }; },
    list => { list[1].outputSchema.unevaluatedProperties = true; },
  ];
  for (const change of mutations) {
    const list = tools();
    change(list);
    const guarded = await ensurePublicToolAuthWire(request, response(envelope(list)));
    assert.equal(guarded.status, 503, 'a permissive discovery schema must fail closed');
    assert.equal(guarded.headers.get('cache-control'), 'no-store');
    assert.equal((await guarded.text()).includes('private_'), false);
  }
});

test('public noauth discovery rejects unreviewed nested job fields and open-ended objects', async () => {
  const mutations = [
    list => { list[0].outputSchema.properties.jobs.items.properties.applicant_email = { type:'string' }; },
    list => { list[2].outputSchema.properties.job.anyOf[0].properties.internal_interview_notes = { type:'string' }; },
    list => { list[0].outputSchema.properties.jobs.items.additionalProperties = true; },
    list => { list[2].outputSchema.properties.job.anyOf[0].patternProperties = { '^private_': { type:'string' } }; },
    list => { list[0].outputSchema.properties.jobs.items.properties.description = {
      type:'object', properties:{ nested:{ type:'string' } }, additionalProperties:true,
    }; },
    list => { list[0].outputSchema.properties.jobs.items = { $ref:'#/$defs/job' }; },
    list => { list[0].outputSchema.properties.jobs.items = { allOf:[schema(reviewedJobFields),
      { type:'object', properties:{candidate_id:{type:'string'}}, additionalProperties:false }] }; },
    list => { list[0].inputSchema.properties.keyword = {
      type:'object', properties:{ candidate_token:{type:'string'} }, additionalProperties:false,
    }; },
    list => { list[0].inputSchema.properties.limit.type = 'string'; },
    list => { list[1].outputSchema.properties.prefectures.items = {
      type:'object', properties:{ hidden_tenant:{type:'string'} }, additionalProperties:false,
    }; },
  ];
  for (const change of mutations) {
    const list = tools();
    change(list);
    const guarded = await ensurePublicToolAuthWire(request, response(envelope(list)));
    assert.equal(guarded.status, 503, 'all nested schema drift must fail closed');
    assert.equal(guarded.headers.get('cache-control'), 'no-store');
    const text = await guarded.text();
    for (const marker of ['applicant_email','internal_interview_notes','candidate_token',
      'hidden_tenant','private_']) assert.equal(text.includes(marker), false);
  }
});

test('public noauth discovery permits only the reviewed nullable-job representations', async () => {
  const list = tools();
  list[2].outputSchema.properties.job = {
    type:['object','null'],
    properties:schema(reviewedJobFields).properties,
    additionalProperties:false,
  };
  assert.equal((await ensurePublicToolAuthWire(request, response(envelope(list)))).status, 200);
  // An unknown object in the nullable union is not an allowed public-job shape.
  list[2].outputSchema.properties.job.properties.applicant_id = { type:'string' };
  assert.equal((await ensurePublicToolAuthWire(request, response(envelope(list)))).status, 503);
});
