/**
 * HC anonymous catalog: promote explicit per-tool noauth metadata onto the
 * tools/list wire representation when an MCP SDK strips extension fields.
 *
 * Deliberately limited to the three PUBLIC tools after the normal MCP SDK
 * dispatch. It never handles tools/call, any authenticated tool, or candidate
 * data. If tools/list cannot be decoded unambiguously it fails closed rather
 * than sending an incomplete / misleading plugin security declaration.
 *
 * This is a compatibility adapter, not an authentication mechanism.
 */
import { publicJobToolDefinitions } from './public-jobs.mjs';

const MAX_DISCOVERY_REPLY_BYTES = 256 * 1024;
const RESPONSE_DEADLINE_MS = 1_500;
const EXPECTED_NAMES = publicJobToolDefinitions.map(tool => tool.name);

// Tool schemas are an authorization-adjacent public contract: adding a
// candidate field to tools/list must not be silently advertised as noauth.
// Check the SDK-emitted JSON Schema envelope against independently reviewed
// public-only field names before decorating either auth metadata location.
// Nested job/output structure remains protected by the strict Zod schemas and
// the runtime's publicProjection allowlist.
const REVIEWED_PROPERTIES = Object.freeze({
  search_public_childcare_jobs: Object.freeze({
    input: ['keyword', 'prefecture', 'employment_type', 'limit', 'offset'],
    output: ['jobs', 'returned', 'reported_total', 'offset', 'requested_limit',
      'next_offset', 'possible_more_source_rows', 'scanned_source_rows', 'note'],
  }),
  list_public_childcare_job_filters: Object.freeze({
    input: [], output: ['prefectures', 'employment_types', 'note'],
  }),
  get_public_childcare_job: Object.freeze({
    input: ['job_id'], output: ['job', 'note'],
  }),
});
function hasReviewedProperties(schema, expected) {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema) ||
      schema.type !== 'object' ||
      // An SDK/schema drift must never publish an open-ended JSON object as
      // noauth, even if its currently enumerated property names still match.
      schema.additionalProperties !== false ||
      Object.hasOwn(schema, 'patternProperties') ||
      Object.hasOwn(schema, 'unevaluatedProperties') ||
      !schema.properties || typeof schema.properties !== 'object' ||
      Array.isArray(schema.properties)) return false;
  const actual = Object.keys(schema.properties);
  return actual.length === expected.length && expected.every(key => Object.hasOwn(schema.properties, key));
}


/**
 * The three noauth tools may only advertise the reviewed public-job shape,
 * including objects nested below array items and nullable detail results.
 * A strict top-level envelope alone is insufficient: a future SDK/schema
 * drift could expose an applicant field inside jobs.items.properties.
 *
 * Reject opaque references and unreviewed JSON Schema composition keywords:
 * we cannot guarantee their expanded fields stay public at discovery time.
 */
const REVIEWED_PUBLIC_JOB_FIELDS = Object.freeze([
  'id', 'title', 'facility_name', 'organization_name', 'facility_type',
  'prefecture', 'city', 'employment_type', 'salary_type', 'salary_min',
  'salary_max', 'salary_note', 'required_qualification', 'description',
  'published_at', 'closing_at', 'is_external', 'source_name',
  'source_last_verified_at', 'has_verified_workplace_metrics', 'url',
]);
const PUBLIC_INPUT_KINDS = Object.freeze({
  search_public_childcare_jobs: Object.freeze({
    keyword: 'string', prefecture: 'string', employment_type: 'string',
    limit: 'integer', offset: 'integer',
  }),
  list_public_childcare_job_filters: Object.freeze({}),
  get_public_childcare_job: Object.freeze({ job_id: 'string' }),
});
const UNSAFE_SCHEMA_KEYWORDS = [
  '$ref', '$dynamicRef', '$defs', 'definitions', 'patternProperties',
  'unevaluatedProperties', 'unevaluatedItems', 'prefixItems',
  'additionalItems', 'contains', 'not', 'if', 'then', 'else',
  'dependentSchemas', 'propertyNames',
];
function hasClosedNestedSchemas(schema, depth = 0) {
  if (depth > 32 || !schema || typeof schema !== 'object' || Array.isArray(schema) ||
      UNSAFE_SCHEMA_KEYWORDS.some(key => Object.hasOwn(schema, key)) ||
      (Object.hasOwn(schema, 'additionalProperties') && schema.additionalProperties !== false)) {
    return false;
  }
  const isObject = schema.type === 'object' ||
    (Array.isArray(schema.type) && schema.type.includes('object')) ||
    Object.hasOwn(schema, 'properties');
  if (isObject) {
    if (schema.additionalProperties !== false || !schema.properties ||
        typeof schema.properties !== 'object' || Array.isArray(schema.properties) ||
        !Object.values(schema.properties).every(child => hasClosedNestedSchemas(child, depth + 1))) {
      return false;
    }
  }
  if (Object.hasOwn(schema, 'items') && !hasClosedNestedSchemas(schema.items, depth + 1)) return false;
  for (const key of ['anyOf', 'oneOf', 'allOf']) {
    if (Object.hasOwn(schema, key) &&
        (!Array.isArray(schema[key]) || !schema[key].length ||
         !schema[key].every(child => hasClosedNestedSchemas(child, depth + 1)))) return false;
  }
  return true;
}
function hasReviewedPublicJobObject(schema) {
  return hasReviewedProperties(schema, REVIEWED_PUBLIC_JOB_FIELDS);
}
function hasReviewedNullablePublicJob(schema) {
  if (hasReviewedPublicJobObject(schema)) return true;
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) return false;
  // Zod v4 normally serializes nullable objects as anyOf: [object, null].
  const union = schema.anyOf ?? schema.oneOf;
  if (Array.isArray(union)) {
    return union.length === 2 && union.filter(branch => branch?.type === 'null').length === 1 &&
      union.some(branch => hasReviewedPublicJobObject(branch));
  }
  // Permit the equivalent JSON Schema 2020-12 type: ['object', 'null'].
  return Array.isArray(schema.type) && schema.type.length === 2 &&
    schema.type.includes('object') && schema.type.includes('null') &&
    hasReviewedProperties({ ...schema, type: 'object' }, REVIEWED_PUBLIC_JOB_FIELDS);
}
function hasReviewedNestedPublicWire(tool) {
  const { name, inputSchema, outputSchema } = tool;
  if (!hasClosedNestedSchemas(inputSchema) || !hasClosedNestedSchemas(outputSchema)) return false;
  const kinds = PUBLIC_INPUT_KINDS[name];
  if (!kinds || !Object.entries(kinds).every(([key, kind]) =>
    inputSchema.properties[key]?.type === kind &&
    !Object.hasOwn(inputSchema.properties[key], 'properties') &&
    !Object.hasOwn(inputSchema.properties[key], 'items'))) return false;
  if (name === 'search_public_childcare_jobs') {
    const jobs = outputSchema.properties.jobs;
    return jobs?.type === 'array' && hasReviewedPublicJobObject(jobs.items);
  }
  if (name === 'get_public_childcare_job') {
    return hasReviewedNullablePublicJob(outputSchema.properties.job);
  }
  if (name === 'list_public_childcare_job_filters') {
    return ['prefectures', 'employment_types'].every(key => {
      const facet = outputSchema.properties[key];
      return facet?.type === 'array' && facet.items?.type === 'string';
    });
  }
  return false;
}

function isToolListRequest(bytes) {
  try {
    const request = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    return request?.jsonrpc === '2.0' && request?.method === 'tools/list' &&
      (typeof request.id === 'string' || typeof request.id === 'number') &&
      Number.isFinite(typeof request.id === 'number' ? request.id : 0)
      ? request.id : null;
  } catch { return null; }
}

async function boundedResponseText(response) {
  if (!response.body) throw new Error('MCP_DISCOVERY_EMPTY');
  const reader = response.body.getReader();
  const chunks = [];
  let length = 0;
  let deadlineId;
  const deadline = new Promise((_, reject) => {
    deadlineId = setTimeout(() => reject(new Error('MCP_DISCOVERY_TIMEOUT')), RESPONSE_DEADLINE_MS);
  });
  try {
    while (true) {
      const part = await Promise.race([reader.read(), deadline]);
      if (part.done) break;
      length += part.value.byteLength;
      if (length > MAX_DISCOVERY_REPLY_BYTES) throw new Error('MCP_DISCOVERY_TOO_LARGE');
      chunks.push(part.value);
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } finally {
    clearTimeout(deadlineId);
    try { void reader.cancel().catch(() => {}); } catch { /* already closed */ }
    try { reader.releaseLock(); } catch { /* transport already terminated */ }
  }
}

function sseReplies(text) {
  const replies = [];
  for (const block of text.split(/\r?\n\r?\n/)) {
    const lines = block.split(/\r?\n/);
    const dataLines = lines
      .filter(line => line.startsWith('data:'))
      .map(line => line.slice(5).replace(/^ /, ''));
    if (!dataLines.length) continue;
    const eventTypes = lines.filter(line => line.startsWith('event:'))
      .map(line => line.slice(6).trim());
    if (eventTypes.length > 1 || (eventTypes.length && eventTypes[0] !== 'message')) {
      throw new Error('MCP_DISCOVERY_EVENT_TYPE_INVALID');
    }
    replies.push(JSON.parse(dataLines.join('\n')));
  }
  return replies;
}

function decorateEnvelope(envelope, requestId) {
  if (!envelope || envelope.jsonrpc !== '2.0' || envelope.id !== requestId ||
      envelope.error !== undefined || !envelope.result ||
      !Array.isArray(envelope.result.tools) || envelope.result.nextCursor != null ||
      (envelope.result.resultType !== undefined && envelope.result.resultType !== 'complete')) {
    throw new Error('MCP_DISCOVERY_INVALID');
  }
  const tools = envelope.result.tools;
  const names = tools.map(tool => tool?.name);
  if (names.length !== EXPECTED_NAMES.length || names.some((name, i) => name !== EXPECTED_NAMES[i])) {
    throw new Error('MCP_DISCOVERY_TOOLS_UNEXPECTED');
  }
  const decorated = tools.map(tool => {
    const contract = REVIEWED_PROPERTIES[tool.name];
    if (!contract || !hasReviewedProperties(tool.inputSchema, contract.input) ||
      !hasReviewedProperties(tool.outputSchema, contract.output) ||
      !hasReviewedNestedPublicWire(tool)) {
      throw new Error('MCP_DISCOVERY_SCHEMA_DRIFT');
    }
    if (tool.annotations?.readOnlyHint !== true ||
      tool.annotations?.destructiveHint !== false ||
      tool.annotations?.openWorldHint !== true ||
      (tool._meta != null && (typeof tool._meta !== 'object' || Array.isArray(tool._meta)))) {
      throw new Error('MCP_DISCOVERY_METADATA_INVALID');
    }
    for (const existing of [tool.securitySchemes, tool._meta?.securitySchemes]) {
      if (existing !== undefined &&
          (JSON.stringify(existing) !== JSON.stringify([{ type: 'noauth' }]))) {
        throw new Error('MCP_DISCOVERY_AUTH_MISMATCH');
      }
    }
    const noauth = [{ type: 'noauth' }];
    return {
      ...tool,
      securitySchemes: noauth,
      _meta: { ...(tool._meta || {}), securitySchemes: noauth },
    };
  });
  return { ...envelope, result: { ...envelope.result, tools: decorated } };
}

export async function ensurePublicToolAuthWire(requestBody, response) {
  const id = isToolListRequest(requestBody);
  if (id === null || response.status !== 200) return response;
  try {
    const contentType = response.headers.get('content-type')?.toLowerCase() || '';
    const body = await boundedResponseText(response);
    let message;
    if (/^application\/json(?:\s*;|$)/.test(contentType)) {
      message = JSON.parse(body);
    } else if (/^text\/event-stream(?:\s*;|$)/.test(contentType)) {
      const replies = sseReplies(body);
      const matches = replies.filter(item => item?.id === id);
      if (matches.length !== 1) throw new Error('MCP_DISCOVERY_AMBIGUOUS');
      if (replies.some(item => item?.id !== undefined && item.id !== id)) {
        throw new Error('MCP_DISCOVERY_CROSSTALK');
      }
      message = matches[0];
    } else throw new Error('MCP_DISCOVERY_TYPE_INVALID');
    const output = decorateEnvelope(message, id);
    return new Response(JSON.stringify(output), {
      status: 200,
      headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
    });
  } catch {
    return new Response('Service Unavailable', {
      status: 503, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
    });
  }
}
