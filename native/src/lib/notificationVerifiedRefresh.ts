/**
 * Keep a previously verified notification list during a same-Clerk-session
 * canonical refresh. This is presentation retention only: it never authorizes
 * a mark-read mutation and is revoked by App Lock, logout or owner change.
 * A first read (or a new session) must not show a prior candidate's rows.
 */
export function canRetainVerifiedNotificationSnapshot(options: Readonly<{
  ownerKey: string | null;
  verifiedOwnerKey: string | null;
  privateAllowed: boolean;
}>): boolean {
  return options.privateAllowed && options.ownerKey !== null &&
    options.verifiedOwnerKey === options.ownerKey;
}
