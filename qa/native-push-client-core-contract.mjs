import fs from 'node:fs';

const client = fs.readFileSync('native/src/lib/notifications.ts', 'utf8');
const identity = fs.readFileSync('native/src/lib/appIdentity.ts', 'utf8');
const foundation = fs.readFileSync('supabase/migrations/20260919053000_hc_native_mobile_foundation_v3.sql', 'utf8');
const pipeline = fs.readFileSync('supabase/migrations/20260919073000_hc_native_push_pipeline_v4.sql', 'utf8');
const appJson = fs.readFileSync('native/app.json', 'utf8');
const pkg = fs.readFileSync('native/package.json', 'utf8');

const checks = [
  ['HC jobseeker installation registration RPC matches foundation', client.includes("hc_mobile_register_installation_v1") && foundation.includes('hc_mobile_register_installation_v1')],
  ['HC jobseeker installation revoke RPC matches foundation', client.includes("hc_mobile_revoke_installation_v1") && foundation.includes('hc_mobile_revoke_installation_v1')],
  ['exact unread badge RPC matches push pipeline', client.includes("hc_jobseeker_get_unread_notification_count_v1") && pipeline.includes('hc_jobseeker_get_unread_notification_count_v1')],
  ['opaque notification route resolver matches push pipeline', client.includes("hc_jobseeker_resolve_notification_route_v1") && pipeline.includes('hc_jobseeker_resolve_notification_route_v1')],
  ['client does not navigate from push payload URL', !client.includes('content.data?.url') && !client.includes('link_url as')],
  ['push registration requires physical device', client.includes('Device.isDevice') && client.includes('PHYSICAL_DEVICE_REQUIRED')],
  ['Expo project id fails closed before signed push registration', client.includes('EAS_PROJECT_ID_REQUIRED') && appJson.includes('SET_EAS_PROJECT_ID_BEFORE_BUILD')],
  ['candidate installation id is cryptographic and stable', client.includes('Crypto.randomUUID()') && client.includes('INSTALLATION_ID_KEY') && !client.includes('deleteItemAsync(INSTALLATION_ID_KEY)')],
  ['token binding is quarantined across account/session boundaries', client.includes('blockPushBindingOperations') && client.includes('settlePushBindingOperations') && client.includes('PUSH_BINDING_QUARANTINED')],
  ['candidate badge writes are generation guarded', client.includes('setCandidateNotificationBadgeCount') && client.includes('pendingPresentation')],
  ['logout presentation cleanup clears tray badge and last response', client.includes('dismissAllNotificationsAsync') && client.includes('setBadgeCountAsync(0)') && client.includes('clearLastNotificationResponseAsync')],
  ['native release identity includes build and client contract version', identity.includes('nativeBuildVersion') && identity.includes('EXPO_PUBLIC_CLIENT_CONTRACT_VERSION')],
  ['Expo notification dependencies are declared', pkg.includes('expo-notifications') && pkg.includes('expo-device') && pkg.includes('expo-secure-store')],
  ['Poppy/staff app tokens cannot share this backend app key', foundation.includes("check (app_key = 'hoiku_color_jobseeker')") && pipeline.includes("app_key='hoiku_color_jobseeker'")],
];

const failed = checks.filter(([, ok]) => !ok).map(([name]) => name);
if (failed.length) {
  console.error('Native push client core contract failed:\n- ' + failed.join('\n- '));
  process.exit(1);
}
console.log(`Native push client core contract passed (${checks.length}/${checks.length}).`);
