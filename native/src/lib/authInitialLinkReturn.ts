/**
 * Keep an explicitly requested Native candidate route across the sign-in gate.
 * This is an in-memory navigation hint, not authorization or persisted PII.
 * Private screens must still verify Clerk session and server-side ownership.
 */
const DIRECT_ROUTES = new Set([
  '/spot-jobs', '/messages', '/resume', '/scouts', '/visits', '/matches', '/compare',
  '/(tabs)/home', '/(tabs)/jobs', '/(tabs)/career', '/(tabs)/saved',
  '/(tabs)/applications', '/(tabs)/notifications', '/(tabs)/profile',
]);
const DETAIL_ROUTE = /^\/(?:job|application)\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function candidateRouteFromInitialURL(url: string | null | undefined): string | null {
  if (typeof url !== 'string' || !url.startsWith('hoikucolor://')) return null;
  const rest = url.slice('hoikucolor://'.length).split('#', 1)[0];
  const queryOffset = rest.indexOf('?');
  const raw = queryOffset < 0 ? rest : rest.slice(0, queryOffset);
  // Do not decode encoded separators, dot segments, a different host, or external links.
  if (!raw || /[%\\\s]/.test(raw) || raw.includes('//') || raw.includes('..')) return null;
  const path = `/${raw.replace(/^\//, '')}`;
  if (!DIRECT_ROUTES.has(path) && !DETAIL_ROUTE.test(path)) return null;
  if (queryOffset < 0) return path;

  const allowed = path.startsWith('/application/') ? new Set(['focus', 'interviewId', 'focusKey'])
    : path === '/visits' ? new Set(['visitId', 'jobId', 'applicationId'])
      : path === '/scouts' ? new Set(['scoutId'])
        : path === '/spot-jobs' ? new Set(['assignmentId'])
          : path === '/(tabs)/profile' ? new Set(['return_job']) : new Set<string>();
  const rawQuery = rest.slice(queryOffset + 1);
  if (!rawQuery || rawQuery.length > 320) return null;
  const params = new URLSearchParams(rawQuery);
  const seen = new Set<string>();
  for (const [key, value] of params) {
    if (!allowed.has(key) || seen.has(key)) return null;
    seen.add(key);
    if (key === 'focus') {
      if (value !== 'messages' && value !== 'interview') return null;
    } else if (key === 'focusKey') {
      if (!/^[a-z0-9:._-]{1,120}$/i.test(value)) return null;
    } else if (!UUID.test(value)) return null;
  }
  return seen.size > 0 ? `${path}?${params.toString()}` : path;
}

let initialCapture: Promise<void> | null = null;
let firstAuthResolution: 'unknown' | 'signed-in' | 'signed-out' = 'unknown';
let pending: string | null = null;
let incomingSequence = 0;
let consumed = false;
let pendingClaimSessionId: string | null = null;

/** Start once at app boot, before the signed-out router redirects a cold link. */
export function beginInitialCandidateLinkCapture(getInitialURL: () => Promise<string | null>): void {
  if (initialCapture) return;
  const generation = incomingSequence;
  initialCapture = new Promise<void>((resolve) => {
    let finished = false;
    const finish = () => { if (!finished) { finished = true; clearTimeout(deadline); resolve(); } };
    const deadline = setTimeout(finish, 800);
    Promise.resolve().then(getInitialURL).then((url) => {
      if (!finished && !consumed && incomingSequence === generation && firstAuthResolution !== 'signed-in') {
        pending = candidateRouteFromInitialURL(url);
      }
    }).catch(() => { /* No link is not a login error. */ }).finally(finish);
  });
}

/** Only the *first* hydrated auth state decides eligibility of the cold URL. */
export function recordInitialCandidateAuth(signedIn: boolean): void {
  if (firstAuthResolution !== 'unknown') return;
  firstAuthResolution = signedIn ? 'signed-in' : 'signed-out';
  if (signedIn) pending = null;
}

/** The auth UI can accept a NEW warm link while signed out, never old session data. */
export function openSignedOutCandidateLinkWindow(): void {
  // A signed-out transition after a private session claim must invalidate its
  // pending return intent; a different account must not inherit that route.
  if (pendingClaimSessionId !== null) {
    pending = null;
    incomingSequence += 1; // also quarantine an in-flight cold OS URL read
  }
  pendingClaimSessionId = null;
  consumed = false;
}
export function rememberSignedOutCandidateLink(url: string): void {
  // Clerk/Expo's Google SSO browser returns through this public callback. It is
  // not a new candidate navigation intent: overwriting pending with null here
  // would lose the original application/message URL on successful sign-in.
  // Only the exact app callback is ignored; unrelated links still clear intent.
  // Expo/AuthSession callbacks can carry one normalized trailing slash. Match
  // only this public callback, never similarly named routes or double slashes.
  if (consumed || /^hoikucolor:\/\/\/?sso-callback\/?(?:[?#]|$)/.test(url)) return;
  incomingSequence += 1;
  pending = candidateRouteFromInitialURL(url);
}

/**
 * An OS URL event can arrive before Clerk has hydrated and before the signed-out
 * listener mounts. Remember it only during that small bootstrap window. After
 * initial auth resolution the scoped signed-out listener owns events; the
 * global listener must not capture a logged-in user's private navigation.
 */
export function rememberCandidateLinkDuringBoot(url: string): void {
  if (firstAuthResolution !== 'unknown') return;
  rememberSignedOutCandidateLink(url);
}

/**
 * Consume once only while the caller's Clerk-session/effect lease remains live.
 * A stale EntryScreen can still be awaiting the bounded initial OS URL read
 * when Clerk unmounts it during a same-session re-entry. Such a read must
 * never consume a new effect's intent, nor leak a route across account changes.
 */
export async function consumePostAuthCandidateRoute(
  isCurrent: () => boolean = () => true,
  sessionId?: string,
): Promise<string | null> {
  if (!isCurrent()) return null;
  if (sessionId) {
    // Re-entry by the same session can preserve the pending link, but a direct
    // Clerk session replacement cannot pass one account's intent to another.
    if (pendingClaimSessionId !== null && pendingClaimSessionId !== sessionId) {
      pending = null;
      incomingSequence += 1;
      consumed = true;
      pendingClaimSessionId = sessionId;
      return null;
    }
    pendingClaimSessionId = sessionId;
  }
  if (initialCapture) await initialCapture;
  if (!isCurrent() || (sessionId && pendingClaimSessionId !== sessionId)) return null;
  const result = pending;
  pending = null;
  consumed = true;
  return result;
}
