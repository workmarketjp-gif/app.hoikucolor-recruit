import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const context = fs.readFileSync(path.join(root, 'src/contexts/NotificationContext.tsx'), 'utf8');
const attention = fs.readFileSync(path.join(root, 'src/lib/attentionApi.ts'), 'utf8');
const notifications = fs.readFileSync(path.join(root, 'src/lib/notifications.ts'), 'utf8');

const checks = [];
const check = (label, ok) => checks.push([label, Boolean(ok)]);

check('candidate-private reads are shielded', context.includes('usePrivateDataQuarantine') && context.includes('privacy.shieldVisible'));
check('canonical reads are pinned to exact candidate action', context.includes('pinCandidateAction') && context.includes('pinned.isCurrent()'));
check('push registration is pinned to exact candidate session', context.includes('pinCandidateSession') && context.includes('syncPushRegistration'));
check('notification rows use canonical candidate RPC', notifications.includes("hc_jobseeker_list_notifications"));
check('unread badge uses exact candidate RPC', notifications.includes("hc_jobseeker_get_unread_notification_count_v1"));
check('attention summary reuses candidate-safe Web/API RPC', attention.includes("hc_jobseeker_attention_summary"));
check('attention summary does not duplicate domain-table logic', !attention.includes(".from('hc_") && !attention.includes('from("hc_'));
check('push tap treats notification id as opaque identity', context.includes('responseNotificationId') && !context.includes('data.applicationId') && !context.includes('data.route_key'));
check('push route is resolved server-side before navigation', context.includes('resolveNotificationRoute(pinned.client, notificationId)') && context.includes('nativeNotificationHref(route, notificationId)'));
check('notification is marked read through canonical RPC path', context.includes('markNotificationRead(pinned.client, notificationId)'));
check('cold-start notification response is recovered', context.includes('getLastNotificationResponseAsync'));
check('live notification response listener is installed', context.includes('addNotificationResponseReceivedListener'));
check('foreground push is only a canonical invalidation signal', context.includes('addNotificationReceivedListener') && context.includes('reconcileCanonicalState'));
check('periodic fallback runs only while app is active', context.includes("AppState.currentState !== 'active'") && context.includes('60_000'));
check('exact unread count drives OS badge through quarantine wrapper', context.includes('setCandidateNotificationBadgeCount(unreadCount)') && !context.includes('Notifications.setBadgeCountAsync('));
check('handled responses clear OS last-response through wrapper', context.includes('clearCandidateLastNotificationResponse()') && !context.includes('Notifications.clearLastNotificationResponseAsync('));
check('quarantined push bind is not surfaced as a normal registration error', context.includes('isPushBindingQuarantinedError'));
check('canonical notification refresh does not write business tables', !context.includes(".from('hc_applications')") && !context.includes(".from('hc_visit_reservations')") && !context.includes(".from('hc_interviews')"));

const failed = checks.filter(([, ok]) => !ok);
for (const [label, ok] of checks) console.log(`${ok ? 'PASS' : 'FAIL'}: ${label}`);
if (failed.length) {
  console.error(`Native notification context core contract failed (${checks.length - failed.length}/${checks.length}).`);
  process.exit(1);
}
console.log(`Native notification context core contract PASS (${checks.length}/${checks.length})`);
