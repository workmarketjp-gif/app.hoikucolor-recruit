import { useEffect } from 'react';

/**
 * Every candidate screen lives in one app under one session. This module owns the
 * URL ⇄ screen mapping, in-app link handling, and the post-login return target.
 */
export type View = 'home' | 'jobs' | 'saved' | 'applications' | 'profile' | 'scouts' | 'visits' | 'spot' | 'matches' | 'compare';

export const viewPaths: Record<View, string> = {
  home: '/',
  jobs: '/jobs',
  saved: '/saved',
  applications: '/applications',
  profile: '/profile',
  scouts: '/scouts',
  visits: '/visits',
  spot: '/spot-jobs',
  matches: '/matches',
  compare: '/compare',
};

export const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** The screen for a pathname, or null when the path is not a candidate screen. */
export function pathToView(pathname: string): View | null {
  const normalized = pathname.replace(/\/+$/, '') || '/';
  if (normalized === '/') return 'home';
  const match = (Object.entries(viewPaths) as [View, string][])
    .find(([, path]) => path !== '/' && (normalized === path || normalized.startsWith(`${path}/`)));
  return match?.[0] ?? null;
}

/** A UUID query parameter of the current URL on the given screen, or null. */
export function uuidParam(view: View, key: string) {
  if (pathToView(window.location.pathname) !== view) return null;
  const value = new URLSearchParams(window.location.search).get(key);
  return value && uuidPattern.test(value) ? value : null;
}

/**
 * Same-origin anchors to candidate screens navigate inside the app (no reload, one
 * session). Modified clicks, new-tab targets, downloads and other paths are left to
 * the browser.
 */
export function useInAppLinks(navigate: (target: string) => void) {
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest?.('a[href]');
      if (!(anchor instanceof HTMLAnchorElement) || anchor.target || anchor.hasAttribute('download')) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin || !pathToView(url.pathname)) return;
      event.preventDefault();
      navigate(`${url.pathname}${url.search}${url.hash}`);
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, [navigate]);
}

/* ------------------------------------------------------------------------------------
 * Return after login. A signed-out visitor who opened a candidate deep link (for example
 * a Google job posting → /jobs?job_id=…) lands back on that exact screen after signing
 * in. Only same-origin candidate screens with UUID parameters and a plain anchor survive.
 * ---------------------------------------------------------------------------------- */

const returnStorageKey = 'hc_jobseeker_safe_job_return';
const returnParams = ['job_id', 'application_id', 'interview_id', 'scout_id', 'visit_id', 'assignment_id'];

export function normalizeReturnTarget(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw, window.location.origin);
    if (url.origin !== window.location.origin) return null;
    const view = pathToView(url.pathname);
    if (!view || view === 'home') return null;
    const params = new URLSearchParams();
    for (const key of returnParams) {
      const values = url.searchParams.getAll(key).filter((value) => uuidPattern.test(value));
      // Comparison URLs carry up to three job ids; everything else carries one.
      (view === 'compare' && key === 'job_id' ? values.slice(0, 3) : values.slice(0, 1)).forEach((value) => params.append(key, value));
    }
    const hash = /^#[a-z0-9-]{1,80}$/i.test(url.hash) ? url.hash : '';
    const query = params.toString();
    return `${viewPaths[view]}${query ? `?${query}` : ''}${hash}`;
  } catch {
    return null;
  }
}

/** Called by the sign-in screen: keep an explicit `return_to`, or the deep link itself. */
export function rememberReturnTarget() {
  try {
    const explicit = normalizeReturnTarget(new URLSearchParams(window.location.search).get('return_to'));
    const direct = normalizeReturnTarget(`${window.location.pathname}${window.location.search}${window.location.hash}`);
    const target = explicit || direct;
    if (target) sessionStorage.setItem(returnStorageKey, target);
  } catch {
    // Storage can be unavailable (private mode); the visitor simply lands on Home.
  }
}

/**
 * Called once when the signed-in app starts on Home: move to the remembered screen.
 * The stored value is validated again before use and always cleared.
 */
export function restoreReturnTarget() {
  try {
    const stored = normalizeReturnTarget(sessionStorage.getItem(returnStorageKey));
    sessionStorage.removeItem(returnStorageKey);
    if (stored && pathToView(window.location.pathname) === 'home') window.history.replaceState(window.history.state, '', stored);
  } catch {
    // Ignore storage failures; Home is a safe default.
  }
}
