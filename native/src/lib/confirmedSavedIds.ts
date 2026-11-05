/** A mutation response is not proof of a saved heart; verify the authoritative IDs. */
export function assertSavedJobReadback(
  jobId: string,
  expectedSaved: boolean,
  canonicalIds: readonly string[],
): readonly string[] {
  if (canonicalIds.includes(jobId) !== expectedSaved) {
    throw new Error('SAVED_JOB_READBACK_MISMATCH');
  }
  return canonicalIds;
}
