import fs from 'node:fs';

// A signed-out visitor who opens a job from Google (or any candidate deep link) must
// land on that exact job after login. The logic lives in the router + login screen +
// job search; nothing observes or mutates the DOM from outside React.
const router = fs.readFileSync('src/lib/router.ts', 'utf8');
const appRoot = fs.readFileSync('src/AppRoot.tsx', 'utf8');
const app = fs.readFileSync('src/App.tsx', 'utf8');
const jobCard = fs.readFileSync('src/components/JobCard.tsx', 'utf8');
const main = fs.readFileSync('src/main.tsx', 'utf8');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(router.includes('url.origin !== window.location.origin'), 'return target must reject cross-origin URLs');
assert(router.includes("if (!view || view === 'home') return null;"), 'return target must be restricted to candidate screens');
assert(router.includes('uuidPattern.test(value)'), 'deep-link ids (job_id etc.) must be UUIDs');
assert(router.includes("get('return_to')"), 'explicit login/signup return_to must be captured');
assert(router.includes('sessionStorage.setItem(returnStorageKey'), 'safe return target must survive the authentication redirect');
assert(router.includes('const stored = normalizeReturnTarget(sessionStorage.getItem(returnStorageKey));') && router.includes('sessionStorage.removeItem(returnStorageKey);'), 'stored target must be re-validated and always cleared');
assert(router.includes("pathToView(window.location.pathname) === 'home'") && router.includes('window.history.replaceState(window.history.state, \'\', stored)'), 'authentication completion (landing on Home) must restore the validated target');
assert(appRoot.includes('useEffect(() => { rememberReturnTarget(); }, []);'), 'the unauthenticated login screen must remember the deep link');
assert(app.includes('restoreReturnTarget();'), 'the signed-in app must restore the remembered target before its first route read');
assert(app.includes('targetJobId ? getRankedJob(targetJobId) : Promise.resolve(null)'), 'paginated search must pin a valid exact deep-linked job into the first result view');
assert(jobCard.includes('data-job-id={job.id}') && jobCard.includes('id={`job-${job.id}`}'), 'rendered job cards must expose the canonical UUID for exact targeting');
assert(app.includes('initiallyExpanded={expandedJobId === job.id}'), 'target job detail must open automatically');
assert(app.includes("card.scrollIntoView({ behavior: 'smooth', block: 'start' })"), 'target job must be brought into view');
assert(app.includes('この求人は公開を終了したか'), 'expired or unpublished external job links must fail safely');
assert(!main.includes('Enhancer'), 'no DOM enhancers may be mounted next to the app');
assert(pkg.scripts['test:google-job-return'] === 'node qa/google-job-return-contract.mjs', 'google job return contract must be runnable');
assert(pkg.scripts.build.includes('test:google-job-return'), 'google job return contract must gate production builds');

console.log('google job return contract: ok');
