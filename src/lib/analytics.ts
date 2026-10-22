/**
 * GA4 for the candidate app (same property as hoikucolor.jp, linked across both domains).
 *
 * Privacy rules:
 * - Never send names, emails, Clerk ids, application/job ids or free text.
 * - Page locations are sent without query strings or hashes.
 * - Private recruitment pages (/jobs/test/…) never load analytics.
 * - `sign_up` is only sent by reportVerifiedSignup(): a click is never a registration.
 */
const measurementId = (import.meta.env?.VITE_GA_MEASUREMENT_ID as string | undefined) ?? 'G-NLBK16NC1P';
const linkedDomains = ['hoikucolor.jp', 'app.hoikucolor.jp'];

type Params = Record<string, string | number | boolean | undefined>;
type Gtag = (...args: unknown[]) => void;
type AnalyticsWindow = Window & { dataLayer?: unknown[]; gtag?: Gtag };

export type CandidateEvent =
  | 'hc_auth_start'
  | 'sign_up'
  | 'login'
  | 'hc_pref_handoff_shown'
  | 'hc_pref_handoff_saved'
  | 'hc_pref_handoff_declined'
  | 'hc_pref_handoff_failed'
  | 'hc_career_started'
  | 'hc_career_saved'
  | 'hc_career_job_opened';

function enabled() {
  if (import.meta.env?.MODE === 'e2e' || !measurementId) return false;
  return !window.location.pathname.startsWith('/jobs/test/');
}

let started = false;

function gtag(): Gtag | null {
  if (!enabled()) return null;
  const w = window as AnalyticsWindow;
  if (!started) {
    started = true;
    w.dataLayer = w.dataLayer || [];
    // gtag.js reads `arguments` objects from the data layer, exactly like the official snippet.
    w.gtag = function gtagShim() { w.dataLayer!.push(arguments); }; // eslint-disable-line prefer-rest-params
    w.gtag('js', new Date());
    w.gtag('config', measurementId, {
      send_page_view: false,
      linker: { domains: linkedDomains },
      page_location: `${window.location.origin}${window.location.pathname}`,
    });
    const script = document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
    document.head.appendChild(script);
  }
  return w.gtag ?? null;
}

export function track(name: CandidateEvent, params: Params = {}) {
  try {
    gtag()?.('event', name, { ...params, page_location: `${window.location.origin}${window.location.pathname}` });
  } catch {
    // Analytics must never break the app.
  }
}

export function trackPageView() {
  try {
    gtag()?.('event', 'page_view', { page_location: `${window.location.origin}${window.location.pathname}`, page_title: document.title });
  } catch {
    // ignore
  }
}

const reportedKey = (userId: string) => `hc_signup_reported_v1:${userId}`;
/** A Clerk account created this recently is treated as a fresh registration. */
export const SIGNUP_WINDOW_MS = 30 * 60 * 1000;

export type SignupEvidence = {
  userId: string;
  createdAt: Date | null;
  emailVerified: boolean;
  method: 'email' | 'google' | 'other';
};

/** Pure decision used by reportVerifiedSignup (and its contract test). */
export function isFreshVerifiedSignup(evidence: SignupEvidence, now = Date.now()) {
  if (!evidence.createdAt || !evidence.emailVerified) return false;
  const age = now - evidence.createdAt.getTime();
  return age >= 0 && age <= SIGNUP_WINDOW_MS;
}

/**
 * Sends GA4 `sign_up` once per account, only after the account exists in Clerk with a
 * verified email AND an authenticated Supabase call (`confirmBackend`) succeeded.
 */
export async function reportVerifiedSignup(evidence: SignupEvidence, confirmBackend: () => Promise<unknown>) {
  if (!isFreshVerifiedSignup(evidence)) return false;
  try {
    if (localStorage.getItem(reportedKey(evidence.userId))) return false;
  } catch {
    return false; // Without storage we cannot deduplicate, so we do not report.
  }
  try {
    await confirmBackend();
  } catch {
    return false;
  }
  try {
    localStorage.setItem(reportedKey(evidence.userId), new Date().toISOString());
  } catch {
    return false;
  }
  track('sign_up', { method: evidence.method });
  return true;
}
