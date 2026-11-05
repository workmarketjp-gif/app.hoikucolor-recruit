/** A scout inbox read is publishable only for the same active, authorized candidate. */
export type ScoutReadLease = {
  expectedOwnerKey: string | null;
  resolvedOwnerKey: string | null;
  requestGeneration: number;
  activeGeneration: number;
  sessionCurrent: boolean;
  privateAccess: boolean;
};

export function shouldPublishScoutRead(lease: ScoutReadLease): boolean {
  return typeof lease.expectedOwnerKey === 'string'
    && lease.expectedOwnerKey.length > 0
    && lease.resolvedOwnerKey === lease.expectedOwnerKey
    && lease.requestGeneration === lease.activeGeneration
    && Number.isSafeInteger(lease.requestGeneration)
    && lease.sessionCurrent
    && lease.privateAccess;
}

/** Never display an error from a prior candidate while the next user is loading. */
export function mayShowScoutError(
  ownerKey: string | null,
  errorOwnerKey: string | null,
  privateAccess: boolean,
): boolean {
  return privateAccess && typeof ownerKey === 'string' && ownerKey.length > 0
    && errorOwnerKey === ownerKey;
}
