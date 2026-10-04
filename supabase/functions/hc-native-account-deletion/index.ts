// Supabase Edge Function: hc-native-account-deletion (deploy with verify_jwt=false).
// Production-rebased worker v3, reviewed against Clerk BAPI 2026-05-12.
// Invoked only by pg_cron via hc_private.run_native_worker_cron_v1('account_deletion'),
// which sends the Vault-held worker secret in `x-hc-worker-secret`.
//
// Clerk instance safety: this Supabase project serves several Clerk instances. The
// worker uses only the Hoiku Color instance key (CLERK_HOIKU_COLOR_SECRET_KEY) and,
// before claiming any request, proves that key belongs to the same instance as the
// Hoiku Color publishable key by matching JWKS key ids. A mismatched key would turn
// every user lookup into a 404 and silently "complete" deletions, so it fails closed.
//
// Stages:
// requested -> processing/identity_freeze -> storage_cleanup -> database_cleanup
// -> identity_delete -> completed
//
// Identity safety:
// - If the Clerk principal is ONLY a Hoiku Color candidate identity, ban it at
//   processing start to revoke sessions, then delete it after HC data cleanup.
// - If the same Clerk principal has durable Hoiku Office/Poppy identity, never
//   ban/delete that shared principal. Only the Hoiku Color candidate account/data
//   is erased/anonymized.

import { createClient } from 'npm:@supabase/supabase-js@2';

type Claim = {
  request_id: string;
  clerk_user_id: string;
  processing_stage: 'identity_freeze' | 'storage_cleanup' | 'database_cleanup' | 'identity_delete';
  identity_action: 'delete_clerk' | 'preserve_shared' | null;
  shared_identity: boolean | null;
  attempt_count: number;
};

type PreparedIdentity = {
  request_id: string;
  clerk_user_id: string;
  shared_identity: boolean;
  identity_action: 'delete_clerk' | 'preserve_shared';
};

type StorageManifest = { bucket: string; storage_paths: string[] };

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false } },
);

const CLERK_API = 'https://api.clerk.com/v1';
const CLERK_API_VERSION = '2026-05-12';

function requiredEnv(name: string) {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`MISSING_${name}`);
  return value;
}

function clerkHeaders() {
  return {
    Authorization: `Bearer ${requiredEnv('CLERK_HOIKU_COLOR_SECRET_KEY')}`,
    'Clerk-API-Version': CLERK_API_VERSION,
    'Content-Type': 'application/json',
  };
}

function frontendApiHost(publishableKey: string) {
  const match = publishableKey.trim().match(/pk_(?:test|live)_([A-Za-z0-9+/=_-]+)/);
  if (!match) throw new Error('CLERK_HOIKU_COLOR_PUBLIC_KEY_INVALID');
  const decoded = atob(match[1].replace(/-/g, '+').replace(/_/g, '/'));
  const host = decoded.replace(/\$$/, '');
  if (!/^[a-z0-9.-]+$/i.test(host)) throw new Error('CLERK_HOIKU_COLOR_PUBLIC_KEY_INVALID');
  return host;
}

async function jwksKeyIds(url: string, headers?: Record<string, string>) {
  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error(`CLERK_JWKS_HTTP_${response.status}`);
  const payload = await response.json().catch(() => null) as { keys?: Array<{ kid?: string }> } | null;
  return new Set((payload?.keys || []).map((key) => key.kid).filter((kid): kid is string => Boolean(kid)));
}

// Fail closed unless the secret key and the Hoiku Color publishable key share a signing key.
async function assertHoikuColorClerkInstance() {
  const host = frontendApiHost(requiredEnv('CLERK_HOIKU_COLOR_PUBLIC_KEY'));
  const [frontend, backend] = await Promise.all([
    jwksKeyIds(`https://${host}/.well-known/jwks.json`),
    jwksKeyIds(`${CLERK_API}/jwks`, clerkHeaders()),
  ]);
  if (![...backend].some((kid) => frontend.has(kid))) throw new Error('CLERK_INSTANCE_MISMATCH');
}

async function clerkMutation(userId: string, operation: 'ban' | 'delete') {
  const path = operation === 'ban'
    ? `/users/${encodeURIComponent(userId)}/ban`
    : `/users/${encodeURIComponent(userId)}`;
  const response = await fetch(`${CLERK_API}${path}`, {
    method: operation === 'ban' ? 'POST' : 'DELETE',
    headers: clerkHeaders(),
  });
  if (response.status === 404 || response.ok) return;
  if (response.status === 429 || response.status >= 500) {
    throw new Error(`CLERK_${operation.toUpperCase()}_TRANSIENT_${response.status}`);
  }
  throw new Error(`CLERK_${operation.toUpperCase()}_PERMANENT_${response.status}`);
}

async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw new Error(`${name.toUpperCase()}_FAILED`);
  return data as T;
}

async function advance(requestId: string, workerId: string, expected: string, next: string) {
  const ok = await rpc<boolean>('hc_jobseeker_advance_account_deletion_v2', {
    p_request_id: requestId,
    p_worker_id: workerId,
    p_expected_stage: expected,
    p_next_stage: next,
  });
  if (!ok) throw new Error('ACCOUNT_DELETION_STAGE_ADVANCE_FAILED');
}

function chunks<T>(items: T[], size: number) {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) result.push(items.slice(i, i + size));
  return result;
}

async function removeStorage(manifest: StorageManifest) {
  const paths = [...new Set((manifest.storage_paths || []).filter(Boolean))];
  for (const part of chunks(paths, 100)) {
    const { error } = await supabase.storage.from(manifest.bucket).remove(part);
    if (error) throw new Error('ACCOUNT_DELETION_STORAGE_REMOVE_FAILED');
  }
}

async function processClaim(initial: Claim, workerId: string) {
  let stage = initial.processing_stage;
  let identityAction = initial.identity_action;
  let clerkUserId = initial.clerk_user_id;

  if (stage === 'identity_freeze') {
    const prepared = await rpc<PreparedIdentity>('hc_jobseeker_prepare_account_deletion_v2', {
      p_request_id: initial.request_id,
      p_worker_id: workerId,
    });
    identityAction = prepared.identity_action;
    clerkUserId = prepared.clerk_user_id;
    if (identityAction === 'delete_clerk') await clerkMutation(clerkUserId, 'ban');
    await advance(initial.request_id, workerId, 'identity_freeze', 'storage_cleanup');
    stage = 'storage_cleanup';
  }

  if (stage === 'storage_cleanup') {
    const manifest = await rpc<StorageManifest>('hc_jobseeker_account_deletion_manifest_v2', {
      p_request_id: initial.request_id,
      p_worker_id: workerId,
    });
    await removeStorage(manifest);
    await advance(initial.request_id, workerId, 'storage_cleanup', 'database_cleanup');
    stage = 'database_cleanup';
  }

  if (stage === 'database_cleanup') {
    await rpc('hc_jobseeker_apply_account_deletion_v2', {
      p_request_id: initial.request_id,
      p_worker_id: workerId,
    });
    await advance(initial.request_id, workerId, 'database_cleanup', 'identity_delete');
    stage = 'identity_delete';
  }

  if (stage === 'identity_delete') {
    if (!identityAction) throw new Error('ACCOUNT_DELETION_IDENTITY_ACTION_MISSING');
    if (identityAction === 'delete_clerk') await clerkMutation(clerkUserId, 'delete');
    const completed = await rpc<boolean>('hc_jobseeker_complete_account_deletion_v2', {
      p_request_id: initial.request_id,
      p_worker_id: workerId,
    });
    if (!completed) throw new Error('ACCOUNT_DELETION_COMPLETE_FAILED');
  }
}

function safeErrorCode(error: unknown) {
  const raw = String((error as { message?: unknown } | null)?.message ?? 'WORKER_ERROR');
  return raw.replace(/[^A-Za-z0-9_.:-]/g, '').slice(0, 160) || 'WORKER_ERROR';
}

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

Deno.serve(async (request: Request) => {
  if (request.method !== 'POST') return json(405, { ok: false, code: 'METHOD_NOT_ALLOWED' });

  const { data: authorized, error: authError } = await supabase.rpc('hc_native_worker_authorize_v1', {
    p_worker: 'account_deletion',
    p_secret: request.headers.get('x-hc-worker-secret') ?? '',
  });
  if (authError) return json(500, { ok: false, code: 'WORKER_AUTH_LOOKUP_FAILED' });
  if (authorized !== true) return json(401, { ok: false, code: 'UNAUTHORIZED' });

  const workerId = `hc-account-delete:${crypto.randomUUID()}`;
  try {
    // Before any lease is taken: wrong or missing Clerk configuration must not touch requests.
    await assertHoikuColorClerkInstance();

    const claims = await rpc<Claim[]>('hc_jobseeker_claim_account_deletion_v2', {
      p_worker_id: workerId,
      p_limit: 5,
    });
    let completed = 0;
    let retried = 0;
    for (const claim of claims || []) {
      try {
        await processClaim(claim, workerId);
        completed += 1;
      } catch (error) {
        await rpc('hc_jobseeker_retry_account_deletion_v2', {
          p_request_id: claim.request_id,
          p_worker_id: workerId,
          p_error_code: safeErrorCode(error),
        }).catch(() => undefined);
        retried += 1;
      }
    }
    return new Response(JSON.stringify({ ok: true, claimed: claims?.length || 0, completed, retried }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ ok: false, code: safeErrorCode(error) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
