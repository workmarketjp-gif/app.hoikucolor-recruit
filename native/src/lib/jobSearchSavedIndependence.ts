import { boundedPrivateRead } from './privateReadDeadline.ts';

/**
 * The Web job search does not make discovery depend on the separate saved-heart
 * resource.  The candidate-private saved IDs must still be canonical before
 * any heart is actionable. A failed, malformed or delayed saved-ID response is
 * UNKNOWN (null), never an invented empty list and never an enabled heart.
 *
 * This is a presentation deadline only; it neither cancels nor retries the
 * underlying authenticated read. Its eventual resolution cannot mutate UI.
 */
export async function loadSavedJobIdsForSearch(
  readSavedIds: () => Promise<string[]>,
  deadlineMs = 5_000,
): Promise<string[] | null> {
  try {
    const ids = await boundedPrivateRead(readSavedIds, deadlineMs);
    if (!Array.isArray(ids) ||
        !ids.every((id) => typeof id === 'string' &&
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))) {
      return null;
    }
    // Do not imply a verified set when a corrupted/noncanonical adapter
    // supplies duplicate IDs. The RPC adapter normally deduplicates itself.
    if (new Set(ids.map((id) => id.toLowerCase())).size !== ids.length) return null;
    return [...ids];
  } catch {
    return null;
  }
}
