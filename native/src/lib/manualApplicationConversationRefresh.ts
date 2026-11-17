import {
  canStartFocusedApplicationDocumentsRefresh,
  type FocusedApplicationDocumentsRefreshState,
} from './focusedApplicationDocumentsRefresh.ts';

/**
 * The Web's manual 更新 reloads messages AND the opened application-document
 * panel. Consume each request once, never polling a closed/private panel or
 * bypassing an in-flight document read or submission. The caller must mark
 * the request consumed even when skipped, so opening the panel later does not
 * replay a stale command; its ordinary open path performs the fresh read.
 */
export function shouldRefreshOpenedApplicationDocuments(
  requestId: number,
  lastConsumedRequestId: number,
  state: FocusedApplicationDocumentsRefreshState,
  readPending: boolean,
): boolean {
  return Number.isSafeInteger(requestId) && requestId > 0 &&
    Number.isSafeInteger(lastConsumedRequestId) && requestId > lastConsumedRequestId &&
    canStartFocusedApplicationDocumentsRefresh(state, readPending);
}
