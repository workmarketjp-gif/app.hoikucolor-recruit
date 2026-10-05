import { createClient } from '@supabase/supabase-js';

const DEFAULT_SUPABASE_URL = 'https://kcmmpjyngcysdfbumchk.supabase.co';
const DEFAULT_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_0JMZLIzMrL20S58JpNk-jw_lQrtT3H5';

const supabaseUrl = (
  import.meta.env.VITE_SUPABASE_URL ||
  import.meta.env.VITE_PUBLIC_SUPABASE_URL ||
  DEFAULT_SUPABASE_URL
).trim();
const supabaseKey = (
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY ||
  DEFAULT_SUPABASE_PUBLISHABLE_KEY
).trim();
let accessTokenGetter: (() => Promise<string | null>) | null = null;

type ClerkSessionLike = { getToken: () => Promise<string | null> };
type ClerkGlobal = { session?: ClerkSessionLike | null };

function clerkSession(): ClerkSessionLike | null {
  if (typeof window === 'undefined') return null;
  return (window as unknown as { Clerk?: ClerkGlobal }).Clerk?.session ?? null;
}

/** True only while a signed-in session can mint a Supabase access token. */
export function hasActiveSession() {
  return Boolean(accessTokenGetter || clerkSession());
}

// Every candidate route mounts its own ClerkProvider, and some components fetch
// before the provider's effects run. Read the token from the explicit getter when
// one is registered, otherwise straight from the active Clerk session, so the very
// first request of a page is authenticated instead of racing the effect order.
async function currentAccessToken(): Promise<string | null> {
  if (accessTokenGetter) return accessTokenGetter();
  const session = clerkSession();
  return session ? session.getToken() : null;
}

/** Thrown locally (no network request) when a candidate RPC is attempted without a session. */
export class AuthNotReadyError extends Error {
  constructor() {
    super('ログイン状態を確認できませんでした。もう一度お試しください。');
    this.name = 'AuthNotReadyError';
  }
}

export function isAuthNotReady(error: unknown) {
  return error instanceof AuthNotReadyError
    || (typeof error === 'object' && error !== null && (error as { code?: string }).code === 'AUTH_NOT_READY');
}

const candidateRpcPath = /\/rest\/v1\/rpc\/hc_jobseeker_/;

// Candidate RPCs are authenticated-only (anon EXECUTE is revoked). Sending one without
// a bearer token can only produce a 401, so refuse it locally instead of hammering the
// API from signed-out tabs and background pollers.
const guardedFetch: typeof fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (candidateRpcPath.test(url)) {
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    const authorization = headers.get('Authorization') || '';
    if (!/^Bearer\s+\S+/i.test(authorization) || authorization.includes(supabaseKey)) {
      return new Response(JSON.stringify({ code: 'AUTH_NOT_READY', message: new AuthNotReadyError().message }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }
  return fetch(input, init);
};

export const hasSupabaseConfig = Boolean(supabaseUrl && supabaseKey);

export const supabase = hasSupabaseConfig
  ? createClient(supabaseUrl, supabaseKey, {
      accessToken: currentAccessToken,
      auth: { persistSession: false },
      global: { fetch: guardedFetch },
    })
  : null;

export function setSupabaseAccessTokenGetter(getter: (() => Promise<string | null>) | null) {
  accessTokenGetter = getter;
}
