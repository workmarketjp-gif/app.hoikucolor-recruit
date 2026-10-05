import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const supabase = read('src/lib/supabase.ts');
const appRoot = read('src/AppRoot.tsx');
const app = read('src/App.tsx');
const resource = read('src/lib/useResource.ts');
const scoutNav = read('src/components/ScoutNavigationEnhancer.tsx');
const attention = read('src/components/AttentionSummaryEnhancer.tsx');
const notification = read('src/components/NotificationCenter.tsx');
const vault = read('src/components/DocumentVaultPanel.tsx');
const routeRoots = ['Compare', 'Match', 'Scout', 'SpotJobs', 'Visit'].map((name) => [name, read(`src/${name}RouteRoot.tsx`)]);

const checks = [];
const check = (name, ok) => {
  checks.push(name);
  if (!ok) throw new Error(`HC_WEB_SESSION_AUTH_CONTRACT_FAILED: ${name}`);
};

// First request is authenticated (no effect-order race).
check('Supabase token falls back to the active Clerk session', supabase.includes('accessToken: currentAccessToken') && supabase.includes('return session ? session.getToken() : null;'));
check('main app registers the token getter in a layout effect', /useLayoutEffect\(\(\) => \{\n\s*if \(!session\) \{\n\s*setSupabaseAccessTokenGetter\(null\);/.test(appRoot));
for (const [name, source] of routeRoots) {
  check(`${name} route registers the token getter in a layout effect`, /useLayoutEffect\(\(\) => \{\n(?:\s*setSupabaseReady\(false\);\n)?\s*if \(!session\) \{\n\s*setSupabaseAccessTokenGetter\(null\);/.test(source));
  check(`${name} route uses the shared mobile shell`, source.includes('<CandidateShell'));
}

// Signed-out tabs never hit candidate RPCs.
check('candidate RPCs without a bearer token are refused locally', supabase.includes("const candidateRpcPath = /\\/rest\\/v1\\/rpc\\/hc_jobseeker_/;") && supabase.includes("code: 'AUTH_NOT_READY'") && supabase.includes('global: { fetch: guardedFetch }'));
check('the publishable key is never accepted as a candidate bearer', supabase.includes('authorization.includes(supabaseKey)'));
check('scout poller skips signed-out tabs and backs off', scoutNav.includes('if (!hasActiveSession()) return;') && scoutNav.includes('Math.min(300_000') && !scoutNav.includes('setTimeout(load, 3000)'));
check('attention poller skips signed-out tabs', attention.includes('if (!hasActiveSession()) return;'));
check('header no longer polls scouts', !notification.includes('listJobseekerScouts'));

// Loading / Error / Empty / Success are distinct; no page-wide error banner.
check('resource hook separates loading, error and success', resource.includes("status: 'loading'") && resource.includes("status: 'error'") && resource.includes("status: 'success'"));
check('home no longer fails all sections together', !app.includes('Promise.all([listFeaturedJobs(3), listSavedJobsWithStatus(), listSavedJobIds(), listApplications(), getProfile()])'));
check('candidate app has no page-wide error banner', !app.includes('className="error-banner"'));
check('search failure is an error state with retry, not an empty list', app.includes("setStatus('error')") && app.includes("status === 'success' && !jobs.length"));
check('screens read the candidate session, not Clerk', !/from '@clerk\/react'/.test(app) && !/from '@clerk\/react'/.test(vault));

// E2E harness can never ship to production.
check('e2e root is gated on the build mode', appRoot.includes("import.meta.env.MODE === 'e2e' ? lazy(() => import('./e2e/E2ERoot')) : null"));

console.log(`HC Web session/auth contract passed (${checks.length}/${checks.length})`);
