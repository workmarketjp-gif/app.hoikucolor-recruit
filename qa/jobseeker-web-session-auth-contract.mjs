import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const supabase = read('src/lib/supabase.ts');
const appRoot = read('src/AppRoot.tsx');
const app = read('src/App.tsx');
const resource = read('src/lib/useResource.ts');
const main = read('src/main.tsx');
const notification = read('src/components/NotificationCenter.tsx');
const vault = read('src/components/DocumentVaultPanel.tsx');
const views = ['Compare', 'Matches', 'Scouts', 'SpotJobs', 'Visits'].map((name) => [name, read(`src/views/${name}View.tsx`)]);

const checks = [];
const check = (name, ok) => {
  checks.push(name);
  if (!ok) throw new Error(`HC_WEB_SESSION_AUTH_CONTRACT_FAILED: ${name}`);
};

// First request is authenticated (no effect-order race).
check('Supabase token falls back to the active Clerk session', supabase.includes('accessToken: currentAccessToken') && supabase.includes('return session ? session.getToken() : null;'));
check('main app registers the token getter in a layout effect', /useLayoutEffect\(\(\) => \{\n\s*if \(!session\) \{\n\s*setSupabaseAccessTokenGetter\(null\);/.test(appRoot));
// One app, one ClerkProvider, one token getter: secondary screens are plain views.
check('main mounts a single app root', main.includes('<AppRoot />') && !main.includes('RouteRoot') && !main.includes('Enhancer'));
check('exactly one ClerkProvider exists', (appRoot.match(/<ClerkProvider /g) || []).length === 1);
for (const [name, source] of views) {
  check(`${name} view uses the app session (no own Clerk provider or token getter)`, !source.includes('@clerk/react') && !source.includes('ClerkProvider') && !source.includes('setSupabaseAccessTokenGetter'));
}
check('secondary views render inside the shared mobile shell', app.includes('<CandidateShell') && app.includes('<ScoutsView />') && app.includes('<VisitsView />'));

// Signed-out tabs never hit candidate RPCs.
check('candidate RPCs without a bearer token are refused locally', supabase.includes("const candidateRpcPath = /\\/rest\\/v1\\/rpc\\/hc_jobseeker_/;") && supabase.includes("code: 'AUTH_NOT_READY'") && supabase.includes('global: { fetch: guardedFetch }'));
check('the publishable key is never accepted as a candidate bearer', supabase.includes('authorization.includes(supabaseKey)'));
check('no global background pollers run outside the signed-in app', !main.includes('Enhancer'));
check('header no longer polls scouts', !notification.includes('listJobseekerScouts'));

// Loading / Error / Empty / Success are distinct; no page-wide error banner.
check('resource hook separates loading, error and success', resource.includes("status: 'loading'") && resource.includes("status: 'error'") && resource.includes("status: 'success'"));
check('home no longer fails all sections together', !app.includes('Promise.all([listFeaturedJobs(3), listSavedJobsWithStatus(), listSavedJobIds(), listApplications(), getProfile()])'));
check('candidate app has no page-wide error banner', !app.includes('className="error-banner"'));
check('search failure is an error state with retry, not an empty list', app.includes("setStatus('error')") && app.includes("status === 'success' && !jobs.length"));
check('screens read the candidate session, not Clerk', !/from '@clerk\/react'/.test(app) && !/from '@clerk\/react'/.test(vault));
check('secondary views have no page-wide error banner', views.every(([, source]) => !source.includes('error-banner')));

// E2E harness can never ship to production.
check('e2e root is gated on the build mode', appRoot.includes("import.meta.env.MODE === 'e2e' ? lazy(() => import('./e2e/E2ERoot')) : null"));

console.log(`HC Web session/auth contract passed (${checks.length}/${checks.length})`);
