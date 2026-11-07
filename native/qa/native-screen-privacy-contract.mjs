import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const hook = read('src/hooks/usePrivateScreenCapture.ts');

const checks = [];
function check(name, condition) {
  if (!condition) throw new Error(`Native screen privacy contract failed: ${name}`);
  checks.push(name);
}

check('hook blocks capture with a per-screen key', hook.includes('preventScreenCaptureAsync(key)') && hook.includes('`hc-private-${screenKey}`'));
check('hook releases only its own key on blur/unmount', hook.includes('allowScreenCaptureAsync(key)'));
check('hook is focus-bound so hidden tabs do not keep the block', hook.includes('useFocusEffect'));
check('prevent failure is logged with a fixed code, not swallowed silently', hook.includes('HC_SCREEN_PRIVACY_PREVENT_FAILED'));

const privateScreens = {
  'src/app/(tabs)/applications.tsx': 'applications',
  'src/app/(tabs)/profile.tsx': 'profile',
  'src/app/(tabs)/notifications.tsx': 'notifications',
  'src/app/application/[id].tsx': 'application-detail',
  'src/app/scouts.tsx': 'scouts',
  'src/app/visits.tsx': 'visits',
};
for (const [file, key] of Object.entries(privateScreens)) {
  const source = read(file);
  check(`${file} protects candidate-private content`, source.includes(`usePrivateScreenCapture('${key}')`));
}

// Job detail is public discovery content: capture is blocked only while the private documents chooser is mounted.
const job = read('src/app/job/[id].tsx');
check('job detail blocks capture only with the documents chooser (active flag)', job.includes("usePrivateScreenCapture('job-apply-documents', choosingDocuments)"));
check('job detail screen wrapper no longer blocks capture unconditionally', !job.includes("usePrivateScreenCapture('job-detail')"));
check('hook skips blocking when inactive', hook.includes('if (!active) return undefined;'));

// Public discovery must stay shareable.
for (const file of ['src/app/(tabs)/jobs.tsx', 'src/app/compare.tsx']) {
  check(`${file} stays capturable`, !read(file).includes('usePrivateScreenCapture'));
}

console.log(`Native screen privacy contract passed (${checks.length} checks).`);
