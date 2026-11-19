/**
 * A previous same-session application index may remain visible after a failed
 * explicit refresh, but its rows must not grant navigation until the canonical
 * index is revalidated. Server RLS still authorizes the detail read itself.
 *
 * A focus transition, candidate switch or App Lock revokes the display lease.
 * Re-validation failure is distinct from a legitimate empty [] index.
 */
export function canOpenVerifiedApplicationList(options: {
  listPresent: boolean;
  expectedOwnerKey: string | null;
  freshlyVerifiedOwnerKey: string | null;
  privateAllowed: boolean;
  readPending: boolean;
  readFailed: boolean;
}): boolean {
  return options.listPresent && options.privateAllowed &&
    options.expectedOwnerKey !== null &&
    options.freshlyVerifiedOwnerKey === options.expectedOwnerKey &&
    !options.readPending && !options.readFailed;
}
