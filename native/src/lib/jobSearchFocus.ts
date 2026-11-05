/** Revalidate only after returning to the same signed-in candidate's search tab. */
export type JobSearchFocusState = Readonly<{
  ownerKey: string | null;
  hasBlurred: boolean;
}>;

export function shouldRefreshJobsOnReturn(
  previous: JobSearchFocusState,
  nextOwnerKey: string | null,
  canRead: boolean,
): boolean {
  return previous.hasBlurred && Boolean(nextOwnerKey) &&
    previous.ownerKey === nextOwnerKey && canRead;
}
