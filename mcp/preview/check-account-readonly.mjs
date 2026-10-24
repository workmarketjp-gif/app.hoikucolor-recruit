/**
 * Read-only Cloudflare account preflight for a NEW HC MCP Preview Worker.
 * Never deploys, creates resources, checks secrets, or assumes approval.
 * The rate-limit namespace must still be checked independently by the owner.
 */
import { pathToFileURL } from 'node:url';

const API = 'https://api.cloudflare.com/client/v4';
const WORKER = 'hoikucolor-mcp-preview-only';
const ACCOUNT_ID = /^[a-f0-9]{32}$/i;
const SUBDOMAIN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const MAX_RESPONSE_BYTES = 1024 * 1024;

async function readCloudflare(path, apiToken, fetcher) {
  let response;
  try {
    response = await fetcher(`${API}${path}`, {
      method: 'GET',
      headers: { authorization: `Bearer ${apiToken}`, accept: 'application/json' },
      redirect: 'error',
      signal: AbortSignal.timeout(8_000),
    });
  } catch {
    throw new Error('CLOUDFLARE_READ_UNAVAILABLE');
  }
  if (!response?.ok) throw new Error('CLOUDFLARE_READ_UNAVAILABLE');
  const declaredLength = response.headers?.get('content-length');
  if (declaredLength && Number(declaredLength) > MAX_RESPONSE_BYTES) {
    throw new Error('CLOUDFLARE_RESPONSE_TOO_LARGE');
  }
  let json;
  try {
    const raw = await response.text();
    if (Buffer.byteLength(raw, 'utf8') > MAX_RESPONSE_BYTES) throw new Error('too large');
    json = JSON.parse(raw);
  } catch {
    throw new Error('CLOUDFLARE_RESPONSE_INVALID');
  }
  if (!json || json.success !== true) throw new Error('CLOUDFLARE_READ_UNAVAILABLE');
  return json;
}

export async function checkCloudflareAccountReadOnly({ accountId, apiToken, expectedSubdomain, fetcher = fetch } = {}) {
  if (typeof accountId !== 'string' || !ACCOUNT_ID.test(accountId) ||
      typeof apiToken !== 'string' || apiToken.trim().length < 10 ||
      typeof expectedSubdomain !== 'string' || !SUBDOMAIN.test(expectedSubdomain) ||
      expectedSubdomain.includes('--') || typeof fetcher !== 'function') {
    throw new Error('CLOUDFLARE_READ_CONFIG_REQUIRED');
  }
  const root = `/accounts/${accountId}/workers`;
  const domain = await readCloudflare(`${root}/subdomain`, apiToken, fetcher);
  if (domain.result?.subdomain !== expectedSubdomain) {
    throw new Error('CLOUDFLARE_WORKERS_SUBDOMAIN_MISMATCH');
  }
  const scripts = await readCloudflare(`${root}/scripts`, apiToken, fetcher);
  if (!Array.isArray(scripts.result) ||
      scripts.result.some(worker => typeof worker?.id !== 'string') ||
      (scripts.result_info && Number(scripts.result_info.total_count) > scripts.result.length)) {
    throw new Error('CLOUDFLARE_WORKER_LIST_INCOMPLETE');
  }
  if (scripts.result.some(worker => worker.id === WORKER)) {
    throw new Error('HC_PREVIEW_WORKER_NAME_ALREADY_USED');
  }
  // Account-level namespace collision cannot be established from the scripts
  // listing API alone. Never misreport a guessed ID as independently unique.
  return Object.freeze({
    checks: 'read_only_cloudflare_account',
    workers_dev_subdomain_matches: true,
    isolated_worker_name_available: true,
    rate_namespace_uniqueness: 'NOT_VERIFIED',
    changes_performed: false,
    approved_to_deploy: false,
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = await checkCloudflareAccountReadOnly({
      accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
      apiToken: process.env.CLOUDFLARE_API_TOKEN,
      expectedSubdomain: process.env.HC_MCP_WORKERS_SUBDOMAIN,
    });
    process.stdout.write(JSON.stringify(result) + '\n');
  } catch (error) {
    // Never print Cloudflare response bodies, token values or account data.
    const code = typeof error?.message === 'string' && /^[A-Z][A-Z0-9_]+$/.test(error.message)
      ? error.message : 'CLOUDFLARE_READ_PRECHECK_FAILED';
    process.stderr.write(`HC_PREVIEW_READ_ONLY_CHECK_FAILED: ${code}\n`);
    process.exitCode = 1;
  }
}
