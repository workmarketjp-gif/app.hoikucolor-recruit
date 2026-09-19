import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const layout = fs.readFileSync(path.join(root, 'src/app/_layout.tsx'), 'utf8');
const context = fs.readFileSync(path.join(root, 'src/contexts/ReleaseCompatibilityContext.tsx'), 'utf8');
const api = fs.readFileSync(path.join(root, 'src/lib/mobileReleaseApi.ts'), 'utf8');
const identity = fs.readFileSync(path.join(root, 'src/lib/appIdentity.ts'), 'utf8');
const migration = fs.readFileSync(path.join(root, '../supabase/migrations/20260919053000_hc_native_mobile_foundation_v3.sql'), 'utf8');

const checks = [];
const check = (label, ok) => checks.push([label, Boolean(ok)]);
const ordered = (...needles) => {
  let cursor = -1;
  return needles.every((needle) => {
    const index = layout.indexOf(needle, cursor + 1);
    if (index < 0) return false;
    cursor = index;
    return true;
  });
};

check('release identity is sourced from installed app build and explicit client contract',
  identity.includes('Application.nativeApplicationVersion') &&
  identity.includes('Application.nativeBuildVersion') &&
  identity.includes('EXPO_PUBLIC_CLIENT_CONTRACT_VERSION'));
check('client reuses canonical backend bootstrap RPC only',
  api.includes("client.rpc('hc_mobile_bootstrap_v1'") && !api.includes(".from('hc_") && !api.includes('from("hc_'));
check('bootstrap sends platform/build/client contract identity',
  api.includes('p_platform: identity.platform') &&
  api.includes('p_build_number: identity.buildNumber') &&
  api.includes('p_client_contract_version: identity.clientContractVersion'));
check('backend migration is canonical release-policy source',
  migration.includes('create table hc_private.mobile_release_policy') &&
  migration.includes('create or replace function public.hc_mobile_bootstrap_v1'));
check('unconfigured backend policy is fail-closed at source',
  migration.includes("'APP_RELEASE_POLICY_NOT_CONFIGURED'::text") && migration.includes('select false,false,false,false,false'));
check('release gate runs before every Native-only private backend provider',
  ordered(
    '<SessionFreshnessProvider key={auth.sessionId}>',
    '<ReleaseCompatibilityProvider>',
    '<ReleaseCompatibilityBoundary>',
    '<AppLockProvider>',
    '<AccountDeletionProvider>',
    '<NotificationProvider>',
  ));
check('release check pins the exact Clerk session and token',
  context.includes('const launchSession = session') &&
  context.includes('launchSession.getToken()') &&
  context.includes('createNativeSupabase(async () => token)'));
check('late release result is discarded after Candidate session handoff',
  context.includes('current.sessionId === launchIdentity.sessionId') &&
  context.includes('session === launchSession') &&
  context.includes('currentGeneration === generation.current'));
check('cold/unknown compatibility is blocked',
  context.includes('release-compatibility-bootstrap') &&
  context.includes('release-compatibility-blocked') &&
  context.indexOf('if (!compatibility)') < context.indexOf('if (!compatibility.configured)'));
check('backend policy configured=false remains blocked',
  context.includes('if (!compatibility.configured)'));
check('backend allowed=false remains blocked',
  context.includes('if (!compatibility.allowed)'));
check('maintenance, backend-too-old and client update states are distinguished',
  context.includes('compatibility.maintenanceMode') &&
  context.includes("APP_BACKEND_CONTRACT_TOO_OLD") &&
  context.includes("APP_CLIENT_CONTRACT_TOO_OLD") &&
  context.includes("APP_UPDATE_REQUIRED"));
check('store navigation only receives backend URL validated as HTTPS',
  api.includes("parsed.protocol === 'https:'") && context.includes('Linking.openURL(storeUrl)'));
check('foreground return rechecks canonical compatibility',
  context.includes("AppState.addEventListener('change'") && context.includes('void refresh()'));
check('offline cold launch never manufactures compatibility',
  context.includes('lastVerifiedAllowedRef.current') &&
  context.includes('previous?.configured && previous.allowed') &&
  context.includes('Same-process, exact-session continuity only'));
check('release layer does not duplicate nursery/application business logic',
  !context.includes(".from('hc_") && !context.includes('from("hc_') && !api.includes('hc_applications'));

const failed = checks.filter(([, ok]) => !ok);
for (const [label, ok] of checks) console.log(`${ok ? 'PASS' : 'FAIL'}: ${label}`);
if (failed.length) {
  console.error(`Native release compatibility core contract failed (${checks.length - failed.length}/${checks.length}).`);
  process.exit(1);
}
console.log(`Native release compatibility core contract PASS (${checks.length}/${checks.length})`);
