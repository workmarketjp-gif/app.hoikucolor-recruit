import test from 'node:test';
import assert from 'node:assert/strict';
import { runApprovedPreviewAcceptance } from './approved-preview-acceptance.mjs';

const url = 'https://hoikucolor-mcp-preview-only.hc-workspace.workers.dev/mcp';
const okBoundary = async () => ({ status: 'PASS', checks: 11, changes_performed: false });
const ok = protocol => async () => ({ status: 'PASS', protocol, tools: 3,
  anonymous_search_returned: 1, detail_state: 'found' });
const opts = { url, boundaryRunner: okBoundary,
  modernRunner: ok('2026-07-28'), legacyRunner: ok('2025-06-18') };

test('runs negative boundary first then strict modern and legacy public search-to-detail', async () => {
  const calls = [];
  const result = await runApprovedPreviewAcceptance({ ...opts,
    boundaryRunner: async args => { calls.push(['boundary', args]); return okBoundary(); },
    modernRunner: async args => { calls.push(['modern', args]); return ok('2026-07-28')(); },
    legacyRunner: async args => { calls.push(['legacy', args]); return ok('2025-06-18')(); },
  });
  assert.deepEqual(calls.map(([name]) => name), ['boundary', 'modern', 'legacy']);
  for (const [name, args] of calls) {
    assert.equal(args.url, url);
    if (name !== 'boundary') assert.equal(args.requirePublished, true);
    assert(!Object.keys(args).some(key => /authorization|cookie|secret|token/i.test(key)));
  }
  assert.equal(result.status, 'PASS');
  assert.equal(result.positive_public_search_detail_checks, 2);
  assert.equal(result.changes_performed, false);
  assert.equal(result.candidate_oauth_tested, false);
  assert.equal(result.chatgpt_connection_tested, false);
  assert.equal(JSON.stringify(result).includes('job_id'), false);
});

test('never connects to production, arbitrary HTTPS, userinfo or off-path URLs', async () => {
  const rejected = [
    'https://hoikucolor.jp/mcp', 'https://app.hoikupoppy.ai/mcp',
    'https://hoikucolor-mcp-preview-only.other.example/mcp',
    'http://hoikucolor-mcp-preview-only.hc-workspace.workers.dev/mcp',
    'https://token:secret@hoikucolor-mcp-preview-only.hc-workspace.workers.dev/mcp',
    url + '?token=secret', url + '/unexpected',
  ];
  let calls = 0;
  for (const badUrl of rejected) await assert.rejects(
    runApprovedPreviewAcceptance({ ...opts, url: badUrl, boundaryRunner: async () => { calls++; return okBoundary(); } }),
    /BOUNDARY_URL_NOT_APPROVED_PREVIEW/,
  );
  assert.equal(calls, 0);
});

test('denied boundary failure prevents all positive HTTP calls', async () => {
  let positiveCalls = 0;
  await assert.rejects(runApprovedPreviewAcceptance({ ...opts,
    boundaryRunner: async () => ({ status: 'PASS', checks: 10, changes_performed: false }),
    modernRunner: async () => { positiveCalls++; return ok('2026-07-28')(); },
  }), /PREVIEW_ACCEPTANCE_BOUNDARY_FAILED/);
  assert.equal(positiveCalls, 0);
});

test('zero search, vanished detail or incorrect protocol cannot claim acceptance', async () => {
  for (const wrong of [
    { anonymous_search_returned: 0 }, { detail_state: 'disappeared' },
    { tools: 4 }, { protocol: '2025-06-18' }, { status: 'WARN' },
  ]) {
    await assert.rejects(runApprovedPreviewAcceptance({ ...opts,
      modernRunner: async () => ({ ...(await ok('2026-07-28')()), ...wrong }),
    }), /PREVIEW_ACCEPTANCE_PUBLIC_SEARCH_FAILED/);
  }
  await assert.rejects(runApprovedPreviewAcceptance({ ...opts,
    legacyRunner: ok('2026-07-28'),
  }), /PREVIEW_ACCEPTANCE_PUBLIC_SEARCH_FAILED/);
});

test('network/probe errors fail closed without fabricated success', async () => {
  await assert.rejects(runApprovedPreviewAcceptance({ ...opts,
    modernRunner: async () => { throw new Error('PROBE_TRANSPORT_FAILURE'); },
  }), /PROBE_TRANSPORT_FAILURE/);
  await assert.rejects(runApprovedPreviewAcceptance({ ...opts,
    legacyRunner: async () => { throw new Error('PROBE_PUBLIC_CATALOG_EMPTY'); },
  }), /PROBE_PUBLIC_CATALOG_EMPTY/);
});

test('loopback QA is not eligible for independent HTTPS preview acceptance', async () => {
  await assert.rejects(runApprovedPreviewAcceptance({ ...opts, url: 'http://127.0.0.1:3107/mcp' }),
    /PREVIEW_ACCEPTANCE_REMOTE_HTTPS_REQUIRED/);
});
