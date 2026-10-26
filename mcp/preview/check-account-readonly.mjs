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
const NAMESPACE_ID = /^[1-9][0-9]*$/;
const SCRIPT_ID = /^[a-z0-9][a-z0-9_-]{0,127}$/i;
const MAX_NAMESPACE_SCAN_WORKERS = 100;
const NAMESPACE_SCAN_CONCURRENCY = 4;

function validNamespaceId(id) {
  return typeof id === 'string' && NAMESPACE_ID.test(id) &&
    Number.isSafeInteger(Number(id));
}

/**
 * Cloudflare ratelimit namespaces share counters across Workers. Scan every
 * current Worker version's binding metadata before authorizing a fresh ID.
 * A 403, missing bindings array or oversized inventory is NOT proof of
 * uniqueness. This is a read-only snapshot, not a deployment lease.
 */
async function checkNamespaceUnused({ root, scripts, rateNamespaceId, apiToken, fetcher }) {
  if (scripts.length > MAX_NAMESPACE_SCAN_WORKERS ||
      scripts.some(script => !SCRIPT_ID.test(script.id))) {
    throw new Error('CLOUDFLARE_RATE_NAMESPACE_SCAN_INCOMPLETE');
  }
  const requested = Number(rateNamespaceId);
  for (let index = 0; index < scripts.length; index += NAMESPACE_SCAN_CONCURRENCY) {
    await Promise.all(scripts.slice(index, index + NAMESPACE_SCAN_CONCURRENCY).map(async script => {
      const settings = await readCloudflare(
        `${root}/scripts/${encodeURIComponent(script.id)}/settings`, apiToken, fetcher,
      );
      const bindings = settings.result?.bindings;
      if (!Array.isArray(bindings) ||
          bindings.some(binding => !binding || typeof binding !== 'object' ||
            typeof binding.type !== 'string')) {
        throw new Error('CLOUDFLARE_RATE_NAMESPACE_SCAN_INCOMPLETE');
      }
      for (const binding of bindings) {
        if (binding.type !== 'ratelimit') continue;
        if (!validNamespaceId(binding.namespace_id)) {
          throw new Error('CLOUDFLARE_RATE_NAMESPACE_SCAN_INCOMPLETE');
        }
        if (Number(binding.namespace_id) === requested) {
          throw new Error('HC_PREVIEW_RATE_NAMESPACE_ALREADY_USED');
        }
      }
    }));
  }
}


/**
 * Cloudflare's JSON inventory is untrusted network input. Content-Length can
 * be absent or false; bound ACTUAL streamed bytes and body completion time.
 * Do not buffer response.text() before enforcing the limit.
 */
export async function readBoundedCloudflareJson(response, { deadlineMs = 8_000 } = {}) {
  if (!Number.isSafeInteger(deadlineMs) || deadlineMs < 1 || deadlineMs > 30_000) {
    throw new Error('CLOUDFLARE_RESPONSE_INVALID');
  }
  const declaredLength = response?.headers?.get?.('content-length');
  if (declaredLength != null &&
      (!/^\d+$/.test(declaredLength) || BigInt(declaredLength) > BigInt(MAX_RESPONSE_BYTES))) {
    throw new Error('CLOUDFLARE_RESPONSE_TOO_LARGE');
  }
  if (!response?.body || typeof response.body.getReader !== 'function') {
    throw new Error('CLOUDFLARE_RESPONSE_INVALID');
  }

  let reader;
  let timer;
  let complete = false;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('CLOUDFLARE_RESPONSE_TIMEOUT')), deadlineMs);
  });
  try {
    reader = response.body.getReader();
    const chunks = [];
    let received = 0;
    while (true) {
      const { done, value } = await Promise.race([reader.read(), deadline]);
      if (done) { complete = true; break; }
      if (!(value instanceof Uint8Array)) throw new Error('CLOUDFLARE_RESPONSE_INVALID');
      received += value.byteLength;
      if (received > MAX_RESPONSE_BYTES) throw new Error('CLOUDFLARE_RESPONSE_TOO_LARGE');
      chunks.push(value);
    }
    const bytes = new Uint8Array(received);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch (error) {
    if (error?.message === 'CLOUDFLARE_RESPONSE_TOO_LARGE' ||
        error?.message === 'CLOUDFLARE_RESPONSE_TIMEOUT') throw error;
    throw new Error('CLOUDFLARE_RESPONSE_INVALID');
  } finally {
    clearTimeout(timer);
    if (reader) {
      if (!complete) {
        // Cancellation may itself stall; do not wait for an untrusted stream.
        try { void reader.cancel().catch(() => {}); } catch { /* already closed */ }
      }
      try { reader.releaseLock(); } catch { /* pending read cancellation */ }
    }
  }
}

async function readCloudflare(path, apiToken, fetcher) {
  let response;
  try {
    response = await fetcher(API + path, {
      method: 'GET',
      headers: { authorization: 'Bearer ' + apiToken, accept: 'application/json' },
      redirect: 'error',
      signal: AbortSignal.timeout(8_000),
    });
  } catch {
    throw new Error('CLOUDFLARE_READ_UNAVAILABLE');
  }
  if (!response?.ok) throw new Error('CLOUDFLARE_READ_UNAVAILABLE');
  const json = await readBoundedCloudflareJson(response);
  if (!json || json.success !== true) throw new Error('CLOUDFLARE_READ_UNAVAILABLE');
  return json;
}

export async function checkCloudflareAccountReadOnly({ accountId, apiToken, expectedSubdomain, rateNamespaceId, fetcher = fetch } = {}) {
  if (typeof accountId !== 'string' || !ACCOUNT_ID.test(accountId) ||
      typeof apiToken !== 'string' || apiToken.trim().length < 10 ||
      typeof expectedSubdomain !== 'string' || !SUBDOMAIN.test(expectedSubdomain) ||
      expectedSubdomain.includes('--') || typeof fetcher !== 'function' ||
      (rateNamespaceId !== undefined && (!validNamespaceId(rateNamespaceId) || rateNamespaceId === '1001'))) {
    throw new Error('CLOUDFLARE_READ_CONFIG_REQUIRED');
  }
  const root = `/accounts/${accountId}/workers`;
  const domain = await readCloudflare(`${root}/subdomain`, apiToken, fetcher);
  if (domain.result?.subdomain !== expectedSubdomain) {
    throw new Error('CLOUDFLARE_WORKERS_SUBDOMAIN_MISMATCH');
  }
  const scripts = await readCloudflare(`${root}/scripts`, apiToken, fetcher);
  const list = scripts.result;
  // Cloudflare documents this endpoint as a single-page list. When it
  // supplies result_info as well, treat ANY inconsistent or malformed
  // metadata as incomplete; a truncated inventory must not authorize a
  // supposedly unused Worker name. Never guess missing totals as zero.
  const info = scripts.result_info;
  if (!Array.isArray(list) ||
      list.some(worker => typeof worker?.id !== 'string' || !worker.id.trim()) ||
      new Set(Array.isArray(list) ? list.map(worker => worker.id.toLowerCase()) : []).size !== list?.length ||
      (info !== undefined && (
        !info || typeof info !== 'object' || Array.isArray(info) ||
        !Number.isSafeInteger(info.total_count) || info.total_count !== list.length ||
        (info.count !== undefined && (!Number.isSafeInteger(info.count) || info.count !== list.length))
      ))) {
    throw new Error('CLOUDFLARE_WORKER_LIST_INCOMPLETE');
  }
  // Fail closed on case variants as well, even if Cloudflare normalizes
  // script IDs differently from the local configuration.
  if (list.some(worker => worker.id.toLowerCase() === WORKER)) {
    throw new Error('HC_PREVIEW_WORKER_NAME_ALREADY_USED');
  }
  // Only mark the candidate rate namespace as checked when every current
  // Worker settings response was read and inspected successfully.
  if (rateNamespaceId !== undefined) {
    await checkNamespaceUnused({ root, scripts: list, rateNamespaceId, apiToken, fetcher });
  }
  return Object.freeze({
    checks: 'read_only_cloudflare_account',
    workers_dev_subdomain_matches: true,
    isolated_worker_name_available: true,
    rate_namespace_uniqueness: rateNamespaceId === undefined ?
      'NOT_VERIFIED' : 'VERIFIED_UNUSED_IN_CURRENT_WORKER_SETTINGS',
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
      rateNamespaceId: process.env.HC_MCP_RATE_NAMESPACE_ID || undefined,
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
