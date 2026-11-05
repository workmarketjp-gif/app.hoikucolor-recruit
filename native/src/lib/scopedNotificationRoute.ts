/**
 * Route params from hc_jobseeker_resolve_notification_route_v1 have already
 * passed the canonical server-side recipient and event ownership checks.
 * Never use an untrusted push payload or Web link_url for private navigation.
 */
export type ScopedNotificationRoute = {
  route_key: string;
  route_params: Record<string, unknown> | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function verifiedNotificationId(value: unknown): string | null {
  return typeof value === 'string' && UUID.test(value) ? value : null;
}

export function scopedNotificationHref(route: ScopedNotificationRoute): string | null {
  const params = route.route_params;
  if (route.route_key === 'scouts') {
    const scoutId = verifiedNotificationId(params?.scoutId);
    return scoutId ? `/scouts?scoutId=${encodeURIComponent(scoutId)}` : null;
  }
  if (route.route_key === 'spot_assignments') {
    const spotAssignmentId = verifiedNotificationId(params?.spotAssignmentId);
    return spotAssignmentId ? `/spot-jobs?assignmentId=${encodeURIComponent(spotAssignmentId)}` : null;
  }
  return null;
}

/** A missing or invalid route parameter cannot be used to select other records. */
export function verifiedFocusId(value: string | string[] | undefined): string | null {
  return verifiedNotificationId(typeof value === 'string' ? value : null);
}

export function focusedOwnedItem<T>(rows: readonly T[], id: string | null, getId: (row: T) => string): T | null {
  return id ? rows.find((row) => getId(row) === id) ?? null : null;
}
