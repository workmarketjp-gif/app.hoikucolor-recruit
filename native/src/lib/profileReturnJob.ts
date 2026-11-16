/** A profile save only returns to the job after a verified same-session canonical reread.
 * A query parameter is a navigation hint and never starts an application.
 */
export function confirmedProfileReturnJobId(options: {
  requestedJobId: string | null;
  currentJobId: string | null;
  saveOwnerKey: string | null;
  currentOwnerKey: string | null;
  canonicalConfirmed: boolean;
  unchangedDraft: boolean;
  sessionCurrent: boolean;
  privateAvailable: boolean;
}): string | null {
  const { requestedJobId, currentJobId, saveOwnerKey, currentOwnerKey,
    canonicalConfirmed, unchangedDraft, sessionCurrent, privateAvailable } = options;
  if (!requestedJobId || requestedJobId !== currentJobId ||
      !saveOwnerKey || saveOwnerKey !== currentOwnerKey ||
      !canonicalConfirmed || !unchangedDraft || !sessionCurrent || !privateAvailable) return null;
  return requestedJobId;
}
