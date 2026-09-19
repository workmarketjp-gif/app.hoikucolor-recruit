// PREPARED ONLY — Production-rebased Supabase Edge Function style worker v3.
// No deployment/schedule is performed by this artifact. Reviewed against Clerk BAPI 2026-05-12.
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
    Authorization: `Bearer ${requiredEnv('CLERK_SECRET_KEY')}`,
    'Clerk-API-Version': CLERK_API_VERSION,
    'Content-Type': 'application/json',
  };
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

Deno.serve(async (request: Request) => {
  const expectedSecret = requiredEnv('HC_ACCOUNT_DELETION_WORKER_SECRET');
  if (request.headers.get('Authorization') !== `Bearer ${expectedSecret}`) {
    return new Response(JSON.stringify({ ok: false, code: 'UNAUTHORIZED' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const workerId = `hc-account-delete:${crypto.randomUUID()}`;
  try {
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
