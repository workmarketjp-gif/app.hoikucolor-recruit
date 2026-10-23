/**
 * Isolated Cloudflare Worker preview admission policy for Hoiku Color's
 * existing anonymous-only MCP gateway. No deployment or account writes here.
 * This policy is intentionally not an OAuth implementation.
 */

const REMOTE_HOST = /^(?:[a-z0-9-]+\.)+[a-z0-9-]+$/i;
const SECURE_ORIGIN = /^https:\/\/(?:[a-z0-9-]+\.)+[a-z0-9-]+(?::443)?$/i;

export function parsePreviewConfig(env) {
  if (!env || typeof env !== 'object') throw new Error('HC_PREVIEW_CONFIG_MISSING');
  // Fail closed even if somebody deploys the example Worker accidentally.
  if (env.HC_MCP_PREVIEW_ENABLED !== 'true') throw new Error('HC_PREVIEW_DISABLED');
  const host = env.HC_MCP_PUBLIC_HOST;
  if (typeof host !== 'string' || !REMOTE_HOST.test(host) || host.length > 253 ||
      host.includes('..') || host.startsWith('-') || host.endsWith('-')) {
    throw new Error('HC_PREVIEW_HOST_INVALID');
  }
  const originsRaw = env.HC_MCP_ALLOWED_ORIGINS ?? '';
  if (typeof originsRaw !== 'string' || originsRaw.length > 1000) throw new Error('HC_PREVIEW_ORIGINS_INVALID');
  const origins = originsRaw === '' ? [] : originsRaw.split(',').map(origin => origin.trim());
  if (origins.length > 8 || new Set(origins).size !== origins.length ||
      origins.some(origin => !SECURE_ORIGIN.test(origin))) {
    throw new Error('HC_PREVIEW_ORIGINS_INVALID');
  }
  if (typeof env.HC_SUPABASE_URL !== 'string' ||
      !/^https:\/\/[a-z0-9-]+\.supabase\.co\/$/i.test(env.HC_SUPABASE_URL)) {
    throw new Error('HC_PREVIEW_SOURCE_INVALID');
  }
  // This preview intentionally accepts only sb_publishable_* public keys;
  // legacy anon JWTs may be supported by the underlying adapter, but the
  // isolated edge deployment is restricted to the newer key type.
  if (typeof env.HC_SUPABASE_PUBLISHABLE_KEY !== 'string' ||
      !/^sb_publishable_[A-Za-z0-9_-]{8,}$/.test(env.HC_SUPABASE_PUBLISHABLE_KEY)) {
    throw new Error('HC_PREVIEW_PUBLIC_KEY_REQUIRED');
  }
  // No fallback to an in-memory limiter at a publicly reachable edge.
  if (typeof env.HC_MCP_RATE_LIMITER?.limit !== 'function') {
    throw new Error('HC_PREVIEW_RATE_LIMITER_REQUIRED');
  }
  return { host, origins, supabaseUrl: env.HC_SUPABASE_URL, publishableKey: env.HC_SUPABASE_PUBLISHABLE_KEY };
}

/**
 * Rate limiting is approximate and *per Cloudflare location*; it is not a
 * globally exact quota. Use a single hard-coded class key, never model input,
 * caller-supplied IP headers, user IDs or tenant names.
 */
export function createPreviewSecurity(env, config, log = console.info) {
  if (typeof log !== 'function') throw new Error('HC_PREVIEW_AUDIT_REQUIRED');
  return {
    allowedHosts: [config.host],
    allowedOrigins: config.origins,
    allowLocalHttp: false,
    async admit() {
      const result = await env.HC_MCP_RATE_LIMITER.limit({ key: 'hoikucolor-anon-preview' });
      return result?.success === true;
    },
    async audit({ decision }) {
      if (decision !== 'accepted' && decision !== 'rate_limited') {
        throw new Error('HC_PREVIEW_AUDIT_DECISION_INVALID');
      }
      // No jobs, query args, URLs, user identity, access tokens, or IPs.
      log(JSON.stringify({ source: 'hc-mcp-preview', decision }));
    },
  };
}

export function createPreviewGateway(sdk, env, createGateway, log = console.info) {
  if (typeof createGateway !== 'function') throw new Error('HC_PREVIEW_GATEWAY_REQUIRED');
  const config = parsePreviewConfig(env);
  return createGateway(sdk, {
    supabaseUrl: config.supabaseUrl,
    publishableKey: config.publishableKey,
  }, createPreviewSecurity(env, config, log));
}
