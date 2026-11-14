/**
 * Web NotificationCenter defers a message_received notification's read state
 * to the application message panel. The panel's candidate-owned RPC only
 * acknowledges it once the facility message is actually visible.
 *
 * Accept only a server-resolved, candidate-owned message route and the exact
 * Native in-app message focus target. Neither an untrusted push payload nor a
 * notification link_url may authorize skipping the normal mark-read path.
 */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type ResolvedNotificationReadRoute = Readonly<{
  route_key: string;
  notification_type: string;
  route_params?: Record<string, string>;
}>;

export function shouldDeferMessageNotificationRead(
  route: ResolvedNotificationReadRoute,
  target: string,
): boolean {
  if (route.notification_type !== 'message_received' ||
      route.route_key !== 'application_messages') return false;
  const applicationId = route.route_params?.applicationId;
  if (typeof applicationId !== 'string' || !UUID_PATTERN.test(applicationId)) return false;
  const [path, query] = target.split('?', 2);
  return path === `/application/${applicationId}` &&
    new URLSearchParams(query ?? '').get('focus') === 'messages';
}
