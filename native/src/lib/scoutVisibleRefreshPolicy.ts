/** Keep the Web's 60-second visible Scout Inbox refresh without polling a
 * backgrounded, locked or unverified Native candidate view. Read-only policy:
 * the actual RPC, pinned session and RLS remain authoritative. */
export const SCOUT_VISIBLE_REFRESH_MS = 60_000;

export type ScoutVisibleRefreshState = Readonly<{
  appActive: boolean;
  privateAllowed: boolean;
  ownerKey: string | null;
  verifiedOwnerKey: string | null;
  scoutsVerified: boolean;
  loading: boolean;
  busy: boolean;
  writePending: boolean;
  searchPending: boolean;
  refreshPending: boolean;
}>;

export function mayRefreshVisibleScoutInbox(state: ScoutVisibleRefreshState): boolean {
  return state.appActive && state.privateAllowed
    && typeof state.ownerKey === 'string' && state.ownerKey.length > 0
    && state.verifiedOwnerKey === state.ownerKey
    && state.scoutsVerified && !state.loading && !state.busy
    && !state.writePending && !state.searchPending && !state.refreshPending;
}
/** Recover a failed inbox when a separately verified panel already proves the
 * exact private candidate owner. This does NOT mark the inbox verified. */
export function mayRecoverUnverifiedScoutInbox(state: ScoutVisibleRefreshState): boolean {
  return !state.scoutsVerified && mayRefreshVisibleScoutInbox({ ...state, scoutsVerified: true });
}

const initialPartialScoutFailureSuffix = 'を確認できませんでした。確認できた項目のみ表示しています。再読み込みしてください。';
const retryPartialScoutFailureSuffix = 'を確認できませんでした。確認済みの入力内容は保持しています。';

/**
 * A quiet canonical inbox recovery may follow either the initial independent
 * load or the explicit missing-section retry. Only reconcile an exact
 * known partial-read notice: never alter unrelated write/privacy errors.
 */
export function scoutNoticeAfterInboxRecovery(
  previous: string | null,
  privacyVerified: boolean,
  preferencesVerified: boolean,
): string | null {
  if (!previous) return previous;
  const recognizedPrefixes = new Set([
    '届いたスカウト',
    '届いたスカウト・公開範囲',
    '届いたスカウト・希望条件',
    '届いたスカウト・公開範囲・希望条件',
  ]);
  const suffix = [initialPartialScoutFailureSuffix, retryPartialScoutFailureSuffix]
    .find((candidate) => previous.endsWith(candidate) &&
      recognizedPrefixes.has(previous.slice(0, -candidate.length)));
  if (!suffix) return previous;
  const stillMissing = [
    !privacyVerified ? '公開範囲' : null,
    !preferencesVerified ? '希望条件' : null,
  ].filter(Boolean);
  return stillMissing.length ? `${stillMissing.join('・')}${suffix}` : null;
}
