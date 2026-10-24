/**
 * Generate a single-purpose, fail-closed Cloudflare Worker configuration.
 * This NEVER calls Cloudflare and NEVER includes credentials or routes.
 * The output is local-only and must not be committed.
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const PREVIEW_WORKER_NAME = 'hoikucolor-mcp-preview-only';
const SUBDOMAIN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const NAMESPACE = /^[1-9][0-9]*$/;
const LOCKED_FIELDS = new Set([
  'route', 'routes', 'custom_domains', 'zone_id', 'zones',
  'triggers', 'durable_objects', 'd1_databases', 'kv_namespaces',
  'r2_buckets', 'queues', 'services', 'tail_consumers', 'assets',
]);
// Wrangler accepts additional deployment surfaces (for example build hooks
// and unsafe bindings) that are not listed in LOCKED_FIELDS. A configuration
// generated for this anonymous-only preview must contain *only* its reviewed
// fields, even if a later edit uses an unfamiliar Wrangler feature.
const STANDALONE_FIELDS = new Set([
  'name', 'main', 'compatibility_date', 'compatibility_flags',
  'workers_dev', 'vars', 'ratelimits',
]);
const RATE_LIMIT_FIELDS = new Set(['name', 'namespace_id', 'simple']);
const RATE_LIMIT_SIMPLE_FIELDS = new Set(['limit', 'period']);

function exactFields(value, allowed) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).length === allowed.size &&
    Object.keys(value).every(key => allowed.has(key));
}

export function makeStandalonePreviewConfig({ accountSubdomain, rateNamespaceId }) {
  if (typeof accountSubdomain !== 'string' || !SUBDOMAIN.test(accountSubdomain) ||
      accountSubdomain.includes('--')) throw new Error('INVALID_CLOUDFLARE_SUBDOMAIN');
  if (typeof rateNamespaceId !== 'string' || !NAMESPACE.test(rateNamespaceId) ||
      !Number.isSafeInteger(Number(rateNamespaceId)) || rateNamespaceId === '1001') {
    throw new Error('PREVIEW_UNIQUE_RATE_NAMESPACE_REQUIRED');
  }
  const config = {
    name: PREVIEW_WORKER_NAME,
    main: 'worker.mjs',
    compatibility_date: '2026-10-24',
    compatibility_flags: ['nodejs_compat'],
    workers_dev: true,
    vars: {
      HC_MCP_PREVIEW_ENABLED: 'false',
      HC_MCP_PUBLIC_HOST: `${PREVIEW_WORKER_NAME}.${accountSubdomain}.workers.dev`,
      HC_MCP_ALLOWED_ORIGINS: '',
    },
    ratelimits: [{ name: 'HC_MCP_RATE_LIMITER', namespace_id: rateNamespaceId, simple: { limit: 30, period: 60 } }],
  };
  verifyStandalonePreviewConfig(config);
  return config;
}

export function verifyStandalonePreviewConfig(config, { requireEnabled = false } = {}) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) throw new Error('PREVIEW_CONFIG_INVALID');
  if ([...LOCKED_FIELDS].some(field => Object.hasOwn(config, field)) || Object.hasOwn(config, 'env')) {
    throw new Error('PREVIEW_MUST_NOT_ATTACH_TO_EXISTING_SITE');
  }
  if (Object.keys(config).some(field => !STANDALONE_FIELDS.has(field))) {
    throw new Error('PREVIEW_UNEXPECTED_CONFIG_FIELD');
  }
  if (config.name !== PREVIEW_WORKER_NAME || config.main !== 'worker.mjs' || config.workers_dev !== true) {
    throw new Error('PREVIEW_WORKER_IDENTITY_INVALID');
  }
  if (config.compatibility_date !== '2026-10-24' ||
      JSON.stringify(config.compatibility_flags) !== '["nodejs_compat"]') {
    throw new Error('PREVIEW_RUNTIME_INVALID');
  }
  const vars = config.vars;
  if (!vars || typeof vars !== 'object' || Array.isArray(vars) ||
      Object.keys(vars).sort().join(',') !== 'HC_MCP_ALLOWED_ORIGINS,HC_MCP_PREVIEW_ENABLED,HC_MCP_PUBLIC_HOST') {
    throw new Error('PREVIEW_VARIABLES_INVALID');
  }
  const host = vars.HC_MCP_PUBLIC_HOST;
  const prefix = `${PREVIEW_WORKER_NAME}.`;
  if (typeof host !== 'string' || !host.startsWith(prefix) || !host.endsWith('.workers.dev') ||
      !SUBDOMAIN.test(host.slice(prefix.length, -'.workers.dev'.length))) {
    throw new Error('PREVIEW_HOST_MISMATCH');
  }
  if (vars.HC_MCP_ALLOWED_ORIGINS !== '' || !['true', 'false'].includes(vars.HC_MCP_PREVIEW_ENABLED)) {
    throw new Error('PREVIEW_ACTIVATION_INVALID');
  }
  if (requireEnabled && vars.HC_MCP_PREVIEW_ENABLED !== 'true') throw new Error('PREVIEW_DISABLED');
  const limits = config.ratelimits;
  if (!Array.isArray(limits) || limits.length !== 1 ||
      !exactFields(limits[0], RATE_LIMIT_FIELDS) ||
      !exactFields(limits[0]?.simple, RATE_LIMIT_SIMPLE_FIELDS) ||
      limits[0]?.name !== 'HC_MCP_RATE_LIMITER' ||
      typeof limits[0].namespace_id !== 'string' || !NAMESPACE.test(limits[0].namespace_id) ||
      !Number.isSafeInteger(Number(limits[0].namespace_id)) || limits[0].namespace_id === '1001' ||
      limits[0].simple?.limit !== 30 || limits[0].simple?.period !== 60) {
    throw new Error('PREVIEW_RATE_LIMIT_INVALID');
  }
  if (JSON.stringify(config).match(/sb_(?:publishable|secret)_|service_role|HC_SUPABASE_(?:URL|PUBLISHABLE_KEY)/)) {
    throw new Error('PREVIEW_CREDENTIAL_IN_CONFIG');
  }
  return { hostname: host, activated: vars.HC_MCP_PREVIEW_ENABLED === 'true' };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [, , accountSubdomain, rateNamespaceId] = process.argv;
  try {
    const config = makeStandalonePreviewConfig({ accountSubdomain, rateNamespaceId });
    const file = fileURLToPath(new URL('./wrangler.preview.local.json', import.meta.url));
    // Never overwrite an existing reviewed local configuration on another run.
    writeFileSync(file, JSON.stringify(config, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    console.log(`Prepared inactive standalone preview config: ${file}`);
    console.log('No Worker was deployed. Cloudflare secrets and explicit activation remain required.');
  } catch (error) {
    console.error(`Preview configuration refused: ${error?.message || 'INVALID'}`);
    process.exitCode = 1;
  }
}
