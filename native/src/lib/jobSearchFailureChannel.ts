/**
 * Distinguish a failed first/filter search from a failed subsequent page.
 * The latter must not turn the already confirmed result list into an error or
 * a loading placeholder. Never commit a failed request across owners, locks,
 * or an invalidated generation.
 */
export type JobSearchFailureChannel = 'initial' | 'pagination' | null;

export function jobSearchFailureChannel(input: {
  reset: boolean;
  owner: string | null;
  requestedOwner: string | null;
  requestGeneration: number;
  currentGeneration: number;
  privateAllowed: boolean;
  hasConfirmedResults: boolean;
  hasConfirmedBookmarks: boolean;
  /** Only for job searches whose canonical bookmarked IDs are independently optional. */
  bookmarksOptional?: boolean;
}): JobSearchFailureChannel {
  if (!input.owner || input.owner !== input.requestedOwner ||
      input.requestGeneration !== input.currentGeneration || !input.privateAllowed) return null;
  return !input.reset && input.hasConfirmedResults &&
    (input.hasConfirmedBookmarks || input.bookmarksOptional === true)
    ? 'pagination' : 'initial';
}
