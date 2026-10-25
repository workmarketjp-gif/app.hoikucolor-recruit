/**
 * Go/no-go check for a separately approved HC MCP HTTPS preview (not production).
 * Executes boundary denials BEFORE live, anonymous, read-only catalog lookups.
 * Does not submit applications, use candidate OAuth, or prove ChatGPT connection.
 */
import { pathToFileURL } from 'node:url';
import { assertBoundaryPreviewUrl, probeAnonymousMcpBoundary } from './anonymous-boundary-live.mjs';
import { runHttpMcpProbe, runModernHttpMcpProbe } from './mcp-protocol-probe.mjs';

const LEGACY = /^2025-/;
const MODERN = '2026-07-28';

export async function runApprovedPreviewAcceptance({
  url, fetcher = globalThis.fetch, now = Date.now,
  boundaryRunner = probeAnonymousMcpBoundary,
  modernRunner = runModernHttpMcpProbe,
  legacyRunner = runHttpMcpProbe,
} = {}) {
  // This intentionally REJECTS arbitrary HTTPS hosts, including HC/HP/LP
  // production endpoints, and credential-bearing URLs. No network before this.
  const endpoint = assertBoundaryPreviewUrl(url);
  if (endpoint.protocol !== 'https:') throw new Error('PREVIEW_ACCEPTANCE_REMOTE_HTTPS_REQUIRED');
  if (typeof fetcher !== 'function' || typeof now !== 'function' ||
      typeof boundaryRunner !== 'function' || typeof modernRunner !== 'function' ||
      typeof legacyRunner !== 'function') throw new Error('PREVIEW_ACCEPTANCE_CONFIG_INVALID');

  const denied = await boundaryRunner({ url, fetcher });
  if (denied?.status !== 'PASS' || denied.checks !== 7 || denied.changes_performed !== false) {
    throw new Error('PREVIEW_ACCEPTANCE_BOUNDARY_FAILED');
  }
  // Run the modern and legacy transports independently, in strict positive
  // mode. The source scanner may be incomplete; an empty search cannot pass.
  // Each underlying probe also checks the public search -> detail identity.
  const results = [];
  for (const runner of [modernRunner, legacyRunner]) {
    const result = await runner({ url, fetcher, now, requirePublished: true });
    const versionMatches = results.length === 0 ?
      result?.protocol === MODERN : LEGACY.test(result?.protocol);
    if (!versionMatches || result?.status !== 'PASS' || result?.tools !== 3 ||
        !Number.isSafeInteger(result?.anonymous_search_returned) ||
        result.anonymous_search_returned < 1 || result.detail_state !== 'found') {
      throw new Error('PREVIEW_ACCEPTANCE_PUBLIC_SEARCH_FAILED');
    }
    results.push(result);
  }
  // Deliberately omit titles, URLs, job UUIDs, search arguments and all
  // transport response bodies from artifacts and logs.
  return Object.freeze({
    status: 'PASS',
    endpoint_class: 'independent_https_preview',
    negative_boundary_checks: denied.checks,
    modern_protocol: results[0].protocol,
    legacy_protocol: results[1].protocol,
    positive_public_search_detail_checks: results.length,
    candidate_oauth_tested: false,
    chatgpt_connection_tested: false,
    changes_performed: false,
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = await runApprovedPreviewAcceptance({ url: process.env.HC_MCP_URL });
    process.stdout.write(JSON.stringify(result) + '\n');
  } catch (error) {
    const code = error?.message;
    const safe = typeof code === 'string' &&
      /^(?:PREVIEW_ACCEPTANCE|BOUNDARY|PROBE)_[A-Z_]+$/.test(code)
      ? code : 'PREVIEW_ACCEPTANCE_FAILED';
    process.stderr.write('HC_PREVIEW_ACCEPTANCE_FAILED: ' + safe + '\n');
    process.exitCode = 1;
  }
}
