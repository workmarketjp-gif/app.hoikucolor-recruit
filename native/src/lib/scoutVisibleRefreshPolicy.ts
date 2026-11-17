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
/** Amend only the original partial-load notice after canonical inbox recovery. */
export function scoutNoticeAfterInboxRecovery(
  previous: string | null,
  privacyVerified: boolean,
  preferencesVerified: boolean,
): string | null {
  if (!previous || !previous.includes('届いたスカウト') ||
      !previous.endsWith(initialPartialScoutFailureSuffix)) return previous;
  const stillMissing = [
    !privacyVerified ? '公開範囲' : null,
    !preferencesVerified ? '希望条件' : null,
  ].filter(Boolean);
  return stillMissing.length ? `${stillMissing.join('・')}${initialPartialScoutFailureSuffix}` : null;
}
