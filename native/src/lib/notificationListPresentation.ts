/** Owner-scoped canonical rows and unread count must agree before all-read/empty claims. */
export type CandidateNotificationEmptyState = 'hidden' | 'confirmed_empty' | 'inconsistent';
export function candidateNotificationEmptyPresentation(state: Readonly<{
  loaded: boolean; loading: boolean; visibleCount: number;
  unreadCount: number | null; hasCanonicalError: boolean;
}>): CandidateNotificationEmptyState {
  if (!state.loaded || state.loading || state.hasCanonicalError || state.visibleCount !== 0) return 'hidden';
  if (!Number.isSafeInteger(state.unreadCount) || state.unreadCount === null || state.unreadCount < 0) return 'hidden';
  return state.unreadCount === 0 ? 'confirmed_empty' : 'inconsistent';
}

export type CandidateNotificationCountPresentation = Readonly<{kind: 'unavailable' | 'inconsistent' | 'all_read' | 'unread'; label: string;}>;
export function candidateNotificationCountPresentation(state: Readonly<{
  loaded: boolean; loading: boolean; hasCanonicalError: boolean;
  visibleCount: number; visibleUnreadCount: number; unreadCount: number | null;
}>): CandidateNotificationCountPresentation {
  if (state.hasCanonicalError) return {kind:'unavailable',label:'未読件数を確認できません'};
  if (!state.loaded || state.loading) return {kind:'unavailable',label:'通知を確認中…'};
  if (state.unreadCount === null ||
      !Number.isSafeInteger(state.unreadCount) || state.unreadCount < 0 ||
      !Number.isSafeInteger(state.visibleCount) || state.visibleCount < 0 ||
      !Number.isSafeInteger(state.visibleUnreadCount) || state.visibleUnreadCount < 0 ||
      state.visibleUnreadCount > state.visibleCount) {
    return {kind:'unavailable',label:'未読件数を確認できません'};
  }
  if (state.visibleUnreadCount > state.unreadCount ||
      (state.visibleCount === 0 && state.unreadCount > 0)) return {kind:'inconsistent',label:'通知情報を再確認してください'};
  if (state.unreadCount === 0) return {kind:'all_read',label:'すべて確認済み'};
  return {kind:'unread',label:'未読 '+String(state.unreadCount)+'件'};
}
