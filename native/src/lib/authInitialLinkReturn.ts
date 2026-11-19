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

export function candidateRouteFromInitialURL(url: string | null | undefined): string | null {
  if (typeof url !== 'string' || !url.startsWith('hoikucolor://')) return null;
  const raw = url.slice('hoikucolor://'.length).split(/[?#]/, 1)[0];
  // Do not decode encoded separators, dot segments, a different host, or external links.
  if (!raw || /[%\\\s]/.test(raw) || raw.includes('//') || raw.includes('..')) return null;
  const path = `/${raw.replace(/^\//, '')}`;
  return DIRECT_ROUTES.has(path) || DETAIL_ROUTE.test(path) ? path : null;
}

let initialCapture: Promise<void> | null = null;
let firstAuthResolution: 'unknown' | 'signed-in' | 'signed-out' = 'unknown';
let pending: string | null = null;
let incomingSequence = 0;
let consumed = false;

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
export function openSignedOutCandidateLinkWindow(): void { consumed = false; }
export function rememberSignedOutCandidateLink(url: string): void {
  if (consumed) return;
  incomingSequence += 1;
  pending = candidateRouteFromInitialURL(url);
}

/** Consume once only after Clerk sign-in/sign-up/Google activation succeeds. */
export async function consumePostAuthCandidateRoute(): Promise<string | null> {
  if (initialCapture) await initialCapture;
  const result = pending;
  pending = null;
  consumed = true;
  return result;
}
