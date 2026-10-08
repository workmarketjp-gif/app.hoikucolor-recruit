import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.cwd());
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const exists = (relative) => fs.existsSync(path.join(root, relative));
const checks = [];
const check = (name, condition) => {
  checks.push({ name, ok: Boolean(condition) });
  if (!condition) process.exitCode = 1;
};

const routes = [
  'src/app/index.tsx',
  'src/app/(auth)/_layout.tsx',
  'src/app/(auth)/sign-in.tsx',
  'src/app/(auth)/sign-up.tsx',
  'src/app/(tabs)/_layout.tsx',
  'src/app/(tabs)/home.tsx',
  'src/app/(tabs)/jobs.tsx',
  'src/app/(tabs)/saved.tsx',
  'src/app/(tabs)/notifications.tsx',
  'src/app/(tabs)/profile.tsx',
];
for (const route of routes) check(`route exists: ${route}`, exists(route));

const signIn = read('src/app/(auth)/sign-in.tsx');
const signUp = read('src/app/(auth)/sign-up.tsx');
const auth = read('src/components/AuthScreen.tsx');
const authLayout = read('src/app/(auth)/_layout.tsx');
const tabsLayout = read('src/app/(tabs)/_layout.tsx');
const jobs = read('src/app/(tabs)/jobs.tsx');
const compare = read('src/app/compare.tsx');
const profile = read('src/app/(tabs)/profile.tsx');
const api = read('src/lib/jobseekerCoreApi.ts');

check('auth routes share the canonical screen', signIn.includes('<AuthScreen />') && signUp.includes('<AuthScreen isSignup />'));
check('email code replaces password auth', auth.includes('signIn.emailCode.sendCode()') && auth.includes('signIn.emailCode.verifyCode') && !auth.includes('signIn.password('));
check('verified new accounts transfer to sign-up', auth.includes('sign_up_if_missing_transfer') && auth.includes('signUp.create({ transfer: true })') && auth.includes('signUp.finalize()'));
check('existing accounts finalize', auth.includes('signIn.finalize()'));
check('MFA and client trust retained', auth.includes('needs_second_factor') && auth.includes('needs_client_trust') && auth.includes('verifyTOTP') && auth.includes('verifyEmailCode'));
check('Google uses the app scheme', auth.includes("strategy: 'oauth_google'") && auth.includes("scheme: 'hoikucolor'"));
check('signed-in users cannot remain in auth group', authLayout.includes('if (isSignedIn) return <Redirect href="/(tabs)/home"'));
check('signed-out users cannot enter candidate tabs', tabsLayout.includes('if (!isSignedIn) return <Redirect href="/(auth)/sign-in"'));
check('candidate business screens use exact-session pinning', jobs.includes('pinCandidateAction') && profile.includes('pinCandidateAction'));
check('job search reuses canonical v2 RPC', api.includes("client.rpc('hc_jobseeker_search_jobs_v2'"));
check('saved jobs reuse canonical actor-scoped RPCs', api.includes("hc_jobseeker_save_job") && api.includes("hc_jobseeker_unsave_job") && api.includes("hc_jobseeker_list_saved_job_ids"));
check('save success is canonically re-read', api.includes('const canonical = await listSavedJobIds(client)'));
check('profile reuses canonical actor-scoped RPCs', api.includes("hc_jobseeker_get_profile") && api.includes("hc_jobseeker_upsert_profile"));
check('profile writes never send caller identity', !api.match(/p_clerk_user_id\s*:/));
check('Native core API does not read canonical tables directly', !api.includes('.from('));
check('job comparison is capped to three', compare.includes('const maxComparedJobs = 3') && compare.includes('current.length >= maxComparedJobs') && compare.includes("setError('比較できる求人は3件までです。')"));
check('document vault is mounted in profile', profile.includes('<DocumentVaultSection />'));
check('safe account sign-out is exposed in profile', profile.includes('deletion.signOutSafely()'));
check('account deletion entry is explicit', profile.includes('deletion.requestDeletion()') && profile.includes("style: 'destructive'"));

for (const result of checks) console.log(`${result.ok ? 'PASS' : 'FAIL'} ${result.name}`);
if (process.exitCode) {
  console.error(`Native CA-01 shell contract failed (${checks.filter((item) => !item.ok).length}/${checks.length}).`);
} else {
  console.log(`Native CA-01 shell contract passed (${checks.length}/${checks.length}).`);
}
