import assert from 'node:assert/strict';
import test from 'node:test';
import { publicJobToolDefinitions, publicCatalogToolHandlers } from '../public-jobs.mjs';

const ONLY_PUBLIC_TOOLS = [
  'get_public_childcare_job',
  'list_public_childcare_job_filters',
  'search_public_childcare_jobs',
];

test('HC MCP tool registration exposes only three anonymous read-only catalog tools', () => {
  const definitions = publicJobToolDefinitions;
  assert.deepEqual(definitions.map((tool) => tool.name).sort(), ONLY_PUBLIC_TOOLS);
  for (const tool of definitions) {
    assert.equal(tool.annotations?.readOnlyHint, true);
    assert.equal(tool.annotations?.destructiveHint, false);
    assert.equal(tool.inputSchema?.additionalProperties, false);
    assert.ok(typeof tool.description === 'string' && tool.description.length > 20);
    assert.doesNotMatch(JSON.stringify(tool), /oauth|scope|submit_application|send_message|delete_account|private_profile/i);
  }
});

test('HC MCP dispatch has no authenticated write handlers or candidate accessors', () => {
  const handlers = publicCatalogToolHandlers({
    supabaseUrl: 'https://fixture.supabase.co',
    publishableKey: 'sb_publishable_fixture',
    fetcher: async () => { throw new Error('must not call network'); },
  });
  assert.deepEqual(Object.keys(handlers).sort(), ONLY_PUBLIC_TOOLS);
  for (const name of ONLY_PUBLIC_TOOLS) assert.equal(typeof handlers[name], 'function');
});
