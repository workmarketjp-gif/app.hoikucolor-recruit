import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { validateReleaseConfig } from './release-config-preflight-lib.mjs';

const nativeRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cli = path.join(nativeRoot, 'qa', 'native-release-config-preflight.mjs');
const pkg = JSON.parse(fs.readFileSync(path.join(nativeRoot, 'package.json'), 'utf8'));
const checks = [];
function expect(name, condition) {
  checks.push(name);
  if (!condition) throw new Error(`RELEASE_PREFLIGHT_CONTRACT_FAILED: ${name}`);
}

// Synthetic, obviously non-production values used only to exercise the validator.
const iosClient = '000000000000-ios.apps.googleusercontent.com';
const validEnv = {
  EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_live_contractfixture',
  EXPO_PUBLIC_SUPABASE_URL: 'https://contract-fixture.supabase.co',
  EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_contractfixture',
  EXPO_PUBLIC_CLIENT_CONTRACT_VERSION: '1',
  EXPO_PUBLIC_CLERK_GOOGLE_WEB_CLIENT_ID: '000000000000-web.apps.googleusercontent.com',
  EXPO_PUBLIC_CLERK_GOOGLE_IOS_CLIENT_ID: iosClient,
  EXPO_PUBLIC_CLERK_GOOGLE_ANDROID_CLIENT_ID: '000000000000-android.apps.googleusercontent.com',
  EXPO_PUBLIC_CLERK_GOOGLE_IOS_URL_SCHEME: 'com.googleusercontent.apps.000000000000-ios',
  EXPO_PUBLIC_PRIVACY_POLICY_URL: 'https://contract-fixture.invalid/privacy',
  EXPO_PUBLIC_TERMS_URL: 'https://contract-fixture.invalid/terms',
  EXPO_PUBLIC_ACCOUNT_DELETION_URL: 'https://contract-fixture.invalid/delete',
  EXPO_PUBLIC_SUPPORT_URL: 'https://contract-fixture.invalid/support',
};

// A temp copy of the real config with only the EAS project id replaced.
const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hc-native-preflight-'));
try {
  for (const file of ['app.config.ts', 'eas.json', 'package.json']) fs.copyFileSync(path.join(nativeRoot, file), path.join(fixtureRoot, file));
  const app = JSON.parse(fs.readFileSync(path.join(nativeRoot, 'app.json'), 'utf8'));
  app.expo.extra.eas.projectId = '11111111-2222-4333-8444-555555555555';
  fs.writeFileSync(path.join(fixtureRoot, 'app.json'), JSON.stringify(app));

  const committed = validateReleaseConfig({ rootDir: nativeRoot, env: validEnv, mode: 'production' });
  expect('committed placeholder EAS project id blocks production', !committed.pass && committed.errors.some((e) => e.startsWith('EAS_PROJECT_ID:')));

  const good = validateReleaseConfig({ rootDir: fixtureRoot, env: validEnv, mode: 'production' });
  expect('fully configured production release passes', good.pass);

  const testKey = validateReleaseConfig({ rootDir: fixtureRoot, env: { ...validEnv, EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_test_contractfixture' }, mode: 'production' });
  expect('production rejects Clerk pk_test_ key', !testKey.pass && testKey.errors.some((e) => e.startsWith('CLERK_PUBLISHABLE_KEY:')));

  const httpSupabase = validateReleaseConfig({ rootDir: fixtureRoot, env: { ...validEnv, EXPO_PUBLIC_SUPABASE_URL: 'http://contract-fixture.supabase.co' }, mode: 'production' });
  expect('Supabase URL must be HTTPS', !httpSupabase.pass);

  const badScheme = validateReleaseConfig({ rootDir: fixtureRoot, env: { ...validEnv, EXPO_PUBLIC_CLERK_GOOGLE_IOS_URL_SCHEME: 'com.googleusercontent.apps.other' }, mode: 'production' });
  expect('iOS Google URL scheme must match iOS client id', !badScheme.pass && badScheme.errors.some((e) => e.startsWith('GOOGLE_IOS_URL_SCHEME:')));

  const noPolicy = validateReleaseConfig({ rootDir: fixtureRoot, env: { ...validEnv, EXPO_PUBLIC_PRIVACY_POLICY_URL: '' }, mode: 'production' });
  expect('production requires privacy policy URL', !noPolicy.pass);

  const devTestKey = validateReleaseConfig({ rootDir: fixtureRoot, env: { ...validEnv, EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_test_contractfixture', EXPO_PUBLIC_PRIVACY_POLICY_URL: '' }, mode: 'development' });
  expect('development accepts pk_test_ key without Store URLs', devTestKey.pass);

  const run = (args, env) => spawnSync(process.execPath, [cli, ...args], { cwd: nativeRoot, env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, ...env }, encoding: 'utf8' });
  const cliFail = run(['--mode', 'production'], validEnv);
  expect('CLI exits non-zero on committed placeholder config', cliFail.status === 1);
  const output = `${cliFail.stdout}${cliFail.stderr}`;
  expect('CLI never prints env values', !Object.values(validEnv).filter((value) => value.length > 4).some((value) => output.includes(value)));
  const easDev = run([], { ...validEnv, EAS_BUILD_PROFILE: 'development', EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_test_contractfixture' });
  // The committed EAS project id is still a placeholder, so only that blocker may remain.
  const easDevBlockers = easDev.stderr.split(/\r?\n/).filter((line) => line.startsWith('FAIL '));
  expect('EAS development profile runs development-mode preflight', easDev.stderr.includes('(development, EAS profile development)') && easDevBlockers.length === 1 && easDevBlockers[0].startsWith('FAIL EAS_PROJECT_ID:'));
  const easProd = run([], { ...validEnv, EAS_BUILD_PROFILE: 'production' });
  expect('EAS production profile runs production-mode preflight', easProd.status === 1 && easProd.stderr.includes('(production, EAS profile production)'));
  expect('invalid mode is rejected', run(['--mode', 'staging'], validEnv).status === 2);

  expect('release:preflight script runs production mode', pkg.scripts['release:preflight'] === 'node qa/native-release-config-preflight.mjs --mode production');
  expect('EAS pre-install hook runs preflight', pkg.scripts['eas-build-pre-install'] === 'node qa/native-release-config-preflight.mjs');
} finally {
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
}

console.log(`Native release config preflight contract: ${checks.length}/${checks.length} PASS`);
