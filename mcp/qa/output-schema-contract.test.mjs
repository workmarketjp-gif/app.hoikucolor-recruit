import assert from 'node:assert/strict';
import test from 'node:test';
import { registerPublicCatalogTools } from '../sdk-bridge.mjs';

// A small recording schema DSL tests the metadata independently of npm/Zod.
function recorder() {
  const make = (kind, shape) => ({ kind, shape,
    strict() { this.strictMode = true; return this; },
    nullable() { return { kind: 'nullable', inner: this }; },
    optional() { return { kind: 'optional', inner: this }; },
    max() { return this; }, min() { return this; }, int() { return this; },
    finite() { return this; }, nonnegative() { return this; }, uuid() { return this; },
    url() { return this; },
  });
  return {
    object: shape => make('object', shape),
    array: inner => make('array', inner),
    string: () => make('string'),
    number: () => make('number'),
    boolean: () => make('boolean'),
  };
}
const config = { supabaseUrl: 'https://example.supabase.co', publishableKey: 'sb_publishable_test' };
function registered() {
  const tools = [];
  registerPublicCatalogTools({ registerTool: (name, descriptor) => tools.push({ name, descriptor }) }, recorder(), config);
  return tools;
}
test('all three read-only tools advertise typed, strict output schemas', () => {
  const tools = registered();
  assert.equal(tools.length, 3);
  for (const { descriptor } of tools) {
    assert.equal(descriptor.annotations.readOnlyHint, true);
    assert.equal(descriptor.outputSchema.kind, 'object');
    assert.equal(descriptor.outputSchema.strictMode, true);
    assert.equal(descriptor.outputSchema.shape.note.kind, 'string');
  }
});
test('search output contract has no candidate, employer-admin or application fields', () => {
  const search = registered()[0].descriptor.outputSchema;
  assert.deepEqual(Object.keys(search.shape), ['jobs','returned','reported_total','offset','requested_limit','note']);
  const jobSchema = search.shape.jobs.shape;
  assert.equal(jobSchema.kind, 'object');
  assert.equal(jobSchema.strictMode, true);
  assert.deepEqual(Object.keys(jobSchema.shape).sort(), [
    'id','title','facility_name','organization_name','facility_type','prefecture','city',
    'employment_type','salary_type','salary_min','salary_max','salary_note',
    'required_qualification','description','published_at','closing_at',
    'is_external','source_name','source_last_verified_at',
    'has_verified_workplace_metrics','url',
  ].sort());
  assert.equal(jobSchema.shape.id.kind, 'string');
  assert.equal(jobSchema.shape.is_external.kind, 'boolean');
  assert.equal(jobSchema.shape.has_verified_workplace_metrics.kind, 'nullable');
});
test('facets and detail advertise distinct typed envelopes', () => {
  const tools = registered();
  assert.deepEqual(Object.keys(tools[1].descriptor.outputSchema.shape), ['prefectures','employment_types','note']);
  assert.equal(tools[1].descriptor.outputSchema.shape.prefectures.kind, 'array');
  assert.equal(tools[2].descriptor.outputSchema.shape.job.kind, 'nullable');
  assert.equal(tools[2].descriptor.outputSchema.shape.job.inner.strictMode, true);
});

test('runtime search and detail projections match declared output schema keys', async () => {
  const id = '11111111-1111-4111-8111-000000000001';
  const row = { id, title: '保育士', is_external: false,
    published_at: '2026-10-15T00:00:00Z', closing_at: null,
    candidate_email: 'hidden@example.invalid', confidential_salary: 999999 };
  const seen = [];
  registerPublicCatalogTools({ registerTool: (name, descriptor, call) => seen.push({ name, descriptor, call }) }, recorder(), {
    ...config, now: () => Date.parse('2026-10-16T00:00:00Z'),
    fetcher: async () => new Response(JSON.stringify([row]), { status: 200 }),
  });
  for (const item of [seen[0], seen[2]]) {
    const result = await item.call(item === seen[0] ? { limit: 1 } : { job_id: id });
    assert.equal(result.isError, undefined);
    assert.equal(JSON.stringify(result).includes('hidden@example.invalid'), false);
    assert.equal(JSON.stringify(result).includes('confidential_salary'), false);
    const envelopeKeys = Object.keys(result.structuredContent).sort();
    assert.deepEqual(envelopeKeys, Object.keys(item.descriptor.outputSchema.shape).sort());
    const job = item === seen[0] ? result.structuredContent.jobs[0] : result.structuredContent.job;
    const jobSchema = item === seen[0]
      ? item.descriptor.outputSchema.shape.jobs.shape
      : item.descriptor.outputSchema.shape.job.inner;
    assert.deepEqual(Object.keys(job).sort(), Object.keys(jobSchema.shape).sort());
  }
});
