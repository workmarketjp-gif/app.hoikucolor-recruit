import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { CANONICAL_EAS_PROJECT_ID, validateReleaseConfig } from './release-config-preflight-lib.mjs';

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
  const withProjectId = (projectId) => {
    app.expo.extra.eas.projectId = projectId;
    fs.writeFileSync(path.join(fixtureRoot, 'app.json'), JSON.stringify(app));
    return validateReleaseConfig({ rootDir: fixtureRoot, env: validEnv, mode: 'production' });
  };
  const placeholder = withProjectId('SET_EAS_PROJECT_ID_BEFORE_BUILD');
  expect('placeholder EAS project id blocks release', !placeholder.pass && placeholder.errors.some((e) => e.startsWith('EAS_PROJECT_ID:')));
  const foreign = withProjectId('11111111-2222-4333-8444-555555555555');
  expect('a different EAS project id blocks release', !foreign.pass && foreign.errors.some((e) => e.startsWith('EAS_PROJECT_ID_CANONICAL:')));
  withProjectId(CANONICAL_EAS_PROJECT_ID);

  const committed = validateReleaseConfig({ rootDir: nativeRoot, env: validEnv, mode: 'production' });
  expect('committed config carries the canonical EAS project, slug and owner', committed.pass && ['EAS_PROJECT_ID_CANONICAL', 'APP_SLUG', 'APP_OWNER'].every((code) => committed.checks.some((c) => c.code === code && c.pass)));

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

  const noGoogle = Object.fromEntries(Object.entries(validEnv).filter(([key]) => !key.includes('_GOOGLE_')));
  const devNoGoogle = validateReleaseConfig({ rootDir: fixtureRoot, env: { ...noGoogle, EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_test_contractfixture' }, mode: 'development' });
  expect('development email-only build passes without Google IDs (warnings only)', devNoGoogle.pass && devNoGoogle.warnings.some((w) => w.startsWith('GOOGLE_WEB_CLIENT_ID:')));
  const prodNoGoogle = validateReleaseConfig({ rootDir: fixtureRoot, env: noGoogle, mode: 'production' });
  expect('production still requires all Google IDs', !prodNoGoogle.pass && ['GOOGLE_WEB_CLIENT_ID:', 'GOOGLE_IOS_CLIENT_ID:', 'GOOGLE_ANDROID_CLIENT_ID:', 'GOOGLE_IOS_URL_SCHEME:'].every((code) => prodNoGoogle.errors.some((e) => e.startsWith(code))));
  const devBadGoogle = validateReleaseConfig({ rootDir: fixtureRoot, env: { ...noGoogle, EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_test_contractfixture', EXPO_PUBLIC_CLERK_GOOGLE_WEB_CLIENT_ID: 'not-a-google-id' }, mode: 'development' });
  expect('development rejects partial/invalid Google config once supplied', !devBadGoogle.pass);

  const run = (args, env) => spawnSync(process.execPath, [cli, ...args], { cwd: nativeRoot, env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, ...env }, encoding: 'utf8' });
  const cliFail = run(['--mode', 'production'], { ...validEnv, EXPO_PUBLIC_SUPABASE_URL: '' });
  expect('CLI exits non-zero when a required release env is missing', cliFail.status === 1 && cliFail.stderr.includes('FAIL SUPABASE_URL:'));
  const output = `${cliFail.stdout}${cliFail.stderr}`;
  expect('CLI never prints env values', !Object.values(validEnv).filter((value) => value.length > 4).some((value) => output.includes(value)));
  const easDev = run([], { ...validEnv, EAS_BUILD_PROFILE: 'development', EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_test_contractfixture' });
  expect('EAS development profile runs development-mode preflight', easDev.status === 0 && easDev.stdout.includes('(development, EAS profile development)'));
  const easProd = run([], { ...validEnv, EAS_BUILD_PROFILE: 'production', EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_test_contractfixture' });
  expect('EAS production profile runs production-mode preflight', easProd.status === 1 && easProd.stderr.includes('(production, EAS profile production)') && easProd.stderr.includes('FAIL CLERK_PUBLISHABLE_KEY:'));
  expect('invalid mode is rejected', run(['--mode', 'staging'], validEnv).status === 2);

  expect('release:preflight script runs production mode', pkg.scripts['release:preflight'] === 'node qa/native-release-config-preflight.mjs --mode production');
  expect('EAS pre-install hook runs preflight', pkg.scripts['eas-build-pre-install'] === 'node qa/native-release-config-preflight.mjs');
} finally {
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
}

console.log(`Native release config preflight contract: ${checks.length}/${checks.length} PASS`);
