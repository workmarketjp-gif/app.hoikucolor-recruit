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

/** Reject a present malformed optional notification focus identity before read. */
export function verifiedOptionalNotificationFocusId(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const id = verifiedNotificationId(value);
  if (!id) throw new Error('NOTIFICATION_TARGET_UNAVAILABLE');
  return id;
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

/**
 * Candidate-owned application notifications must have a precise, valid target.
 * A missing/malformed applicationId must not quietly fall back to the generic
 * notification list after the caller has already marked the item as read.
 * Both the push and in-app card flows call this through nativeNotificationHref
 * before beginning any mark-read RPC. Authorization remains server-side.
 */
export function verifiedApplicationNotificationId(route: ScopedNotificationRoute): string | null {
  if (route.route_key !== 'application_messages' &&
      route.route_key !== 'application_interview' &&
      route.route_key !== 'application_detail') return null;
  const id = verifiedNotificationId(route.route_params?.applicationId);
  if (!id) throw new Error('NOTIFICATION_TARGET_UNAVAILABLE');
  return id;
}

/** A missing or invalid route parameter cannot be used to select other records. */
export function verifiedFocusId(value: string | string[] | undefined): string | null {
  return verifiedNotificationId(typeof value === 'string' ? value : null);
}

export function focusedOwnedItem<T>(rows: readonly T[], id: string | null, getId: (row: T) => string): T | null {
  return id ? rows.find((row) => getId(row) === id) ?? null : null;
}
