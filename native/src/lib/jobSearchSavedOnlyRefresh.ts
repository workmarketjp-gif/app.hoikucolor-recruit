import { readCandidateJobDiscoveryBounded } from './jobDiscoveryCanonicalRead.ts';
import { loadSavedJobIdsForSearch } from './jobSearchSavedIndependence.ts';

/**
 * Recover only canonical saved IDs following an ambiguous heart write/read.
 * Do not replace verified search rows, cursor, filters or count.
 * A null read means UNKNOWN, never a verified empty saved set.
 * The screen must separately gate publication by generation and owner.
 */
export async function readCandidateSavedIdsOnly<TPinned extends { isCurrent: () => boolean }>(options: {
  pin: () => Promise<TPinned | null>;
  readSavedIds: (pinned: TPinned) => Promise<string[]>;
  isCurrent: () => boolean;
  ownsPin: (pinned: TPinned) => boolean;
  timeoutMs?: number;
  savedIdsDeadlineMs?: number;
}): Promise<{ pinned: TPinned; value: string[] | null }> {
  return readCandidateJobDiscoveryBounded({
    pin: options.pin,
    isCurrent: options.isCurrent,
    ownsPin: options.ownsPin,
    timeoutMs: options.timeoutMs,
    read: (pinned) => loadSavedJobIdsForSearch(
      () => options.readSavedIds(pinned), options.savedIdsDeadlineMs,
    ),
  });
}
